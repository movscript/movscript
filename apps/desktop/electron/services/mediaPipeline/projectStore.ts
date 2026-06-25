import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

import type { MediaPipelineEditingProject, MediaPipelineEditingProjectEvent } from './types'
import { stableMediaWorkspacePathPart } from './pathPart'

export interface MediaPipelineProjectStoreResult {
  status: 'ok'
  editingProject: MediaPipelineEditingProject
  editing_project: MediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export interface MediaPipelineProjectConflictResult {
  status: 'conflict'
  code: 'EDITING_PROJECT_REVISION_CONFLICT'
  message: string
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  expectedRevision?: number
  expected_revision?: number
  currentRevision?: number
  current_revision?: number
  editingProject: MediaPipelineEditingProject
  editing_project: MediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export interface MediaPipelineProjectNotFoundResult {
  status: 'not_found'
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  projectPath: string
  project_path: string
}

export type MediaPipelineProjectDeleteResult =
  | {
    status: 'ok'
    projectId: string
    project_id: string
    editingProjectId: string
    editing_project_id: string
    projectPath: string
    project_path: string
  }
  | MediaPipelineProjectNotFoundResult

export type MediaPipelineProjectGetResult = MediaPipelineProjectStoreResult | MediaPipelineProjectNotFoundResult
export type MediaPipelineProjectSaveResult = MediaPipelineProjectStoreResult | MediaPipelineProjectConflictResult
export type MediaPipelineProjectListResult = {
  status: 'ok'
  projects: MediaPipelineProjectStoreResult[]
  editingProjects: MediaPipelineEditingProject[]
  editing_projects: MediaPipelineEditingProject[]
}

export const STANDALONE_MEDIA_EDITING_PROJECT_ID = 'standalone'

const projectEventListeners = new Set<(event: MediaPipelineEditingProjectEvent) => void>()

export function onMediaPipelineEditingProjectEvent(listener: (event: MediaPipelineEditingProjectEvent) => void): () => void {
  projectEventListeners.add(listener)
  return () => {
    projectEventListeners.delete(listener)
  }
}

export async function saveMediaPipelineEditingProject(
  editingProject: MediaPipelineEditingProject,
  options: { homeDir: string; expectedRevision?: number },
): Promise<MediaPipelineProjectSaveResult> {
  const storedProject = normalizeStandaloneEditingProject(editingProject)
  assertMediaPipelineEditingProject(storedProject, 'save request')
  const projectPath = editingProjectPath({
    homeDir: options.homeDir,
    editingProjectId: storedProject.id,
  })
  if (options.expectedRevision !== undefined) {
    const current = await readStoredEditingProjectForPath(projectPath)
    if (current && current.editingProject.revision !== options.expectedRevision) {
      return {
        status: 'conflict',
        code: 'EDITING_PROJECT_REVISION_CONFLICT',
        message: `Media editing project revision conflict: expected ${options.expectedRevision}, found ${current.editingProject.revision ?? 'unknown'}`,
        projectId: storedProject.projectId,
        project_id: storedProject.projectId,
        editingProjectId: storedProject.id,
        editing_project_id: storedProject.id,
        expectedRevision: options.expectedRevision,
        expected_revision: options.expectedRevision,
        currentRevision: current.editingProject.revision,
        current_revision: current.editingProject.revision,
        editingProject: current.editingProject,
        editing_project: current.editingProject,
        projectPath: current.projectPath,
        project_path: current.projectPath,
      }
    }
  }
  await mkdir(dirname(projectPath), { recursive: true })
  await writeFile(projectPath, `${JSON.stringify({
    schema: 'movscript.media_editing_project.v1',
    editingProject: storedProject,
  }, null, 2)}\n`)
  const result = {
    status: 'ok',
    editingProject: storedProject,
    editing_project: storedProject,
    projectPath,
    project_path: projectPath,
  } satisfies MediaPipelineProjectStoreResult
  emitEditingProjectEvent({
    type: 'saved',
    projectId: storedProject.projectId,
    project_id: storedProject.projectId,
    editingProjectId: storedProject.id,
    editing_project_id: storedProject.id,
    revision: storedProject.revision,
    editingProject: storedProject,
    editing_project: storedProject,
    projectPath,
    project_path: projectPath,
  })
  return result
}

export async function getMediaPipelineEditingProject(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
): Promise<MediaPipelineProjectGetResult> {
  const projectPath = editingProjectPath({
    homeDir: options.homeDir,
    editingProjectId: input.editingProjectId,
  })
  const readResult = await readProjectStoreFile(projectPath)
  if (!readResult) {
    return {
      status: 'not_found',
      projectId: STANDALONE_MEDIA_EDITING_PROJECT_ID,
      project_id: STANDALONE_MEDIA_EDITING_PROJECT_ID,
      editingProjectId: input.editingProjectId,
      editing_project_id: input.editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  }
  const parsed = JSON.parse(readResult.text) as { editingProject?: MediaPipelineEditingProject; editing_project?: MediaPipelineEditingProject }
  const editingProject = parsed.editingProject ?? parsed.editing_project
  assertMediaPipelineEditingProject(editingProject, readResult.projectPath)
  if (String(editingProject.projectId) !== STANDALONE_MEDIA_EDITING_PROJECT_ID || String(editingProject.id) !== String(input.editingProjectId)) {
    throw new Error(`Media editing project identity mismatch: ${readResult.projectPath}`)
  }
  return {
    status: 'ok',
    editingProject,
    editing_project: editingProject,
    projectPath: readResult.projectPath,
    project_path: readResult.projectPath,
  }
}

export async function listMediaPipelineEditingProjects(
  options: { homeDir: string },
): Promise<MediaPipelineProjectListResult> {
  const projectsDir = editingProjectsDir(options.homeDir)
  const entries = await readdir(projectsDir, { withFileTypes: true }).catch((error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
    throw error
  })
  const projects: MediaPipelineProjectStoreResult[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const projectPath = join(projectsDir, entry.name)
    const stored = await readStoredEditingProjectForPath(projectPath)
    if (!stored) continue
    if (stored.editingProject.projectId !== STANDALONE_MEDIA_EDITING_PROJECT_ID) {
      throw new Error(`Media editing project identity mismatch: ${projectPath}`)
    }
    projects.push({
      status: 'ok',
      editingProject: stored.editingProject,
      editing_project: stored.editingProject,
      projectPath: stored.projectPath,
      project_path: stored.projectPath,
    })
  }
  projects.sort((left, right) => {
    const leftTime = Date.parse(left.editingProject.updatedAt ?? '')
    const rightTime = Date.parse(right.editingProject.updatedAt ?? '')
    const leftSort = Number.isFinite(leftTime) ? leftTime : 0
    const rightSort = Number.isFinite(rightTime) ? rightTime : 0
    return rightSort - leftSort || left.editingProject.id.localeCompare(right.editingProject.id)
  })
  const editingProjects = projects.map((project) => project.editingProject)
  return {
    status: 'ok',
    projects,
    editingProjects,
    editing_projects: editingProjects,
  }
}

export async function deleteMediaPipelineEditingProject(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
): Promise<MediaPipelineProjectDeleteResult> {
  const projectPath = editingProjectPath({
    homeDir: options.homeDir,
    editingProjectId: input.editingProjectId,
  })
  const deleted = await unlink(projectPath).then(
    () => true,
    (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false
      throw error
    },
  )
  if (!deleted) {
    return {
      status: 'not_found',
      projectId: STANDALONE_MEDIA_EDITING_PROJECT_ID,
      project_id: STANDALONE_MEDIA_EDITING_PROJECT_ID,
      editingProjectId: input.editingProjectId,
      editing_project_id: input.editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  }
  return {
    status: 'ok',
    projectId: STANDALONE_MEDIA_EDITING_PROJECT_ID,
    project_id: STANDALONE_MEDIA_EDITING_PROJECT_ID,
    editingProjectId: input.editingProjectId,
    editing_project_id: input.editingProjectId,
    projectPath,
    project_path: projectPath,
  }
}

async function readProjectStoreFile(projectPath: string): Promise<{ projectPath: string; text: string } | undefined> {
  const text = await readFile(projectPath, 'utf8').catch((error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  })
  return text === undefined ? undefined : { projectPath, text }
}

async function readStoredEditingProjectForPath(projectPath: string): Promise<{ projectPath: string; editingProject: MediaPipelineEditingProject } | undefined> {
  const readResult = await readProjectStoreFile(projectPath)
  if (!readResult) return undefined
  const parsed = JSON.parse(readResult.text) as { editingProject?: MediaPipelineEditingProject; editing_project?: MediaPipelineEditingProject }
  const editingProject = parsed.editingProject ?? parsed.editing_project
  assertMediaPipelineEditingProject(editingProject, readResult.projectPath)
  return { projectPath: readResult.projectPath, editingProject }
}

function emitEditingProjectEvent(event: MediaPipelineEditingProjectEvent): void {
  for (const listener of Array.from(projectEventListeners)) listener(event)
}

function normalizeStandaloneEditingProject(editingProject: MediaPipelineEditingProject): MediaPipelineEditingProject {
  return {
    ...editingProject,
    projectId: STANDALONE_MEDIA_EDITING_PROJECT_ID,
  }
}

function editingProjectsDir(homeDir: string): string {
  return join(
    homeDir,
    'media-workspaces',
    stableMediaWorkspacePathPart(STANDALONE_MEDIA_EDITING_PROJECT_ID),
    'projects',
  )
}

function editingProjectPath(input: {
  homeDir: string
  editingProjectId: string
}): string {
  return join(
    editingProjectsDir(input.homeDir),
    `${stableMediaWorkspacePathPart(input.editingProjectId)}.json`,
  )
}

function assertMediaPipelineEditingProject(value: unknown, projectPath: string): asserts value is MediaPipelineEditingProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid media editing project file: ${projectPath}`)
  }
  const project = value as Partial<MediaPipelineEditingProject>
  if (project.version !== 1 || !project.id || !project.projectId) {
    throw new Error(`Invalid media editing project file: ${projectPath}`)
  }
  if (!project.timeline || typeof project.timeline !== 'object' || Array.isArray(project.timeline) || project.timeline.version !== 1 || !Array.isArray(project.timeline.tracks)) {
    throw new Error(`Invalid media editing project file: ${projectPath}`)
  }
  if (!project.assets || typeof project.assets !== 'object' || Array.isArray(project.assets) || !Array.isArray(project.assets.assets)) {
    throw new Error(`Invalid media editing project file: ${projectPath}`)
  }
}

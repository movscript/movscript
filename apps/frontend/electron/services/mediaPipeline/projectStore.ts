import { mkdir, readFile, writeFile } from 'fs/promises'
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

export type MediaPipelineProjectGetResult = MediaPipelineProjectStoreResult | MediaPipelineProjectNotFoundResult
export type MediaPipelineProjectSaveResult = MediaPipelineProjectStoreResult | MediaPipelineProjectConflictResult

const projectEventListeners = new Set<(event: MediaPipelineEditingProjectEvent) => void>()

export function onMediaPipelineEditingProjectEvent(listener: (event: MediaPipelineEditingProjectEvent) => void): () => void {
  projectEventListeners.add(listener)
  return () => {
    projectEventListeners.delete(listener)
  }
}

export async function saveMediaPipelineEditingProject(
  editingProject: MediaPipelineEditingProject,
  options: { userDataDir: string; expectedRevision?: number },
): Promise<MediaPipelineProjectSaveResult> {
  assertMediaPipelineEditingProject(editingProject, 'save request')
  const projectPath = editingProjectPath({
    userDataDir: options.userDataDir,
    projectId: editingProject.projectId,
    editingProjectId: editingProject.id,
  })
  if (options.expectedRevision !== undefined) {
    const current = await readStoredEditingProjectForPath(projectPath)
      ?? await readStoredEditingProjectForPath(legacyEditingProjectPath({
        userDataDir: options.userDataDir,
        projectId: editingProject.projectId,
        editingProjectId: editingProject.id,
      }))
    if (current && current.editingProject.revision !== options.expectedRevision) {
      return {
        status: 'conflict',
        code: 'EDITING_PROJECT_REVISION_CONFLICT',
        message: `Media editing project revision conflict: expected ${options.expectedRevision}, found ${current.editingProject.revision ?? 'unknown'}`,
        projectId: editingProject.projectId,
        project_id: editingProject.projectId,
        editingProjectId: editingProject.id,
        editing_project_id: editingProject.id,
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
    editingProject,
  }, null, 2)}\n`)
  const result = {
    status: 'ok',
    editingProject,
    editing_project: editingProject,
    projectPath,
    project_path: projectPath,
  } satisfies MediaPipelineProjectStoreResult
  emitEditingProjectEvent({
    type: 'saved',
    projectId: editingProject.projectId,
    project_id: editingProject.projectId,
    editingProjectId: editingProject.id,
    editing_project_id: editingProject.id,
    revision: editingProject.revision,
    editingProject,
    editing_project: editingProject,
    projectPath,
    project_path: projectPath,
  })
  return result
}

export async function getMediaPipelineEditingProject(
  input: { projectId: string; editingProjectId: string },
  options: { userDataDir: string },
): Promise<MediaPipelineProjectGetResult> {
  const projectPath = editingProjectPath({
    userDataDir: options.userDataDir,
    projectId: input.projectId,
    editingProjectId: input.editingProjectId,
  })
  const readResult = await readProjectStoreFile(projectPath)
    ?? await readProjectStoreFile(legacyEditingProjectPath({
      userDataDir: options.userDataDir,
      projectId: input.projectId,
      editingProjectId: input.editingProjectId,
    }))
  if (!readResult) {
    return {
      status: 'not_found',
      projectId: input.projectId,
      project_id: input.projectId,
      editingProjectId: input.editingProjectId,
      editing_project_id: input.editingProjectId,
      projectPath,
      project_path: projectPath,
    }
  }
  const parsed = JSON.parse(readResult.text) as { editingProject?: MediaPipelineEditingProject; editing_project?: MediaPipelineEditingProject }
  const editingProject = parsed.editingProject ?? parsed.editing_project
  assertMediaPipelineEditingProject(editingProject, readResult.projectPath)
  if (String(editingProject.projectId) !== String(input.projectId) || String(editingProject.id) !== String(input.editingProjectId)) {
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

function editingProjectPath(input: {
  userDataDir: string
  projectId: string
  editingProjectId: string
}): string {
  return join(
    input.userDataDir,
    'media-workspaces',
    stableMediaWorkspacePathPart(input.projectId),
    'projects',
    `${stableMediaWorkspacePathPart(input.editingProjectId)}.json`,
  )
}

function legacyEditingProjectPath(input: {
  userDataDir: string
  projectId: string
  editingProjectId: string
}): string {
  return join(
    input.userDataDir,
    'media-workspaces',
    legacySanitizedPathPart(input.projectId),
    'projects',
    `${legacySanitizedPathPart(input.editingProjectId)}.json`,
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

function legacySanitizedPathPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'default'
}

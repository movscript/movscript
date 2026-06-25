import type {
  EditingMediaPipelineTaskRequest,
  EditingRuntimeProjectGetResult,
  EditingRuntimeProjectSaveResult,
  EditingRuntimePort,
} from '@movscript/editing'
import {
  cancelMediaPipelineTask,
  createMediaPipelineTask,
  deleteMediaPipelineEditingProject,
  getMediaEditingProjectThroughEditingService,
  getMediaPipelineCapabilities,
  getMediaPipelineEditingProject,
  getMediaPipelineTask,
  getMediaPipelineTaskLogs,
  getStoredMediaPipelineTask,
  importMediaPipelineExportResource,
  listMediaPipelineEditingProjects,
  publishMediaPipelineHlsStream,
  saveMediaEditingProjectThroughEditingService,
  saveMediaPipelineEditingProject,
  saveMediaPipelineExportLocal,
  type MediaPipelineTaskRequest,
} from './mediaPipeline'
import { resolveMediaPipelineHomeDir, resolveMediaPipelineReadHomeDirs } from './mediaPipeline/home'
import type {
  MediaPipelineAssetDescriptor,
  MediaPipelineEditingProject,
  MediaPipelineTimelineRecipe,
} from './mediaPipeline/types'

export function createDesktopMediaPipelineRuntimePort(): EditingRuntimePort {
  return {
    getCapabilities: getMediaPipelineCapabilities,
    createTask: (input) => createMediaPipelineTask(toMediaPipelineTaskRequest(input), { homeDir: resolveMediaPipelineHomeDir() }),
    getTask: async (taskId, options) => getMediaPipelineTask(taskId)
      ?? (options?.projectId ? await getStoredMediaPipelineTaskFromReadHomeDirs({ projectId: options.projectId, taskId }) : undefined)
      ?? null,
    cancelTask: (taskId, options) => cancelMediaPipelineTaskFromReadHomeDirs(taskId, options?.projectId),
    getTaskLogs: (taskId, options) => getMediaPipelineTaskLogsFromReadHomeDirs(taskId, options?.projectId),
    saveProject: async (editingProject, options) => {
      const result = await saveMediaEditingProjectThroughEditingService(editingProject as unknown as MediaPipelineEditingProject, {
        homeDir: resolveMediaPipelineHomeDir(),
        expectedRevision: options?.expectedRevision,
      }) as EditingRuntimeProjectSaveResult
      return {
        ...result,
        editingProject: result.editingProject as unknown as Record<string, unknown>,
        editing_project: result.editing_project as unknown as Record<string, unknown>,
      }
    },
    getProject: async (input) => {
      const result = await getMediaEditingProjectThroughEditingService(input, {
        homeDir: resolveMediaPipelineHomeDir(),
      }) as EditingRuntimeProjectGetResult
      return result.status === 'ok'
        ? {
            ...result,
            editingProject: result.editingProject as unknown as Record<string, unknown>,
            editing_project: result.editing_project as unknown as Record<string, unknown>,
          }
        : result
    },
    importExportResource: (request) => importMediaPipelineExportResource(request),
    publishHlsStream: (request) => publishMediaPipelineHlsStream(request),
    saveLocalExport: (request) => saveMediaPipelineExportLocal(request),
  }
}

export async function getStoredMediaPipelineTaskFromReadHomeDirs(input: {
  projectId: string
  taskId: string
}) {
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const task = await getStoredMediaPipelineTask(input, { homeDir })
    if (task) return task
  }
  return undefined
}

export async function getMediaPipelineTaskFromReadHomeDirs(taskId: string, projectId: string | undefined) {
  return getMediaPipelineTask(taskId)
    ?? (projectId ? await getStoredMediaPipelineTaskFromReadHomeDirs({ projectId, taskId }) : undefined)
    ?? undefined
}

export function isMediaPipelineHlsOutput(task: unknown, outputPath: string): boolean {
  if (isRecord(task) && task.taskType === 'timeline_hls') return true
  return outputPath.toLowerCase().endsWith('.m3u8')
}

export async function getMediaPipelineTaskLogsFromReadHomeDirs(taskId: string, projectId: string | undefined) {
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const logs = await getMediaPipelineTaskLogs(taskId, { projectId, homeDir })
    if (logs.status === 'ok' || !projectId) return logs
  }
  return getMediaPipelineTaskLogs(taskId)
}

export async function cancelMediaPipelineTaskFromReadHomeDirs(taskId: string, projectId: string | undefined) {
  let notFoundError: unknown
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    try {
      return await cancelMediaPipelineTask(taskId, { projectId, homeDir })
    } catch (error) {
      if (!isMediaPipelineTaskNotFoundError(error, taskId)) throw error
      notFoundError = error
    }
  }
  throw notFoundError ?? new Error(`Media pipeline task not found: ${taskId}`)
}

export async function getMediaPipelineEditingProjectFromReadHomeDirs(input: {
  projectId?: string
  editingProjectId: string
}) {
  let notFoundResult: Awaited<ReturnType<typeof getMediaPipelineEditingProject>> | undefined
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const result = await getMediaPipelineEditingProject(input, { homeDir })
    if (result.status === 'ok') return result
    notFoundResult = notFoundResult ?? result
  }
  return notFoundResult ?? getMediaPipelineEditingProject(input, { homeDir: resolveMediaPipelineHomeDir() })
}

export async function listMediaPipelineEditingProjectsFromReadHomeDirs(): Promise<Awaited<ReturnType<typeof listMediaPipelineEditingProjects>>> {
  const projectsById = new Map<string, Awaited<ReturnType<typeof listMediaPipelineEditingProjects>>['projects'][number]>()
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const result = await listMediaPipelineEditingProjects({ homeDir })
    for (const project of result.projects) {
      const projectId = String(project.editingProject.id)
      if (!projectsById.has(projectId)) projectsById.set(projectId, project)
    }
  }
  const projects = Array.from(projectsById.values()).sort((left, right) => {
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

export async function deleteMediaPipelineEditingProjectFromReadHomeDirs(input: {
  projectId?: string
  editingProjectId: string
}) {
  let notFoundResult: Awaited<ReturnType<typeof deleteMediaPipelineEditingProject>> | undefined
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const result = await deleteMediaPipelineEditingProject(input, { homeDir })
    if (result.status === 'ok') return result
    notFoundResult = notFoundResult ?? result
  }
  return notFoundResult ?? deleteMediaPipelineEditingProject(input, { homeDir: resolveMediaPipelineHomeDir() })
}

function isMediaPipelineTaskNotFoundError(error: unknown, taskId: string): boolean {
  return error instanceof Error && error.message === `Media pipeline task not found: ${taskId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toMediaPipelineTaskRequest(input: EditingMediaPipelineTaskRequest): MediaPipelineTaskRequest {
  return {
    projectId: input.projectId,
    taskType: input.taskType,
    editingProject: input.editingProject as unknown as MediaPipelineEditingProject | undefined,
    timeline: input.timeline as unknown as MediaPipelineTimelineRecipe | undefined,
    source: input.source as MediaPipelineAssetDescriptor | undefined,
    target: input.target,
    mode: input.mode,
    reframe: input.reframe,
    transcode: input.transcode,
    resourceCache: input.resourceCache,
    resource_cache: input.resource_cache,
    resourceDownload: input.resourceDownload,
    resource_download: input.resource_download,
    output: input.output,
  }
}

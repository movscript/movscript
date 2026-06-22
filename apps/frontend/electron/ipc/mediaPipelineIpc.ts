import { BrowserWindow, ipcMain } from 'electron'
import { setEditingRuntimePort, type EditingMediaPipelineTaskRequest } from '@movscript/core/mcp/node'

import {
  cancelMediaPipelineTask,
  createMediaPipelineTask,
  deleteMediaPipelineEditingProject,
  getMediaPipelineCapabilities,
  getMediaPipelineEditingProject,
  getMediaPipelineTaskLogs,
  getMediaPipelineTask,
  getStoredMediaPipelineTask,
  listMediaPipelineEditingProjects,
  importMediaPipelineExportResource,
  onMediaPipelineEditingProjectEvent,
  onMediaPipelineTaskEvent,
  publishMediaPipelineHlsStream,
  saveMediaPipelineExportLocal,
  saveMediaPipelineEditingProject,
  type MediaPipelineTaskRequest,
} from '../services/mediaPipeline'
import { getMediaPipelineFFmpegStatus } from '../services/mediaPipeline/ffmpegProbe'
import { analyzeMediaPipelineShotCuts, type MediaPipelineShotCutInput } from '../services/mediaPipeline/shotCutAnalyzer'
import { renderMediaPipelineSingleClip } from '../services/mediaPipeline/singleClipRenderer'
import { renderMediaPipelineTimeline } from '../services/mediaPipeline/timelineRenderer'
import type { VideoClipInput, VideoTimelineExportInput } from '../services/mediaPipeline/timelineExportTypes'
import type {
  MediaPipelineAssetDescriptor,
  MediaPipelineEditingProject,
  MediaPipelineTimelineRecipe,
} from '../services/mediaPipeline/types'
import { resolveMediaPipelineHomeDir, resolveMediaPipelineReadHomeDirs } from '../services/mediaPipeline/home'

export function registerMediaPipelineIpcHandlers(): void {
  setEditingRuntimePort({
    getCapabilities: getMediaPipelineCapabilities,
    createTask: (input) => createMediaPipelineTask(toMediaPipelineTaskRequest(input), { homeDir: resolveMediaPipelineHomeDir() }),
    getTask: async (taskId, options) => getMediaPipelineTask(taskId)
      ?? (options?.projectId ? await getStoredMediaPipelineTaskFromReadHomeDirs({ projectId: options.projectId, taskId }) : undefined)
      ?? null,
    cancelTask: (taskId, options) => cancelMediaPipelineTaskFromReadHomeDirs(taskId, options?.projectId),
    getTaskLogs: (taskId, options) => getMediaPipelineTaskLogsFromReadHomeDirs(taskId, options?.projectId),
    saveProject: async (editingProject, options) => {
      const result = await saveMediaPipelineEditingProject(editingProject as unknown as MediaPipelineEditingProject, {
        homeDir: resolveMediaPipelineHomeDir(),
        expectedRevision: options?.expectedRevision,
      })
      if (result.status === 'conflict') {
        return {
          ...result,
          editingProject: result.editingProject as unknown as Record<string, unknown>,
          editing_project: result.editing_project as unknown as Record<string, unknown>,
        }
      }
      return {
        ...result,
        editingProject: result.editingProject as unknown as Record<string, unknown>,
        editing_project: result.editing_project as unknown as Record<string, unknown>,
      }
    },
    getProject: async (input) => {
      const result = await getMediaPipelineEditingProjectFromReadHomeDirs(input)
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
  })

  ipcMain.handle('media-pipeline:save-editing-project', async (_event, input?: {
    editingProject?: MediaPipelineEditingProject
    editing_project?: MediaPipelineEditingProject
    expectedRevision?: number
    expected_revision?: number
  }) => {
    const editingProject = input?.editingProject ?? input?.editing_project
    if (!editingProject) throw new Error('editingProject is required')
    return saveMediaPipelineEditingProject(editingProject, {
      homeDir: resolveMediaPipelineHomeDir(),
      expectedRevision: input?.expectedRevision ?? input?.expected_revision,
    })
  })

  ipcMain.handle('media-pipeline:get-editing-project', async (_event, input?: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => {
    const editingProjectId = input?.editingProjectId ?? input?.editing_project_id
    if (!editingProjectId) throw new Error('editingProjectId is required')
    return getMediaPipelineEditingProjectFromReadHomeDirs({ editingProjectId })
  })

  ipcMain.handle('media-pipeline:list-editing-projects', async () => {
    return listMediaPipelineEditingProjectsFromReadHomeDirs()
  })

  ipcMain.handle('media-pipeline:delete-editing-project', async (_event, input?: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => {
    const editingProjectId = input?.editingProjectId ?? input?.editing_project_id
    if (!editingProjectId) throw new Error('editingProjectId is required')
    return deleteMediaPipelineEditingProjectFromReadHomeDirs({ editingProjectId })
  })

  ipcMain.handle('media-pipeline:import-export-resource', async (_event, input?: {
    taskId?: string
    task_id?: string
    projectId?: string
    project_id?: string
    outputPath?: string
    output_path?: string
    filename?: string
    mimeType?: string
    mime_type?: string
    folderId?: string | number
    folder_id?: string | number
    derivative?: {
      operation: string
      tool?: string
      input_resource_ids?: number[]
      params?: Record<string, unknown>
    }
    operation?: string
    tool?: string
    inputResourceIds?: Array<string | number>
    input_resource_ids?: Array<string | number>
    sourceResourceId?: string | number
    source_resource_id?: string | number
    sourceResourceIds?: Array<string | number>
    source_resource_ids?: Array<string | number>
    params?: Record<string, unknown>
  }) => {
    if (!input) throw new Error('input is required')
    const taskId = input.taskId ?? input.task_id
    const projectId = input.projectId ?? input.project_id
    const task = taskId ? await getMediaPipelineTaskFromReadHomeDirs(taskId, projectId) : undefined
    const outputPath = input.outputPath ?? input.output_path ?? task?.outputPath
    if (!outputPath) {
      if (taskId) {
        return {
          status: task ? 'pending_output' : 'not_found',
          taskId,
          task_id: taskId,
          ...(task ? { task } : {}),
        }
      }
      throw new Error('outputPath or taskId is required')
    }
    if (isMediaPipelineHlsOutput(task, outputPath)) {
      return {
        status: 'unsupported_output',
        code: 'USE_EDITING_EXPORT_PUBLISH_HLS',
        message: 'Output is an HLS manifest. Use publishMediaHlsStream for HLS artifacts instead of importing it as a RawResource.',
        ...(taskId ? { taskId, task_id: taskId } : {}),
        outputPath,
        output_path: outputPath,
        ...(task ? { task } : {}),
      }
    }
    return importMediaPipelineExportResource({
      outputPath,
      output_path: outputPath,
      filename: input.filename ?? task?.outputName,
      mimeType: input.mimeType,
      mime_type: input.mime_type,
      folderId: input.folderId,
      folder_id: input.folder_id,
      derivative: input.derivative,
      operation: input.operation,
      tool: input.tool,
      inputResourceIds: input.inputResourceIds,
      input_resource_ids: input.input_resource_ids,
      sourceResourceId: input.sourceResourceId,
      source_resource_id: input.source_resource_id,
      sourceResourceIds: input.sourceResourceIds,
      source_resource_ids: input.source_resource_ids,
      params: input.params,
    })
  })

  ipcMain.handle('media-pipeline:save-export-local', async (_event, input?: {
    outputPath?: string
    output_path?: string
    savePath?: string
    save_path?: string
    saveDirectory?: string
    save_directory?: string
    hlsDirectory?: string
    hls_directory?: string
    segmentPaths?: string[]
    segment_paths?: string[]
    filename?: string
  }) => {
    if (!input) throw new Error('input is required')
    return saveMediaPipelineExportLocal({
      outputPath: input.outputPath ?? '',
      output_path: input.output_path,
      savePath: input.savePath,
      save_path: input.save_path,
      saveDirectory: input.saveDirectory,
      save_directory: input.save_directory,
      hlsDirectory: input.hlsDirectory,
      hls_directory: input.hls_directory,
      segmentPaths: input.segmentPaths,
      segment_paths: input.segment_paths,
      filename: input.filename,
    })
  })

  ipcMain.handle('media-pipeline:publish-hls-stream', async (_event, input?: {
    manifestPath?: string
    manifest_path?: string
    segmentPaths?: string[]
    segment_paths?: string[]
    taskId?: string
    task_id?: string
    title?: string
    projectId?: string | number
    project_id?: string | number
    sourceResourceId?: string | number
    source_resource_id?: string | number
    sourceDerivativeId?: string | number
    source_derivative_id?: string | number
    durationMs?: number
    duration_ms?: number
    width?: number
    height?: number
  }) => {
    if (!input) throw new Error('input is required')
    return publishMediaPipelineHlsStream({
      manifestPath: input.manifestPath ?? '',
      manifest_path: input.manifest_path,
      segmentPaths: input.segmentPaths,
      segment_paths: input.segment_paths,
      taskId: input.taskId,
      task_id: input.task_id,
      title: input.title,
      projectId: input.projectId,
      project_id: input.project_id,
      sourceResourceId: input.sourceResourceId,
      source_resource_id: input.source_resource_id,
      sourceDerivativeId: input.sourceDerivativeId,
      source_derivative_id: input.source_derivative_id,
      durationMs: input.durationMs,
      duration_ms: input.duration_ms,
      width: input.width,
      height: input.height,
    })
  })

  ipcMain.handle('media-pipeline:get-capabilities', async () => {
    return getMediaPipelineCapabilities()
  })

  ipcMain.handle('media-pipeline:get-ffmpeg-status', async () => {
    return getMediaPipelineFFmpegStatus()
  })

  ipcMain.handle('media-pipeline:render-single-clip', async (_event, input: VideoClipInput) => {
    return renderMediaPipelineSingleClip({ ...input, sourcePath: undefined })
  })

  ipcMain.handle('media-pipeline:render-timeline-video', async (_event, input: VideoTimelineExportInput) => {
    return renderMediaPipelineTimeline(input)
  })

  ipcMain.handle('media-pipeline:analyze-shot-cuts', async (_event, input: MediaPipelineShotCutInput) => {
    return analyzeMediaPipelineShotCuts(input)
  })

  ipcMain.handle('media-pipeline:create-task', async (_event, input: MediaPipelineTaskRequest) => {
    return createMediaPipelineTask(input, { homeDir: resolveMediaPipelineHomeDir() })
  })

  ipcMain.handle('media-pipeline:get-task', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return getMediaPipelineTask(taskId)
      ?? (projectId ? await getStoredMediaPipelineTaskFromReadHomeDirs({ projectId, taskId }) : undefined)
      ?? null
  })

  ipcMain.handle('media-pipeline:cancel-task', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return cancelMediaPipelineTaskFromReadHomeDirs(taskId, projectId)
  })

  ipcMain.handle('media-pipeline:get-task-logs', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return getMediaPipelineTaskLogsFromReadHomeDirs(taskId, projectId)
  })

  registerMediaPipelineTaskEventForwarder()
  registerMediaPipelineEditingProjectEventForwarder()
}

let taskEventForwarderRegistered = false

function registerMediaPipelineTaskEventForwarder(): void {
  if (taskEventForwarderRegistered) return
  taskEventForwarderRegistered = true
  onMediaPipelineTaskEvent((taskEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send('media-pipeline:task-event', taskEvent)
    }
  })
}

let editingProjectEventForwarderRegistered = false

function registerMediaPipelineEditingProjectEventForwarder(): void {
  if (editingProjectEventForwarderRegistered) return
  editingProjectEventForwarderRegistered = true
  onMediaPipelineEditingProjectEvent((projectEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send('media-pipeline:editing-project-event', projectEvent)
    }
  })
}

async function getStoredMediaPipelineTaskFromReadHomeDirs(input: {
  projectId: string
  taskId: string
}) {
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const task = await getStoredMediaPipelineTask(input, { homeDir })
    if (task) return task
  }
  return undefined
}

async function getMediaPipelineTaskFromReadHomeDirs(taskId: string, projectId: string | undefined) {
  return getMediaPipelineTask(taskId)
    ?? (projectId ? await getStoredMediaPipelineTaskFromReadHomeDirs({ projectId, taskId }) : undefined)
    ?? undefined
}

function isMediaPipelineHlsOutput(task: unknown, outputPath: string): boolean {
  if (isRecord(task) && task.taskType === 'timeline_hls') return true
  return outputPath.toLowerCase().endsWith('.m3u8')
}

async function getMediaPipelineTaskLogsFromReadHomeDirs(taskId: string, projectId: string | undefined) {
  for (const homeDir of resolveMediaPipelineReadHomeDirs()) {
    const logs = await getMediaPipelineTaskLogs(taskId, { projectId, homeDir })
    if (logs.status === 'ok' || !projectId) return logs
  }
  return getMediaPipelineTaskLogs(taskId)
}

async function cancelMediaPipelineTaskFromReadHomeDirs(taskId: string, projectId: string | undefined) {
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

async function getMediaPipelineEditingProjectFromReadHomeDirs(input: {
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

async function listMediaPipelineEditingProjectsFromReadHomeDirs(): Promise<Awaited<ReturnType<typeof listMediaPipelineEditingProjects>>> {
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

async function deleteMediaPipelineEditingProjectFromReadHomeDirs(input: {
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

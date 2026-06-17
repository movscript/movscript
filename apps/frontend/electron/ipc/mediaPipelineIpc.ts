import { app, BrowserWindow, ipcMain } from 'electron'
import { setEditingRuntimePort, type EditingMediaPipelineTaskRequest } from '@movscript/core/mcp/node'

import {
  cancelMediaPipelineTask,
  createMediaPipelineTask,
  getMediaPipelineCapabilities,
  getMediaPipelineEditingProject,
  getMediaPipelineTaskLogs,
  getMediaPipelineTask,
  getStoredMediaPipelineTask,
  importMediaPipelineExportResource,
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

export function registerMediaPipelineIpcHandlers(): void {
  setEditingRuntimePort({
    getCapabilities: getMediaPipelineCapabilities,
    createTask: (input) => createMediaPipelineTask(toMediaPipelineTaskRequest(input), { userDataDir: app.getPath('userData') }),
    getTask: async (taskId, options) => getMediaPipelineTask(taskId)
      ?? (options?.projectId ? await getStoredMediaPipelineTask({ projectId: options.projectId, taskId }, { userDataDir: app.getPath('userData') }) : undefined)
      ?? null,
    cancelTask: (taskId, options) => cancelMediaPipelineTask(taskId, { projectId: options?.projectId, userDataDir: app.getPath('userData') }),
    getTaskLogs: (taskId, options) => getMediaPipelineTaskLogs(taskId, { projectId: options?.projectId, userDataDir: app.getPath('userData') }),
    saveProject: async (editingProject) => {
      const result = await saveMediaPipelineEditingProject(editingProject as unknown as MediaPipelineEditingProject, { userDataDir: app.getPath('userData') })
      return {
        ...result,
        editingProject: result.editingProject as unknown as Record<string, unknown>,
        editing_project: result.editing_project as unknown as Record<string, unknown>,
      }
    },
    getProject: async (input) => {
      const result = await getMediaPipelineEditingProject(input, { userDataDir: app.getPath('userData') })
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

  ipcMain.handle('media-pipeline:save-editing-project', async (_event, input?: { editingProject?: MediaPipelineEditingProject; editing_project?: MediaPipelineEditingProject }) => {
    const editingProject = input?.editingProject ?? input?.editing_project
    if (!editingProject) throw new Error('editingProject is required')
    return saveMediaPipelineEditingProject(editingProject, { userDataDir: app.getPath('userData') })
  })

  ipcMain.handle('media-pipeline:get-editing-project', async (_event, input?: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => {
    const projectId = input?.projectId ?? input?.project_id
    const editingProjectId = input?.editingProjectId ?? input?.editing_project_id
    if (!projectId) throw new Error('projectId is required')
    if (!editingProjectId) throw new Error('editingProjectId is required')
    return getMediaPipelineEditingProject({ projectId, editingProjectId }, { userDataDir: app.getPath('userData') })
  })

  ipcMain.handle('media-pipeline:import-export-resource', async (_event, input?: {
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
    return importMediaPipelineExportResource({
      outputPath: input.outputPath ?? '',
      output_path: input.output_path,
      filename: input.filename,
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
    return createMediaPipelineTask(input, { userDataDir: app.getPath('userData') })
  })

  ipcMain.handle('media-pipeline:get-task', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return getMediaPipelineTask(taskId)
      ?? (projectId ? await getStoredMediaPipelineTask({ projectId, taskId }, { userDataDir: app.getPath('userData') }) : undefined)
      ?? null
  })

  ipcMain.handle('media-pipeline:cancel-task', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return cancelMediaPipelineTask(taskId, { projectId, userDataDir: app.getPath('userData') })
  })

  ipcMain.handle('media-pipeline:get-task-logs', async (_event, input?: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => {
    const taskId = input?.taskId ?? input?.task_id
    const projectId = input?.projectId ?? input?.project_id
    if (!taskId) throw new Error('taskId is required')
    return getMediaPipelineTaskLogs(taskId, { projectId, userDataDir: app.getPath('userData') })
  })

  registerMediaPipelineTaskEventForwarder()
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

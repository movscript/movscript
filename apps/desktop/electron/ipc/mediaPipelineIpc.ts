import { BrowserWindow, ipcMain } from 'electron'
import { setEditingRuntimePort } from '@movscript/mcp-host'

import {
  createMediaPipelineTaskFromEditingService,
  getMediaPipelineCapabilities,
  getMediaPipelineTask,
  deleteMediaEditingProjectThroughEditingService,
  getMediaEditingProjectThroughEditingService,
  importMediaPipelineExportResource,
  listMediaEditingProjectsThroughEditingService,
  onMediaPipelineEditingProjectEvent,
  onMediaPipelineTaskEvent,
  publishMediaPipelineHlsStream,
  saveMediaPipelineExportLocal,
  saveMediaEditingProjectThroughEditingService,
  type MediaPipelineTaskRequest,
} from '../services/mediaPipeline'
import {
  cancelMediaPipelineTaskFromReadHomeDirs,
  createDesktopMediaPipelineRuntimePort,
  getMediaPipelineTaskFromReadHomeDirs,
  getMediaPipelineTaskLogsFromReadHomeDirs,
  getStoredMediaPipelineTaskFromReadHomeDirs,
  isMediaPipelineHlsOutput,
} from '../services/mediaPipelineRuntimePort'
import { getMediaPipelineFFmpegStatus } from '../services/mediaPipeline/ffmpegProbe'
import { analyzeMediaPipelineShotCuts, type MediaPipelineShotCutInput } from '../services/mediaPipeline/shotCutAnalyzer'
import { renderMediaPipelineSingleClip } from '../services/mediaPipeline/singleClipRenderer'
import { renderMediaPipelineTimeline } from '../services/mediaPipeline/timelineRenderer'
import type { VideoClipInput, VideoTimelineExportInput } from '../services/mediaPipeline/timelineExportTypes'
import type { MediaPipelineEditingProject } from '../services/mediaPipeline/types'
import { resolveMediaPipelineHomeDir } from '../services/mediaPipeline/home'

export function registerMediaPipelineIpcHandlers(): void {
  setEditingRuntimePort(createDesktopMediaPipelineRuntimePort())

  ipcMain.handle('media-pipeline:save-editing-project', async (_event, input?: {
    editingProject?: MediaPipelineEditingProject
    editing_project?: MediaPipelineEditingProject
    expectedRevision?: number
    expected_revision?: number
  }) => {
    const editingProject = input?.editingProject ?? input?.editing_project
    if (!editingProject) throw new Error('editingProject is required')
    return saveMediaEditingProjectThroughEditingService(editingProject, {
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
    const projectId = input?.projectId ?? input?.project_id
    if (!editingProjectId) throw new Error('editingProjectId is required')
    return getMediaEditingProjectThroughEditingService({ projectId, editingProjectId }, { homeDir: resolveMediaPipelineHomeDir() })
  })

  ipcMain.handle('media-pipeline:list-editing-projects', async () => {
    return listMediaEditingProjectsThroughEditingService({ homeDir: resolveMediaPipelineHomeDir() })
  })

  ipcMain.handle('media-pipeline:delete-editing-project', async (_event, input?: {
    projectId?: string
    project_id?: string
    editingProjectId?: string
    editing_project_id?: string
  }) => {
    const editingProjectId = input?.editingProjectId ?? input?.editing_project_id
    const projectId = input?.projectId ?? input?.project_id
    if (!editingProjectId) throw new Error('editingProjectId is required')
    return deleteMediaEditingProjectThroughEditingService({ projectId, editingProjectId }, { homeDir: resolveMediaPipelineHomeDir() })
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
    return createMediaPipelineTaskFromEditingService(input, { homeDir: resolveMediaPipelineHomeDir() })
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

import { stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { createEditingServiceClientFromRuntime } from '@movscript/editing'

import {
  materializeMediaPipelineAsset,
  type BackendResourceDownloadProgress,
  type MediaPipelineMaterializeOptions,
} from './assetMaterializer'
import {
  importMediaPipelineExportResource,
  publishMediaPipelineHlsStream,
  saveMediaPipelineExportLocal,
  uploadMediaPipelineExportResource,
} from './exportUploader'
import {
  isTaskCanceled,
  MediaPipelineTaskError,
  parseMaterializeError,
  taskError,
  throwIfTaskCanceled,
} from './errors'
import { getMediaPipelineFFmpegStatus } from './ffmpegProbe'
import { normalizeHlsManifestName, packageMediaPipelineHls } from './hlsPackager'
import { createMediaPipelineLocalHlsURL, registerMediaPipelineLocalHlsRoot } from './localHlsProtocol'
import { clampProgressPercent, createTimelineExportProgressReporter } from './progress'
import {
  deleteMediaPipelineEditingProject as deleteStoredMediaPipelineEditingProject,
  getMediaPipelineEditingProject as readStoredMediaPipelineEditingProject,
  listMediaPipelineEditingProjects as readStoredMediaPipelineEditingProjects,
  onMediaPipelineEditingProjectEvent,
  saveMediaPipelineEditingProject as writeStoredMediaPipelineEditingProject,
} from './projectStore'
import { reframeMediaPipelineSource } from './reframer'
import {
  appendTaskLog,
  appendTaskLogForState,
  deleteMediaPipelineTaskRun,
  getMediaPipelineTask,
  getMediaPipelineTaskLogs,
  getMediaPipelineTaskRun,
  getRequiredMediaPipelineTask,
  getStoredMediaPipelineTask,
  onMediaPipelineTaskEvent,
  readStoredTaskManifestForIdentity,
  setMediaPipelineTaskRun,
  setMediaPipelineTaskState,
  updateMediaPipelineTask,
} from './taskStore'
import {
  mediaPipelineTimelineToVideoExportInput,
  renderMediaPipelineTimeline,
} from './timelineRenderer'
import { transcodeMediaPipelineSource } from './transcoder'
import type {
  MediaPipelineEditingProject,
  MediaPipelineCapabilities,
  MediaPipelineTaskRequest,
  MediaPipelineTaskState,
  MediaPipelineTimelineRecipe,
} from './types'
import {
  prepareMediaWorkspace,
  type MediaWorkspacePaths,
  writeTaskManifest,
} from './workspace'

let nextTaskId = 0
const supportedTaskTypes: MediaPipelineCapabilities['supportedTaskTypes'] = ['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe']

export {
  getMediaPipelineTask,
  getMediaPipelineTaskLogs,
  getStoredMediaPipelineTask,
  importMediaPipelineExportResource,
  onMediaPipelineEditingProjectEvent,
  onMediaPipelineTaskEvent,
  publishMediaPipelineHlsStream,
  saveMediaPipelineExportLocal,
}
export { parseFFmpegProgressTimeMs } from './progress'

export async function getMediaPipelineCapabilities(): Promise<MediaPipelineCapabilities> {
  const ffmpeg = await getMediaPipelineFFmpegStatus()
  return {
    status: 'ok',
    runtime: 'electron_media_pipeline',
    available: ffmpeg.available,
    ffmpeg: {
      available: ffmpeg.available,
      ...(ffmpeg.path ? { path: ffmpeg.path } : {}),
      ...(ffmpeg.version ? { version: ffmpeg.version } : {}),
      ...(ffmpeg.code ? { code: ffmpeg.code } : {}),
      ...(ffmpeg.error ? { error: ffmpeg.error } : {}),
      ...(ffmpeg.expectedBundledPath ? { expectedBundledPath: ffmpeg.expectedBundledPath } : {}),
      ...(ffmpeg.platform ? { platform: ffmpeg.platform } : {}),
      ...(ffmpeg.arch ? { arch: ffmpeg.arch } : {}),
    },
    supportedTaskTypes,
    supported_task_types: supportedTaskTypes,
    supportedOutputs: ['mp4', 'hls'],
    supported_outputs: ['mp4', 'hls'],
    localHlsPreview: true,
    local_hls_preview: true,
    projectStore: true,
    project_store: true,
  }
}

export async function saveMediaPipelineEditingProject(
  editingProject: MediaPipelineEditingProject,
  options: { homeDir: string; expectedRevision?: number },
) {
  return writeStoredMediaPipelineEditingProject(editingProject, options)
}

export async function saveMediaEditingProjectThroughEditingService(
  editingProject: MediaPipelineEditingProject,
  options: { homeDir: string; expectedRevision?: number },
) {
  const result = await createEditingServiceClientFromRuntime({ homeDir: options.homeDir, env: process.env }).projectCommand({
    command: 'saveProject',
    input: {
      editingProject,
      ...(options.expectedRevision !== undefined ? { expectedRevision: options.expectedRevision } : {}),
    },
  })
  return result.result
}

export async function getMediaEditingProjectThroughEditingService(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
) {
  const result = await createEditingServiceClientFromRuntime({ homeDir: options.homeDir, env: process.env }).projectCommand({
    command: 'getProject',
    input,
  })
  return result.result
}

export async function listMediaEditingProjectsThroughEditingService(options: { homeDir: string }) {
  const result = await createEditingServiceClientFromRuntime({ homeDir: options.homeDir, env: process.env }).projectCommand({
    command: 'listProjects',
    input: {},
  })
  return result.result
}

export async function deleteMediaEditingProjectThroughEditingService(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
) {
  const result = await createEditingServiceClientFromRuntime({ homeDir: options.homeDir, env: process.env }).projectCommand({
    command: 'deleteProject',
    input,
  })
  return result.result
}

export async function getMediaPipelineEditingProject(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
) {
  return readStoredMediaPipelineEditingProject(input, options)
}

export async function listMediaPipelineEditingProjects(
  options: { homeDir: string },
) {
  return readStoredMediaPipelineEditingProjects(options)
}

export async function deleteMediaPipelineEditingProject(
  input: { projectId?: string; editingProjectId: string },
  options: { homeDir: string },
) {
  return deleteStoredMediaPipelineEditingProject(input, options)
}

export async function createMediaPipelineTask(
  request: MediaPipelineTaskRequest,
  options: { homeDir: string },
): Promise<MediaPipelineTaskState> {
  const taskId = makeTaskId(request.taskType)
  registerMediaPipelineLocalHlsRoot(options.homeDir)
  const now = new Date().toISOString()
  const workspace = await prepareMediaWorkspace({
    homeDir: options.homeDir,
    projectId: request.projectId,
    taskId,
  })
  let state: MediaPipelineTaskState = {
    taskId,
    projectId: request.projectId,
    taskType: request.taskType,
    status: 'queued',
    progressPercent: 0,
    currentStep: 'queued',
    workspacePath: workspace.taskRoot,
    manifestPath: workspace.taskManifest,
    createdAt: now,
    updatedAt: now,
  }
  setMediaPipelineTaskState(state)
  await appendTaskLog(workspace, { event: 'task.queued', state })
  await writeTaskManifest({ manifestPath: workspace.taskManifest, request, state })

  state = updateMediaPipelineTask(taskId, { status: 'running', progressPercent: 10, currentStep: 'running' })
  await appendTaskLog(workspace, { event: 'task.running', state })
  await writeTaskManifest({ manifestPath: workspace.taskManifest, request, state })

  const abortController = new AbortController()
  const promise = runMediaPipelineTask({ taskId, request, workspace, abortController })
    .finally(() => {
      deleteMediaPipelineTaskRun(taskId)
    })
  setMediaPipelineTaskRun(taskId, {
    abortController,
    request,
    workspace,
    promise,
  })
  return state
}

export async function createMediaPipelineTaskFromEditingService(
  request: MediaPipelineTaskRequest,
  options: { homeDir: string },
): Promise<MediaPipelineTaskState> {
  const editingService = createEditingServiceClientFromRuntime({ homeDir: options.homeDir, env: process.env })
  const response = await editingService.taskRequest({
    taskType: request.taskType,
    input: request as unknown as Record<string, unknown>,
  })
  return createMediaPipelineTask(response.request as unknown as MediaPipelineTaskRequest, options)
}

async function runMediaPipelineTask(input: {
  taskId: string
  request: MediaPipelineTaskRequest
  workspace: MediaWorkspacePaths
  abortController: AbortController
}): Promise<void> {
  const { taskId, request, workspace, abortController } = input
  let state = getRequiredMediaPipelineTask(taskId)

  try {
    throwIfTaskCanceled(abortController.signal)
    if (request.taskType === 'media_reframe') {
      await runMediaPipelineReframeTask({ taskId, request, workspace, abortController })
      return
    }
    if (request.taskType === 'media_transcode') {
      await runMediaPipelineTranscodeTask({ taskId, request, workspace, abortController })
      return
    }
    if (request.taskType !== 'timeline_render' && request.taskType !== 'timeline_hls') {
      throw taskError('TASK_TYPE_UNSUPPORTED', `${request.taskType} is not supported by Electron mediaPipeline.`)
    }
    const isHlsTask = request.taskType === 'timeline_hls'

    const timeline = request.timeline ?? request.editingProject?.timeline
    if (!timeline) throw taskError('TIMELINE_REQUIRED', 'timeline or editingProject.timeline is required.')
    await setTaskProgress(taskId, workspace, request, 20, 'materializing')
    throwIfTaskCanceled(abortController.signal)
    await appendTaskLog(workspace, { event: 'timeline.materialize.start', timelineId: timeline.id, trackCount: timeline.tracks.length })
    const exportInput = await mediaPipelineTimelineToVideoExportInput(timeline, workspace, materializeOptionsFromRequest(request, workspace))
    throwIfTaskCanceled(abortController.signal)
    await setTaskProgress(taskId, workspace, request, 30, 'materialized')
    await appendTaskLog(workspace, {
      event: 'timeline.materialize.completed',
      videoClipCount: exportInput.clips.length,
      audioClipCount: exportInput.audioClips?.length ?? 0,
      overlayCount: exportInput.overlays?.length ?? 0,
      captionCount: exportInput.captions?.length ?? 0,
      subtitleFileCount: exportInput.subtitleFiles?.length ?? 0,
    })
    await setTaskProgress(taskId, workspace, request, 35, 'exporting')
    throwIfTaskCanceled(abortController.signal)
    await appendTaskLog(workspace, { event: 'timeline.export.start', outputName: request.output.filename, outputFormat: request.output.format })
    const exportProgressReporter = createTimelineExportProgressReporter({
      durationMs: timelineDurationMs(timeline),
      startPercent: 35,
      endPercent: isHlsTask ? 80 : 95,
      onProgress: async (progressPercent, currentStep, event) => {
        await setTaskProgress(taskId, workspace, request, progressPercent, currentStep, event)
      },
    })
    const result = await renderMediaPipelineTimeline({
      ...exportInput,
      outputName: isHlsTask ? hlsIntermediateMp4Name(request.output.filename) : request.output.filename,
      signal: abortController.signal,
      onFFmpegOutput: (output) => {
        void appendTaskLog(workspace, {
          event: 'ffmpeg.output',
          stream: output.stream,
          chunk: output.chunk,
        })
        exportProgressReporter.report(output.chunk)
      },
    })
    await exportProgressReporter.flush()
    throwIfTaskCanceled(abortController.signal)
    if (!result.ok || !result.data) {
      await appendTaskLog(workspace, {
        event: 'timeline.export.failed',
        code: result.code,
        error: result.error,
        missingFilters: result.missingFilters,
      })
      throw taskError(result.code ?? 'TIMELINE_RENDER_FAILED', result.error ?? 'Timeline render failed.')
    }

    const outputName = result.outputName ?? request.output.filename ?? 'movscript-edit.mp4'
    const renderedMp4Path = join(isHlsTask ? workspace.taskTemp : workspace.taskOutputs, outputName)
    await writeFile(renderedMp4Path, result.data)
    const outputInfo = await stat(renderedMp4Path)

    if (isHlsTask) {
      await setTaskProgress(taskId, workspace, request, 82, 'packaging_hls')
      await appendTaskLog(workspace, {
        event: 'hls.package.start',
        sourcePath: renderedMp4Path,
        manifestName: normalizeHlsManifestName(request.output.filename),
      })
      const status = await getMediaPipelineFFmpegStatus()
      if (!status.available || !status.path) {
        throw taskError('FFMPEG_NOT_FOUND', status.error || 'ffmpeg is not available on this device.')
      }
      const hls = await packageMediaPipelineHls({
        ffmpegPath: status.path,
        sourceMp4Path: renderedMp4Path,
        outputDirectory: join(workspace.taskOutputs, 'hls'),
        manifestName: request.output.filename,
        variants: request.output.hlsVariants ?? request.output.hls_variants,
        signal: abortController.signal,
        onFFmpegOutput: (output) => {
          void appendTaskLog(workspace, {
            event: 'ffmpeg.output',
            phase: 'hls.package',
            stream: output.stream,
            chunk: output.chunk,
          })
        },
      })
      throwIfTaskCanceled(abortController.signal)
      const hlsManifestUrl = createMediaPipelineLocalHlsURL(hls.manifestPath)
      state = updateMediaPipelineTask(taskId, {
        status: 'succeeded',
        progressPercent: 100,
        currentStep: 'completed',
        outputPath: hls.manifestPath,
        outputName: hls.manifestName,
        hlsManifestPath: hls.manifestPath,
        hls_manifest_path: hls.manifestPath,
        hlsManifestUrl,
        hls_manifest_url: hlsManifestUrl,
        hlsDirectory: hls.outputDirectory,
        hls_directory: hls.outputDirectory,
        hlsSegmentPaths: hls.segmentPaths,
        hls_segment_paths: hls.segmentPaths,
        ...(hls.variants ? { hlsVariants: hls.variants, hls_variants: hls.variants } : {}),
      })
      await appendTaskLog(workspace, {
        event: 'hls.package.succeeded',
        manifestPath: hls.manifestPath,
        manifestUrl: hlsManifestUrl,
        manifestName: hls.manifestName,
        outputDirectory: hls.outputDirectory,
        segmentCount: hls.segmentPaths.length,
        segmentPaths: hls.segmentPaths,
        variants: hls.variants,
        sourceSizeBytes: outputInfo.size,
      })
      await appendTaskLog(workspace, {
        event: 'task.succeeded',
        state,
        outputPath: hls.manifestPath,
        outputName: hls.manifestName,
        hlsManifestPath: hls.manifestPath,
        hlsManifestUrl,
        hlsDirectory: hls.outputDirectory,
        hlsSegmentPaths: hls.segmentPaths,
        hlsVariants: hls.variants,
      })
      await writeTaskManifest({
        manifestPath: workspace.taskManifest,
        request,
        state: {
          ...state,
          outputPath: hls.manifestPath,
          outputName: hls.manifestName,
          hlsManifestPath: hls.manifestPath,
          hls_manifest_path: hls.manifestPath,
          hlsManifestUrl,
          hls_manifest_url: hlsManifestUrl,
          hlsDirectory: hls.outputDirectory,
          hls_directory: hls.outputDirectory,
          hlsSegmentPaths: hls.segmentPaths,
          hls_segment_paths: hls.segmentPaths,
          ...(hls.variants ? { hlsVariants: hls.variants, hls_variants: hls.variants } : {}),
          errorMessage: undefined,
          errorCode: undefined,
        },
      })
      return
    }

    const outputPath = renderedMp4Path
    const importedResource = shouldImportOutputToResource(request.output)
      ? await importTaskOutputResource({
        taskId,
        workspace,
        request,
        outputPath,
        outputName,
        mimeType: result.mimeType ?? 'video/mp4',
      })
      : undefined
    state = updateMediaPipelineTask(taskId, {
      status: 'succeeded',
      progressPercent: 100,
      currentStep: 'completed',
      outputPath,
      outputName,
      ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
    })
    await appendTaskLog(workspace, {
      event: 'task.succeeded',
      state,
      outputPath,
      outputName,
      outputSizeBytes: outputInfo.size,
      ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
    })
    await writeTaskManifest({
      manifestPath: workspace.taskManifest,
      request,
      state: {
        ...state,
        outputPath,
        outputName,
        ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
        errorMessage: undefined,
        errorCode: undefined,
      },
    })
  } catch (error) {
    if (isTaskCanceled(error) || getMediaPipelineTask(taskId)?.status === 'canceled') {
      state = updateMediaPipelineTask(taskId, {
        status: 'canceled',
        progressPercent: 100,
        currentStep: 'canceled',
        errorCode: 'TASK_CANCELED',
        errorMessage: error instanceof Error ? error.message : 'Task was canceled.',
      })
      await appendTaskLog(workspace, {
        event: 'task.canceled',
        state,
        code: state.errorCode,
        error: state.errorMessage,
      })
      await writeTaskManifest({ manifestPath: workspace.taskManifest, request, state })
      return
    }
    state = updateMediaPipelineTask(taskId, {
      status: 'failed',
      progressPercent: 100,
      currentStep: 'failed',
      errorCode: error instanceof MediaPipelineTaskError ? error.code : 'MEDIA_PIPELINE_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Media pipeline task failed.',
    })
    await appendTaskLog(workspace, {
      event: 'task.failed',
      state,
      code: state.errorCode,
      error: state.errorMessage,
    })
    await writeTaskManifest({ manifestPath: workspace.taskManifest, request, state })
  }
}

async function runMediaPipelineTranscodeTask(input: {
  taskId: string
  request: MediaPipelineTaskRequest
  workspace: MediaWorkspacePaths
  abortController: AbortController
}): Promise<void> {
  const { taskId, request, workspace, abortController } = input
  if (!request.source) throw taskError('SOURCE_REQUIRED', 'source is required for media_transcode.')
  await setTaskProgress(taskId, workspace, request, 20, 'materializing')
  throwIfTaskCanceled(abortController.signal)
  await appendTaskLog(workspace, { event: 'transcode.materialize.start', sourceId: request.source.id })
  let sourcePath: string
  try {
    sourcePath = (await materializeMediaPipelineAsset({
      asset: request.source,
      workspace,
      options: materializeOptionsFromRequest(request, workspace),
    })).path
  } catch (error) {
    const parsed = parseMaterializeError(error)
    throw taskError(parsed.code, `Source ${request.source.id}: ${parsed.message}`)
  }
  await setTaskProgress(taskId, workspace, request, 35, 'materialized')
  await appendTaskLog(workspace, { event: 'transcode.materialize.completed', sourcePath })
  throwIfTaskCanceled(abortController.signal)

  const status = await getMediaPipelineFFmpegStatus()
  if (!status.available || !status.path) {
    throw taskError('FFMPEG_NOT_FOUND', status.error || 'ffmpeg is not available on this device.')
  }

  const outputName = basename(request.output.filename?.trim() || 'transcode.mp4')
  const outputPath = join(workspace.taskOutputs, outputName)
  await setTaskProgress(taskId, workspace, request, 45, 'transcoding')
  await appendTaskLog(workspace, {
    event: 'transcode.start',
    sourcePath,
    outputPath,
    transcode: request.transcode,
  })
  const transcode = await transcodeMediaPipelineSource({
    ffmpegPath: status.path,
    sourcePath,
    outputPath,
    spec: request.transcode,
    signal: abortController.signal,
    onFFmpegOutput: (output) => {
      void appendTaskLog(workspace, {
        event: 'ffmpeg.output',
        phase: 'media.transcode',
        stream: output.stream,
        chunk: output.chunk,
      })
    },
  })
  throwIfTaskCanceled(abortController.signal)
  await setTaskProgress(taskId, workspace, request, 95, 'finalizing')
  const outputInfo = await stat(outputPath)
  const importedResource = shouldImportOutputToResource(request.output)
    ? await importTaskOutputResource({
      taskId,
      workspace,
      request,
      outputPath,
      outputName,
      mimeType: 'video/mp4',
    })
    : undefined
  const state = updateMediaPipelineTask(taskId, {
    status: 'succeeded',
    progressPercent: 100,
    currentStep: 'completed',
    outputPath,
    outputName,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await appendTaskLog(workspace, {
    event: 'transcode.succeeded',
    sourcePath,
    outputPath,
    outputName,
    outputSizeBytes: outputInfo.size,
    videoCodec: transcode.videoCodec,
    audioCodec: transcode.audioCodec,
    videoBitrateKbps: transcode.videoBitrateKbps,
    audioBitrateKbps: transcode.audioBitrateKbps,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await appendTaskLog(workspace, {
    event: 'task.succeeded',
    state,
    outputPath,
    outputName,
    outputSizeBytes: outputInfo.size,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await writeTaskManifest({
    manifestPath: workspace.taskManifest,
    request,
    state: {
      ...state,
      outputPath,
      outputName,
      ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
      errorMessage: undefined,
      errorCode: undefined,
    },
  })
}

async function runMediaPipelineReframeTask(input: {
  taskId: string
  request: MediaPipelineTaskRequest
  workspace: MediaWorkspacePaths
  abortController: AbortController
}): Promise<void> {
  const { taskId, request, workspace, abortController } = input
  if (!request.source) throw taskError('SOURCE_REQUIRED', 'source is required for media_reframe.')
  await setTaskProgress(taskId, workspace, request, 20, 'materializing')
  throwIfTaskCanceled(abortController.signal)
  await appendTaskLog(workspace, { event: 'reframe.materialize.start', sourceId: request.source.id })
  let sourcePath: string
  try {
    sourcePath = (await materializeMediaPipelineAsset({
      asset: request.source,
      workspace,
      options: materializeOptionsFromRequest(request, workspace),
    })).path
  } catch (error) {
    const parsed = parseMaterializeError(error)
    throw taskError(parsed.code, `Source ${request.source.id}: ${parsed.message}`)
  }
  await setTaskProgress(taskId, workspace, request, 35, 'materialized')
  await appendTaskLog(workspace, { event: 'reframe.materialize.completed', sourcePath })
  throwIfTaskCanceled(abortController.signal)

  const status = await getMediaPipelineFFmpegStatus()
  if (!status.available || !status.path) {
    throw taskError('FFMPEG_NOT_FOUND', status.error || 'ffmpeg is not available on this device.')
  }

  const outputName = basename(request.output.filename?.trim() || 'reframe.mp4')
  const outputPath = join(workspace.taskOutputs, outputName)
  await setTaskProgress(taskId, workspace, request, 45, 'reframing')
  await appendTaskLog(workspace, {
    event: 'reframe.start',
    sourcePath,
    outputPath,
    target: request.reframe?.target ?? request.target,
    mode: request.reframe?.mode ?? request.mode,
  })
  const reframe = await reframeMediaPipelineSource({
    ffmpegPath: status.path,
    sourcePath,
    outputPath,
    spec: request.reframe,
    target: request.target,
    mode: request.mode,
    signal: abortController.signal,
    onFFmpegOutput: (output) => {
      void appendTaskLog(workspace, {
        event: 'ffmpeg.output',
        phase: 'media.reframe',
        stream: output.stream,
        chunk: output.chunk,
      })
    },
  })
  throwIfTaskCanceled(abortController.signal)
  await setTaskProgress(taskId, workspace, request, 95, 'finalizing')
  const outputInfo = await stat(outputPath)
  const importedResource = shouldImportOutputToResource(request.output)
    ? await importTaskOutputResource({
      taskId,
      workspace,
      request,
      outputPath,
      outputName,
      mimeType: 'video/mp4',
    })
    : undefined
  const state = updateMediaPipelineTask(taskId, {
    status: 'succeeded',
    progressPercent: 100,
    currentStep: 'completed',
    outputPath,
    outputName,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await appendTaskLog(workspace, {
    event: 'reframe.succeeded',
    sourcePath,
    outputPath,
    outputName,
    outputSizeBytes: outputInfo.size,
    width: reframe.width,
    height: reframe.height,
    mode: reframe.mode,
    filter: reframe.filter,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await appendTaskLog(workspace, {
    event: 'task.succeeded',
    state,
    outputPath,
    outputName,
    outputSizeBytes: outputInfo.size,
    ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
  })
  await writeTaskManifest({
    manifestPath: workspace.taskManifest,
    request,
    state: {
      ...state,
      outputPath,
      outputName,
      ...(importedResource ? { outputResourceId: importedResource.resourceId, outputResource: importedResource.resource } : {}),
      errorMessage: undefined,
      errorCode: undefined,
    },
  })
}

export async function cancelMediaPipelineTask(
  taskId: string,
  options?: { projectId?: string; homeDir?: string },
): Promise<MediaPipelineTaskState> {
  const restored = !getMediaPipelineTask(taskId) && options?.projectId && options.homeDir
    ? await readStoredTaskManifestForIdentity({ projectId: options.projectId, taskId }, { homeDir: options.homeDir })
    : undefined
  const state = getMediaPipelineTask(taskId) ?? restored?.state
  if (!state) throw new Error(`Media pipeline task not found: ${taskId}`)
  if (state.status === 'succeeded' || state.status === 'failed' || state.status === 'canceled') return structuredClone(state)
  if (restored?.state) setMediaPipelineTaskState(restored.state)
  const run = getMediaPipelineTaskRun(taskId)
  run?.abortController.abort()
  const next = updateMediaPipelineTask(taskId, {
    status: 'canceled',
    progressPercent: 100,
    currentStep: 'canceled',
    errorCode: 'TASK_CANCELED',
    errorMessage: 'Task was canceled.',
  })
  if (run) {
    await appendTaskLog(run.workspace, { event: 'task.canceled', state: next, code: next.errorCode, error: next.errorMessage })
    await writeTaskManifest({ manifestPath: run.workspace.taskManifest, request: run.request, state: next })
  } else {
    await appendTaskLogForState(next, { event: 'task.canceled', state: next, code: next.errorCode, error: next.errorMessage })
    if (next.manifestPath) {
      await writeTaskManifest({
        manifestPath: next.manifestPath,
        request: restored?.request ?? taskRequestFromStoredState(next),
        state: next,
      })
    }
  }
  return next
}

function taskRequestFromStoredState(state: MediaPipelineTaskState): MediaPipelineTaskRequest {
  return {
    projectId: state.projectId,
    taskType: state.taskType,
    output: {
      format: state.taskType === 'timeline_hls' ? 'hls' : 'mp4',
      ...(state.outputName ? { filename: state.outputName } : {}),
    },
  }
}

async function setTaskProgress(
  taskId: string,
  workspace: MediaWorkspacePaths,
  request: MediaPipelineTaskRequest,
  progressPercent: number,
  currentStep: string,
  event?: Record<string, unknown>,
): Promise<MediaPipelineTaskState> {
  const current = getMediaPipelineTask(taskId)
  if (current && isTerminalTaskStatus(current.status)) return structuredClone(current)
  const state = updateMediaPipelineTask(taskId, {
    progressPercent: clampProgressPercent(progressPercent),
    currentStep,
  })
  await appendTaskLog(workspace, {
    event: 'task.progress',
    state,
    ...(event ?? {}),
  })
  await writeTaskManifest({ manifestPath: workspace.taskManifest, request, state })
  return state
}

function isTerminalTaskStatus(status: MediaPipelineTaskState['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled'
}

async function importTaskOutputResource(input: {
  taskId: string
  workspace: MediaWorkspacePaths
  request: MediaPipelineTaskRequest
  outputPath: string
  outputName: string
  mimeType: string
}): Promise<{ resourceId: number; resource: unknown }> {
  await setTaskProgress(input.taskId, input.workspace, input.request, 97, 'uploading_resource', { phase: 'output.upload' })
  await appendTaskLog(input.workspace, {
    event: 'output.upload.start',
    outputPath: input.outputPath,
    outputName: input.outputName,
  })
  try {
    const uploaded = await uploadMediaPipelineExportResource({
      outputPath: input.outputPath,
      filename: input.outputName,
      mimeType: input.mimeType,
      folderId: outputFolderId(input.request.output),
      derivative: input.request.output.derivative ?? taskOutputDerivative(input.request),
    })
    await appendTaskLog(input.workspace, {
      event: 'output.upload.succeeded',
      outputPath: input.outputPath,
      outputName: input.outputName,
      outputResourceId: uploaded.resourceId,
      outputResource: uploaded.resource,
    })
    return uploaded
  } catch (error) {
    await appendTaskLog(input.workspace, {
      event: 'output.upload.failed',
      outputPath: input.outputPath,
      outputName: input.outputName,
      error: error instanceof Error ? error.message : 'Output upload failed.',
    })
    throw taskError('EXPORT_RESOURCE_UPLOAD_FAILED', error instanceof Error ? error.message : 'Output upload failed.')
  }
}

function shouldImportOutputToResource(output: MediaPipelineTaskRequest['output']): boolean {
  return output.importToResource === true || output.import_to_resource === true
}

function outputFolderId(output: MediaPipelineTaskRequest['output']): string | number | undefined {
  return output.folderId ?? output.folder_id
}

function taskOutputDerivative(request: MediaPipelineTaskRequest): NonNullable<MediaPipelineTaskRequest['output']['derivative']> | undefined {
  const inputIds = inputResourceIdsForTask(request)
  return {
    operation: request.taskType,
    tool: 'electron_media_pipeline',
    ...(inputIds.length ? { input_resource_ids: inputIds } : {}),
    params: {
      project_id: request.projectId,
      task_type: request.taskType,
      output_format: request.output.format,
      ...(request.output.filename ? { output_filename: request.output.filename } : {}),
      ...(request.editingProject?.id ? { editing_project_id: request.editingProject.id } : {}),
      ...(request.timeline?.id ? { timeline_id: request.timeline.id } : {}),
      ...(request.reframe ? { reframe: request.reframe } : {}),
      ...(request.transcode ? { transcode: request.transcode } : {}),
    },
  }
}

function inputResourceIdsForTask(request: MediaPipelineTaskRequest): number[] {
  const ids: number[] = []
  const add = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return
    ids.push(value)
  }
  if (request.source) add(request.source.resourceId)
  for (const asset of request.editingProject?.assets.assets ?? []) add(asset.resourceId)
  for (const track of request.timeline?.tracks ?? []) {
    for (const clip of track.clips) add(clip.asset?.resourceId)
  }
  return Array.from(new Set(ids))
}

function hlsIntermediateMp4Name(outputName: string | undefined): string {
  if (!outputName?.trim()) return 'hls-source.mp4'
  const manifestName = normalizeHlsManifestName(outputName)
  return `${basename(manifestName, '.m3u8')}-source.mp4`
}

function timelineDurationMs(timeline: MediaPipelineTimelineRecipe): number {
  if (typeof timeline.durationMs === 'number' && Number.isFinite(timeline.durationMs) && timeline.durationMs > 0) {
    return Math.round(timeline.durationMs)
  }
  let durationMs = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      durationMs = Math.max(durationMs, clip.timelineStartMs + clip.durationMs)
    }
  }
  return Math.max(0, Math.round(durationMs))
}

function materializeOptionsFromRequest(request: MediaPipelineTaskRequest, workspace: MediaWorkspacePaths): MediaPipelineMaterializeOptions {
  const resourceCache = request.resourceCache ?? request.resource_cache
  const resourceDownload = request.resourceDownload ?? request.resource_download
  return {
    resourceCache: {
      maxBytes: numberValue(resourceCache?.maxBytes ?? resourceCache?.max_bytes),
      maxEntries: numberValue(resourceCache?.maxEntries ?? resourceCache?.max_entries),
    },
    resourceDownload: {
      attempts: numberValue(resourceDownload?.attempts),
      retryDelayMs: numberValue(resourceDownload?.retryDelayMs ?? resourceDownload?.retry_delay_ms),
      maxRetryDelayMs: numberValue(resourceDownload?.maxRetryDelayMs ?? resourceDownload?.max_retry_delay_ms),
      onProgress: (progress) => {
        void appendTaskLog(workspace, resourceDownloadProgressEvent(progress))
      },
    },
  }
}

function resourceDownloadProgressEvent(progress: BackendResourceDownloadProgress): Record<string, unknown> {
  const percent = progress.totalBytes && progress.totalBytes > 0
    ? Math.max(0, Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100)))
    : undefined
  return {
    event: 'asset.download.progress',
    assetId: progress.asset.id,
    resourceId: progress.resourceId,
    attempt: progress.attempt,
    receivedBytes: progress.receivedBytes,
    ...(progress.totalBytes !== undefined ? { totalBytes: progress.totalBytes } : {}),
    ...(percent !== undefined ? { progressPercent: percent } : {}),
    done: progress.done,
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function makeTaskId(type: string): string {
  nextTaskId += 1
  return `${type}_${Date.now()}_${nextTaskId}`
}


export type { MediaPipelineTaskEvent, MediaPipelineTaskRequest, MediaPipelineTaskState } from './types'

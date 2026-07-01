import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import {
  type MediaEditingProject,
  createEditingServiceClientFromRuntime,
  createMediaPipelineServiceClientFromRuntime,
  type EditingServiceProjectCommandName,
  type EditingServiceTaskActionName,
  type EditingServiceTaskRequestType,
  type MediaPipelineTaskActionName,
} from '@movscript/editing'
import { getOptionalNumeric } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import {
  getEditingRuntimePort,
  type EditingRuntimeExportImportRequest,
  type EditingRuntimeHlsPublishRequest,
  type EditingRuntimeSaveLocalRequest,
  type EditingMediaPipelineTaskRequest,
} from './runtime.js'
import { domainCreateContentCandidate } from '../domain/actions.js'

const STANDALONE_EDITING_PROJECT_ID = 'standalone'

async function editingServiceProjectCommand(command: EditingServiceProjectCommandName, input: Record<string, unknown>) {
  return (await createEditingServiceClientFromRuntime().projectCommand({ command, input })).result
}

async function editingServiceTaskRequest(taskType: EditingServiceTaskRequestType, input: Record<string, unknown>): Promise<EditingMediaPipelineTaskRequest> {
  const response = await createEditingServiceClientFromRuntime().taskRequest({ taskType, input })
  if (!isRecord(response.request)) throw new Error('editing service did not return a task request')
  return response.request as unknown as EditingMediaPipelineTaskRequest
}

async function editingServiceTaskAction(action: EditingServiceTaskActionName, input: Record<string, unknown>): Promise<{
  status?: string
  result?: unknown
  request?: Record<string, unknown>
}> {
  const response = await createEditingServiceClientFromRuntime().taskAction({ action, input })
  return {
    status: response.status,
    result: response.result,
    request: isRecord(response.request) ? response.request : undefined,
  }
}

async function editingServiceRuntimeTaskAction(action: Extract<EditingServiceTaskActionName, 'getTask' | 'cancelTask' | 'getTaskLogs'>, input: Record<string, unknown>): Promise<{
  taskId: string
  options: { projectId?: string }
}> {
  const envelope = await editingServiceTaskAction(action, input)
  const request = envelope.request
  if (!request) throw new Error('editing service did not return a task action request')
  const taskId = stringValue(request.taskId ?? request.task_id)
  if (!taskId) throw new Error('editing service task action request did not include taskId')
  const options = isRecord(request.options) ? request.options : {}
  return {
    taskId,
    options: {
      ...(stringValue(options.projectId ?? options.project_id) ? { projectId: stringValue(options.projectId ?? options.project_id) } : {}),
    },
  }
}

export async function editingProjectCreate(args: Record<string, unknown>) {
  const result = await editingServiceProjectCommand('createProject', args)
  return persistCreatedEditingProject(editingProjectFromServiceResult(result), result)
}

async function persistCreatedEditingProject(editingProject: MediaEditingProject, fallbackResult: unknown) {
  const saved = await editingServiceProjectCommand('saveProject', {
    editingProject: editingProject as unknown as Record<string, unknown>,
  })
  if (isRecord(saved)) {
    const savedProject = saved.editingProject ?? saved.editing_project ?? editingProject
    return {
      ...saved,
      editingProject: savedProject,
      editing_project: savedProject,
    }
  }
  return fallbackResult
}

export async function editingVideoCompose(args: Record<string, unknown>) {
  if (
    objectArg(args, 'editDecisions')
    || objectArg(args, 'edit_decisions')
    || objectArg(args, 'assetManifest')
    || objectArg(args, 'asset_manifest')
  ) {
    throw new Error('editing_video_compose no longer accepts editDecisions/assetManifest handoffs; pass editingProject/editingProjectId, or create/open a production editing workspace first')
  }
  const renderRuntime = normalizeRenderRuntime(args.renderRuntime ?? args.render_runtime)
  if (!renderRuntime.supported) {
    return {
      status: 'unsupported_runtime',
      code: 'VIDEO_COMPOSE_RENDER_RUNTIME_UNSUPPORTED',
      message: `MovScript video compose currently supports movscript_media_pipeline/ffmpeg only. Requested runtime ${renderRuntime.value} must be handled by an explicit future adapter; no silent fallback was performed.`,
      render_runtime: renderRuntime.value,
      supported_render_runtimes: ['movscript_media_pipeline', 'ffmpeg'],
    }
  }

  const editingProject = await composeEditingProject(args)
  const validation = await editingServiceProjectCommand('validateTimeline', {
    editingProject: editingProject as unknown as Record<string, unknown>,
  })
  if (timelineValidationHasErrors(validation)) {
    return {
      status: 'blocked',
      code: 'VIDEO_COMPOSE_TIMELINE_INVALID',
      message: 'Video compose did not start render because the MediaEditingProject timeline has validation errors.',
      render_runtime: renderRuntime.value,
      editing_project: editingProject,
      validation,
    }
  }

  const output = isRecord(args.output) ? args.output : {}
  const format = stringValue(output.format ?? args.format) === 'hls' ? 'hls' : 'mp4'
  const task = await mediaPipelineTaskCreate(format === 'hls' ? 'timeline_hls' : 'timeline_render', {
    ...args,
    editingProject: editingProject as unknown as Record<string, unknown>,
    projectId: projectIdValue(args) ?? editingProject.projectId,
    output: {
      ...output,
      format,
      ...(output.importToResource !== undefined || output.import_to_resource !== undefined
        ? {}
        : booleanValue(args.importToResource ?? args.import_to_resource) === undefined
          ? {}
      : { importToResource: booleanValue(args.importToResource ?? args.import_to_resource) }),
    },
  })
  const taskRecord = isRecord(task) ? task as Record<string, unknown> : {}
  const mediaTask = isRecord(taskRecord.task) ? taskRecord.task : undefined
  return {
    ...task,
    render_runtime: renderRuntime.value,
    render_runtime_used: renderRuntime.value === 'ffmpeg' ? 'movscript_media_pipeline_ffmpeg' : renderRuntime.value,
    format,
    editing_project: editingProject,
    validation,
    render_report: {
      schema: 'movscript.render_report.v1',
      status: stringValue(task.status) ?? 'unknown',
      render_runtime: renderRuntime.value,
      render_runtime_used: renderRuntime.value === 'ffmpeg' ? 'movscript_media_pipeline_ffmpeg' : renderRuntime.value,
      format,
      project_id: editingProject.projectId,
      editing_project_id: editingProject.id,
      task_id: stringValue(mediaTask?.taskId ?? mediaTask?.task_id),
      output_path: stringValue(mediaTask?.outputPath ?? mediaTask?.output_path),
      output_resource_id: optionalNumber(mediaTask?.outputResourceId ?? mediaTask?.output_resource_id),
      candidate_created: false,
      adopted: false,
      selected: false,
    },
    candidate_created: false,
    adopted: false,
    selected: false,
  }
}

export async function editingProjectAddAsset(args: Record<string, unknown>) {
  return editingServiceProjectCommand('addAsset', args)
}

export async function editingProjectRemoveAsset(args: Record<string, unknown>) {
  return editingServiceProjectCommand('removeAsset', args)
}

export async function editingProjectSave(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const expectedRevision = getOptionalNumeric(args, 'expectedRevision') ?? getOptionalNumeric(args, 'expected_revision')
  return editingServiceProjectCommand('saveProject', {
    editingProject: project as unknown as Record<string, unknown>,
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
  })
}

export async function editingProjectGet(args: Record<string, unknown>) {
  const projectId = projectIdValue(args) ?? STANDALONE_EDITING_PROJECT_ID
  const editingProjectId = editingProjectIdValue(args)
  return editingServiceProjectCommand('getProject', { projectId, editingProjectId })
}

export async function editingProjectUpdateSettings(args: Record<string, unknown>) {
  return editingServiceProjectCommand('updateProjectSettings', args)
}

export async function editingTimelineApplyCommands(args: Record<string, unknown>) {
  return editingServiceProjectCommand('applyTimelineCommands', args)
}

export async function editingTimelineValidate(args: Record<string, unknown>) {
  return editingServiceProjectCommand('validateTimeline', args)
}

export async function editingTimelineAddTrack(args: Record<string, unknown>) {
  return editingServiceProjectCommand('addTrack', args)
}

export async function editingTimelineRemoveTrack(args: Record<string, unknown>) {
  return editingServiceProjectCommand('removeTrack', args)
}

export async function editingTimelineAddClip(args: Record<string, unknown>) {
  return editingServiceProjectCommand('addClip', args)
}

export async function editingTimelineUpdateClip(args: Record<string, unknown>) {
  return editingServiceProjectCommand('updateClip', args)
}

export async function editingTimelineSplitClip(args: Record<string, unknown>) {
  return editingServiceProjectCommand('splitClip', args)
}

export async function editingTimelineMoveClip(args: Record<string, unknown>) {
  return editingServiceProjectCommand('moveClip', args)
}

export async function editingTimelineDeleteClip(args: Record<string, unknown>) {
  return editingServiceProjectCommand('deleteClip', args)
}

export async function editingRuntimeCapabilitiesGet(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.getCapabilities) return editingRuntimeRequired(args)
  return runtime.getCapabilities()
}

export async function editingTaskRenderCreate(args: Record<string, unknown>) {
  return mediaPipelineTaskCreate('timeline_render', args)
}

export async function editingTaskHlsCreate(args: Record<string, unknown>) {
  return mediaPipelineTaskCreate('timeline_hls', args)
}

export async function editingTaskTranscodeCreate(args: Record<string, unknown>) {
  return editingTaskSourceCreate(args, 'media_transcode')
}

export async function editingTaskReframeCreate(args: Record<string, unknown>) {
  return editingTaskSourceCreate(args, 'media_reframe')
}

export async function editingTaskGet(args: Record<string, unknown>) {
  const action = await editingServiceRuntimeTaskAction('getTask', args)
  const serviceResponse = await mediaPipelineTaskAction('getTask', action)
  if (serviceResponse) {
    const task = serviceResponse.task
    if (!task) {
      return {
        status: 'not_found',
        task_id: action.taskId,
      }
    }
    return taskResult(task)
  }
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const task = await runtime.getTask(action.taskId, action.options)
  if (!task) {
    return {
      status: 'not_found',
      task_id: action.taskId,
    }
  }
  return taskResult(task)
}

export async function editingTaskCancel(args: Record<string, unknown>) {
  const action = await editingServiceRuntimeTaskAction('cancelTask', args)
  const serviceResponse = await mediaPipelineTaskAction('cancelTask', action)
  if (serviceResponse?.task) return taskResult(serviceResponse.task)
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  return taskResult(await runtime.cancelTask(action.taskId, action.options))
}

export async function editingTaskLogsGet(args: Record<string, unknown>) {
  const action = await editingServiceRuntimeTaskAction('getTaskLogs', args)
  const serviceResponse = await mediaPipelineTaskAction('getTaskLogs', action)
  if (serviceResponse?.logs) {
    return {
      ...serviceResponse.logs,
      task_id: serviceResponse.logs.taskId,
    }
  }
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  if (!runtime.getTaskLogs) {
    return {
      status: 'unsupported_runtime',
      code: 'EDITING_TASK_LOGS_UNAVAILABLE',
      message: 'The registered Electron editing runtime does not expose task logs yet.',
      task_id: action.taskId,
    }
  }
  const logs = await runtime.getTaskLogs(action.taskId, action.options)
  return {
    ...logs,
    task_id: logs.taskId,
  }
}

export async function editingResultRegister(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  return service.registerResult({ result: mediaPipelineResultInput(args) })
}

export async function editingResultRecoverExternalNle(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  const detected = await detectExternalNleResult(args)
  if (detected.error) return detected.error
  const response = await service.registerResult({ result: detected.result })
  return {
    ...response,
    detected: detected.detected,
    recovered: true,
    candidate_created: false,
    adopted: false,
    selected: false,
  }
}

export async function editingResultWatchExternalNleCreate(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  const response = await service.createResultWatch({ watch: externalNleResultWatchInput(args) })
  return {
    ...response,
    recovered: response.watch?.status === 'succeeded',
    candidate_created: false,
    adopted: false,
    selected: false,
  }
}

export async function editingResultWatchGet(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  const watchId = stringValue(args.watchId ?? args.watch_id)
  if (!watchId) throw new Error('watchId is required')
  return service.getResultWatch({ watchId })
}

export async function editingResultWatchList(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  return service.listResultWatches({
    filter: compactRecord({
      projectId: projectIdValue(args),
      taskId: stringValue(args.taskId ?? args.task_id),
      resultId: stringValue(args.resultId ?? args.result_id),
      backend: stringValue(args.backend),
      status: stringValue(args.status),
      limit: optionalNumber(args.limit),
    }),
  })
}

export async function editingResultWatchCancel(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  const watchId = stringValue(args.watchId ?? args.watch_id)
  if (!watchId) throw new Error('watchId is required')
  return service.cancelResultWatch({ watchId })
}

export async function editingExternalNleOpen(args: Record<string, unknown>) {
  const exchangeProjectPath = pathValue(args.exchangeProjectPath ?? args.exchange_project_path ?? args.projectPath ?? args.project_path ?? args.path)
  if (!exchangeProjectPath) {
    return {
      schema: 'movscript.editing.external_nle.open_result.v1',
      status: 'blocked',
      code: 'EXTERNAL_NLE_EXCHANGE_PROJECT_REQUIRED',
      message: 'External NLE open requires exchangeProjectPath/exchange_project_path.',
      opened: false,
      candidate_created: false,
      adopted: false,
      selected: false,
    }
  }

  try {
    const fileStat = await stat(exchangeProjectPath)
    if (!fileStat.isFile()) {
      return {
        schema: 'movscript.editing.external_nle.open_result.v1',
        status: 'blocked',
        code: 'EXTERNAL_NLE_EXCHANGE_PROJECT_NOT_FILE',
        message: `External NLE exchange project is not a file: ${exchangeProjectPath}`,
        exchange_project_path: exchangeProjectPath,
        opened: false,
        candidate_created: false,
        adopted: false,
        selected: false,
      }
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error
    return {
      schema: 'movscript.editing.external_nle.open_result.v1',
      status: 'blocked',
      code: 'EXTERNAL_NLE_EXCHANGE_PROJECT_NOT_FOUND',
      message: `External NLE exchange project was not found: ${exchangeProjectPath}`,
      exchange_project_path: exchangeProjectPath,
      opened: false,
      candidate_created: false,
      adopted: false,
      selected: false,
    }
  }

  const externalApp = stringValue(args.externalApp ?? args.external_app ?? args.externalNle ?? args.external_nle)
  const appName = stringValue(args.appName ?? args.app_name ?? args.application ?? args.applicationName ?? args.application_name)
    ?? externalNleAppName(externalApp)
  const command = externalNleOpenCommand({
    exchangeProjectPath,
    appName,
    platform: stringValue(args.platform) ?? process.platform,
  })
  const dryRun = booleanValue(args.dryRun ?? args.dry_run) === true
  if (!dryRun) await runExternalNleOpenCommand(command)

  return {
    schema: 'movscript.editing.external_nle.open_result.v1',
    status: dryRun ? 'planned' : 'opened',
    backend: 'external_nle',
    exchange_project_path: exchangeProjectPath,
    external_app: externalApp,
    app_name: appName,
    platform: stringValue(args.platform) ?? process.platform,
    command,
    opened: !dryRun,
    dry_run: dryRun,
    candidate_created: false,
    adopted: false,
    selected: false,
  }
}

export async function editingResultGet(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  const resultId = stringValue(args.resultId ?? args.result_id)
  if (!resultId) throw new Error('resultId is required')
  return service.getResult({ resultId })
}

export async function editingResultList(args: Record<string, unknown>) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return mediaPipelineServiceRequired(args)
  return service.listResults({
    filter: compactRecord({
      projectId: projectIdValue(args),
      taskId: stringValue(args.taskId ?? args.task_id),
      backend: stringValue(args.backend),
      kind: stringValue(args.kind ?? args.outputKind ?? args.output_kind),
      status: stringValue(args.status),
      limit: optionalNumber(args.limit),
    }),
  })
}

export async function editingExportImportResource(args: Record<string, unknown>) {
  const resolved = await resolveArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const exportArgs = resolved.args
  const runtime = getEditingRuntimePort()
  if (!runtime?.importExportResource) return editingRuntimeRequired(exportArgs)
  const task = await editingRuntimeTaskSnapshot(exportArgs, runtime)
  const envelope = await editingServiceTaskAction('importExportResource', {
    ...exportArgs,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return an import export resource request')
  return runtime.importExportResource(envelope.request as unknown as EditingRuntimeExportImportRequest)
}

export async function editingExportSaveLocal(args: Record<string, unknown>) {
  const resolved = await resolveArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const exportArgs = resolved.args
  const runtime = getEditingRuntimePort()
  const taskId = stringValue(exportArgs.taskId ?? exportArgs.task_id)
  const outputPath = stringValue(exportArgs.outputPath ?? exportArgs.output_path)
  const savePath = stringValue(exportArgs.savePath ?? exportArgs.save_path)
  const saveDirectory = stringValue(exportArgs.saveDirectory ?? exportArgs.save_directory)
  if (resolved.result && outputPath && !savePath && !saveDirectory) {
    return {
      status: 'ok',
      outputPath,
      output_path: outputPath,
      ...(taskId ? { task_id: taskId } : {}),
      ...(stringValue(exportArgs.resultId ?? exportArgs.result_id) ? { result_id: stringValue(exportArgs.resultId ?? exportArgs.result_id) } : {}),
      persisted: true,
      uploaded: false,
      candidate_created: false,
      result: resolved.result,
    }
  }
  if (taskId && !outputPath && !runtime?.getTask) return editingRuntimeRequired(exportArgs)
  const task = await editingRuntimeTaskSnapshot(exportArgs, runtime)
  const envelope = await editingServiceTaskAction('saveLocalExport', {
    ...exportArgs,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return a save local export request')
  if (!runtime?.saveLocalExport) return editingRuntimeRequired(exportArgs)
  const saved = await runtime.saveLocalExport(envelope.request as unknown as EditingRuntimeSaveLocalRequest)
  return {
    ...saved,
    task_id: stringValue(envelope.request.taskId ?? envelope.request.task_id),
    persisted: true,
    uploaded: false,
    candidate_created: false,
    ...(task ? { task } : {}),
  }
}

export async function editingExportPublishHls(args: Record<string, unknown>) {
  const resolved = await resolveArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const exportArgs = resolved.args
  const runtime = getEditingRuntimePort()
  if (!runtime?.publishHlsStream) return editingRuntimeRequired(exportArgs)
  const task = await editingRuntimeTaskSnapshot(exportArgs, runtime)
  const envelope = await editingServiceTaskAction('publishHlsStream', {
    ...exportArgs,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return an HLS publish request')
  return runtime.publishHlsStream(envelope.request as unknown as EditingRuntimeHlsPublishRequest)
}

export async function editingExportCreateCandidate(args: Record<string, unknown>) {
  const resolved = await resolveArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const exportArgs = resolved.args
  const contentUnitId = stringOrNumberValue(exportArgs.contentUnitId ?? exportArgs.content_unit_id)
  if (contentUnitId === undefined) throw new Error('contentUnitId is required')
  const streamId = stringOrNumberValue(exportArgs.streamId ?? exportArgs.stream_id)
  const resourceId = streamId === undefined
    ? requiredResourceIdValue(exportArgs.resourceId ?? exportArgs.resource_id)
    : optionalResourceIdValue(exportArgs.resourceId ?? exportArgs.resource_id)
  const candidateId = stringOrNumberValue(exportArgs.candidateId ?? exportArgs.candidate_id)
  const outputKind = stringValue(exportArgs.outputKind ?? exportArgs.output_kind ?? exportArgs.kind) ?? (streamId !== undefined ? 'hls_stream' : 'video')
  const mimeType = stringValue(exportArgs.mimeType ?? exportArgs.mime_type) ?? defaultMimeTypeForOutputKind(outputKind)
  const durationMs = optionalNumber(exportArgs.durationMs ?? exportArgs.duration_ms)
  const durationSec = optionalNumber(exportArgs.durationSec ?? exportArgs.duration_sec) ?? (durationMs !== undefined ? durationMs / 1000 : undefined)
  const width = optionalNumber(exportArgs.width)
  const height = optionalNumber(exportArgs.height)
  const taskId = stringValue(exportArgs.taskId ?? exportArgs.task_id)
  const resultId = stringValue(exportArgs.resultId ?? exportArgs.result_id)
  const resultBackend = stringValue(exportArgs.backend)
  const outputPath = stringValue(exportArgs.outputPath ?? exportArgs.output_path)
  const manifestPath = stringValue(exportArgs.manifestPath ?? exportArgs.manifest_path)
  const hlsDirectory = stringValue(exportArgs.hlsDirectory ?? exportArgs.hls_directory)
  const editingProjectId = stringValue(exportArgs.editingProjectId ?? exportArgs.editing_project_id)
  const provenance = objectArg(exportArgs, 'provenance')
  const params = objectArg(exportArgs, 'params')
  const segmentPaths = arrayArg(exportArgs.segmentPaths ?? exportArgs.segment_paths)
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  const promptSnapshotRaw = exportArgs.promptSnapshot ?? exportArgs.prompt_snapshot
  const promptSnapshotInput: Record<string, unknown> = isRecord(promptSnapshotRaw)
    ? { ...promptSnapshotRaw }
    : {}
  const outputMetadata: Record<string, unknown> = {
    operation: 'editing_export_create_candidate',
    tool: 'editing_export_create_candidate',
    ...(taskId ? { task_id: taskId } : {}),
    ...(resultId ? { result_id: resultId } : {}),
    ...(resultBackend ? { result_backend: resultBackend } : {}),
    ...(outputPath ? { output_path: outputPath } : {}),
    ...(manifestPath ? { manifest_path: manifestPath } : {}),
    ...(hlsDirectory ? { hls_directory: hlsDirectory } : {}),
    ...(segmentPaths.length > 0 ? { segment_paths: segmentPaths } : {}),
    ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    ...(streamId !== undefined ? { stream_id: streamId } : {}),
    ...(params ? { params } : {}),
    ...(provenance ? { provenance } : {}),
  }
  const candidate = await domainCreateContentCandidate({
    ...exportArgs,
    contentUnitId,
    ...(candidateId !== undefined ? { candidateId } : {}),
    source: stringValue(exportArgs.source) ?? 'editing_export',
    status: stringValue(exportArgs.status) ?? 'imported',
    producer: {
      ...(isRecord(exportArgs.producer) ? exportArgs.producer : {}),
      kind: stringValue((exportArgs.producer as Record<string, unknown> | undefined)?.kind) ?? 'editing',
      tool: 'editing_export_create_candidate',
      ...(taskId ? { task_id: taskId } : {}),
      ...(resultId ? { result_id: resultId } : {}),
      ...(resultBackend ? { result_backend: resultBackend } : {}),
      ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    },
    outputs: [{
      kind: outputKind,
      ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
      ...(streamId !== undefined ? { stream_id: streamId } : {}),
      mime_type: mimeType,
      ...(durationSec !== undefined ? { duration_sec: durationSec } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      metadata: outputMetadata,
    }],
    promptSnapshot: {
      ...promptSnapshotInput,
      schema: 'movscript.editing_export_candidate.v1',
      content_unit_id: contentUnitId,
      ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
      ...(streamId !== undefined ? { stream_id: streamId } : {}),
      ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(resultId ? { result_id: resultId } : {}),
      ...(outputPath ? { output_path: outputPath } : {}),
      ...(manifestPath ? { manifest_path: manifestPath } : {}),
      ...(hlsDirectory ? { hls_directory: hlsDirectory } : {}),
      ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    },
  })
  return {
    status: 'created',
    candidate_created: true,
    adopted: false,
    selected: false,
    content_unit_id: contentUnitId,
    ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
    ...(streamId !== undefined ? { stream_id: streamId } : {}),
    ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
    candidate,
  }
}

export async function editingRuntimeRequired(args: Record<string, unknown>) {
  return {
    status: 'unsupported_runtime',
    code: 'ELECTRON_EDITING_RUNTIME_REQUIRED',
    message: 'This editing tool requires the Electron mediaPipeline runtime. The MCP contract is registered, but runtime IPC is not connected in this process yet.',
    received: Object.keys(args).sort(),
  }
}

export async function mediaPipelineServiceRequired(args: Record<string, unknown>) {
  return {
    status: 'unsupported_runtime',
    code: 'MEDIA_PIPELINE_SERVICE_REQUIRED',
    message: 'This editing tool requires movscript.media.pipeline. Start the local daemon or pass MOVSCRIPT_MEDIA_PIPELINE_URL / --media-pipeline-service-url.',
    received: Object.keys(args).sort(),
  }
}

async function editingTaskSourceCreate(args: Record<string, unknown>, taskType: Extract<EditingServiceTaskRequestType, 'media_transcode' | 'media_reframe'>) {
  return mediaPipelineTaskCreate(taskType, args)
}

async function mediaPipelineTaskCreate(taskType: EditingServiceTaskRequestType, args: Record<string, unknown>) {
  const request = await editingServiceTaskRequest(taskType, args)
  const service = optionalMediaPipelineServiceClient()
  if (service) {
    const response = await service.createTask({ request })
    return taskResult(response.task)
  }
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const task = await runtime.createTask(request)
  return taskResult(task)
}

async function mediaPipelineTaskAction(action: MediaPipelineTaskActionName, request: {
  taskId: string
  options: { projectId?: string }
}) {
  const service = optionalMediaPipelineServiceClient()
  if (!service) return undefined
  return service.taskAction({
    action,
    taskId: request.taskId,
    options: request.options,
  })
}

function optionalMediaPipelineServiceClient() {
  try {
    return createMediaPipelineServiceClientFromRuntime()
  } catch (error) {
    if (error instanceof Error && error.message.includes('movscript.media.pipeline endpoint was not found')) {
      return undefined
    }
    throw error
  }
}

async function resolveArgsWithMediaPipelineResult(args: Record<string, unknown>): Promise<{
  args: Record<string, unknown>
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}> {
  const explicitResult = objectArg(args, 'result')
  const requestedResultId = stringValue(args.resultId ?? args.result_id)
  if (!explicitResult && !requestedResultId) return { args }

  if (explicitResult) {
    return {
      args: {
        ...mediaPipelineResultArgs(explicitResult, args),
        ...args,
      },
      result: explicitResult,
    }
  }

  const service = optionalMediaPipelineServiceClient()
  if (!service) {
    return {
      args,
      error: await mediaPipelineServiceRequired(args),
    }
  }

  const response = await service.getResult({ resultId: requestedResultId as string })
  const result = isRecord(response.result) ? response.result : undefined
  if (!result) {
    return {
      args,
      error: {
        status: 'not_found',
        code: 'MEDIA_PIPELINE_RESULT_NOT_FOUND',
        message: `Media Pipeline result was not found: ${requestedResultId}`,
        result_id: requestedResultId,
      },
    }
  }

  return {
    args: {
      ...mediaPipelineResultArgs(result, args),
      ...args,
    },
    result,
  }
}

function mediaPipelineResultArgs(result: Record<string, unknown>, explicitArgs: Record<string, unknown>): Record<string, unknown> {
  const derived: Record<string, unknown> = {}
  const resultId = resultString(result.resultId ?? result.result_id)
  const projectId = resultString(result.projectId ?? result.project_id)
  const taskId = resultString(result.taskId ?? result.task_id)
  const backend = resultString(result.backend)
  const rawKind = resultString(result.kind)
  const artifactOutputPath = mediaPipelineResultArtifactPath(result, ['video', 'mp4', 'mov', 'webm', rawKind])
  const outputPath = resultString(result.outputPath ?? result.output_path ?? result.path) ?? artifactOutputPath
  const outputName = resultString(result.outputName ?? result.output_name ?? result.name)
    ?? (outputPath ? outputPath.split(/[\\/]/).filter(Boolean).at(-1) : undefined)
  const rawManifestPath = resultString(result.hlsManifestPath
    ?? result.hls_manifest_path
    ?? result.manifestPath
    ?? result.manifest_path)
    ?? mediaPipelineResultArtifactPath(result, ['hls_manifest', 'manifest', 'hls', 'hls_stream', 'm3u8'])
  const segmentPaths = resultStringArray(result.hlsSegmentPaths
    ?? result.hls_segment_paths
    ?? result.segmentPaths
    ?? result.segment_paths)
    ?? mediaPipelineResultArtifactPaths(result, ['hls_segment', 'segment'])
  const hlsDirectory = resultString(result.hlsDirectory ?? result.hls_directory)
  const streamId = result.streamId ?? result.stream_id
  const outputKind = candidateOutputKindForResult(
    resultString(result.outputKind ?? result.output_kind ?? rawKind),
    {
      outputPath,
      manifestPath: rawManifestPath,
      segmentPaths,
      hasStream: streamId !== undefined,
    },
  )
  const manifestPath = rawManifestPath
    ?? (outputKind === 'hls_stream' ? outputPath : undefined)

  addDerivedArg(derived, explicitArgs, ['resultId', 'result_id'], resultId)
  addDerivedArg(derived, explicitArgs, ['mediaProjectId', 'media_project_id'], projectId)
  addDerivedArg(derived, explicitArgs, ['projectId', 'project_id'], projectId)
  addDerivedArg(derived, explicitArgs, ['taskId', 'task_id'], taskId)
  addDerivedArg(derived, explicitArgs, ['backend'], backend)
  addDerivedArg(derived, explicitArgs, ['kind'], rawKind)
  addDerivedArg(derived, explicitArgs, ['outputKind', 'output_kind'], outputKind)
  addDerivedArg(derived, explicitArgs, ['outputPath', 'output_path'], outputPath)
  addDerivedArg(derived, explicitArgs, ['filename'], outputName)
  addDerivedArg(derived, explicitArgs, ['manifestPath', 'manifest_path', 'hlsManifestPath', 'hls_manifest_path'], manifestPath)
  addDerivedArg(derived, explicitArgs, ['hlsDirectory', 'hls_directory'], hlsDirectory)
  addDerivedArg(derived, explicitArgs, ['segmentPaths', 'segment_paths', 'hlsSegmentPaths', 'hls_segment_paths'], segmentPaths)
  addDerivedArg(derived, explicitArgs, ['resourceId', 'resource_id'], result.resourceId ?? result.resource_id)
  addDerivedArg(derived, explicitArgs, ['streamId', 'stream_id'], streamId)
  addDerivedArg(derived, explicitArgs, ['candidateId', 'candidate_id'], result.candidateId ?? result.candidate_id)
  addDerivedArg(derived, explicitArgs, ['provenance'], objectArg(result, 'provenance'))
  addDerivedArg(derived, explicitArgs, ['params'], {
    media_pipeline_result: mediaPipelineResultReference(result),
  })
  return compactRecord(derived)
}

function addDerivedArg(
  target: Record<string, unknown>,
  explicitArgs: Record<string, unknown>,
  keys: string[],
  value: unknown,
): void {
  if (value === undefined || hasExplicitArg(explicitArgs, keys)) return
  for (const key of keys) target[key] = value
}

function hasExplicitArg(args: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = args[key]
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return Boolean(value.trim())
    return true
  })
}

function candidateOutputKindForResult(
  value: string | undefined,
  hls: { outputPath?: string, manifestPath?: string, segmentPaths?: string[], hasStream?: boolean },
): string | undefined {
  const normalized = value?.trim().toLowerCase()
  const hlsLike = hls.hasStream
    || Boolean(hls.manifestPath)
    || Boolean(hls.outputPath?.toLowerCase().endsWith('.m3u8'))
    || Boolean(hls.segmentPaths?.length)
    || normalized === 'hls'
    || normalized === 'hls_stream'
    || normalized === 'm3u8'
  if (hlsLike) return 'hls_stream'
  if (!normalized) return undefined
  if (['video', 'mp4', 'mov', 'webm', 'mkv', 'avi'].includes(normalized)) return 'video'
  if (['audio', 'mp3', 'wav', 'm4a', 'aac', 'flac'].includes(normalized)) return 'audio'
  if (['image', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(normalized)) return 'image'
  if (['subtitle', 'subtitles', 'text', 'srt', 'vtt'].includes(normalized)) return 'subtitle'
  return value
}

function mediaPipelineResultReference(result: Record<string, unknown>): Record<string, unknown> {
  const outputPath = resultString(result.outputPath ?? result.output_path ?? result.path)
    ?? mediaPipelineResultArtifactPath(result, ['video', 'mp4', 'mov', 'webm', resultString(result.kind)])
  const manifestPath = resultString(result.hlsManifestPath ?? result.hls_manifest_path ?? result.manifestPath ?? result.manifest_path)
    ?? mediaPipelineResultArtifactPath(result, ['hls_manifest', 'manifest', 'hls', 'hls_stream', 'm3u8'])
  const segmentPaths = resultStringArray(result.hlsSegmentPaths ?? result.hls_segment_paths ?? result.segmentPaths ?? result.segment_paths)
    ?? mediaPipelineResultArtifactPaths(result, ['hls_segment', 'segment'])
  return compactRecord({
    resultId: resultString(result.resultId ?? result.result_id),
    result_id: resultString(result.resultId ?? result.result_id),
    mediaProjectId: resultString(result.projectId ?? result.project_id),
    media_project_id: resultString(result.projectId ?? result.project_id),
    project_id: resultString(result.projectId ?? result.project_id),
    task_id: resultString(result.taskId ?? result.task_id),
    backend: resultString(result.backend),
    kind: resultString(result.kind),
    output_kind: candidateOutputKindForResult(resultString(result.outputKind ?? result.output_kind ?? result.kind), {
      outputPath,
      manifestPath,
      segmentPaths,
      hasStream: result.streamId !== undefined || result.stream_id !== undefined,
    }),
    output_path: outputPath,
    manifest_path: manifestPath,
    segment_paths: segmentPaths,
    stream_id: result.streamId ?? result.stream_id,
    resource_id: result.resourceId ?? result.resource_id,
    candidate_id: result.candidateId ?? result.candidate_id,
  })
}

function mediaPipelineResultArtifactPath(result: Record<string, unknown>, kinds: Array<string | undefined>): string | undefined {
  return mediaPipelineResultArtifactPaths(result, kinds)[0]
}

function mediaPipelineResultArtifactPaths(result: Record<string, unknown>, kinds: Array<string | undefined>): string[] {
  const normalizedKinds = new Set(kinds
    .map((kind) => kind?.trim().toLowerCase())
    .filter((kind): kind is string => Boolean(kind)))
  return arrayArg(result.artifacts)
    .filter(isRecord)
    .filter((artifact) => {
      if (normalizedKinds.size === 0) return true
      const kind = resultString(artifact.kind)?.toLowerCase()
      return kind ? normalizedKinds.has(kind) : false
    })
    .map((artifact) => resultString(artifact.path ?? artifact.outputPath ?? artifact.output_path))
    .filter((path): path is string => Boolean(path))
}

async function editingRuntimeTaskSnapshot(args: Record<string, unknown>, runtime: NonNullable<ReturnType<typeof getEditingRuntimePort>> | undefined) {
  if (!stringValue(args.taskId ?? args.task_id) || !runtime?.getTask) return undefined
  const action = await editingServiceRuntimeTaskAction('getTask', args)
  return runtime.getTask(action.taskId, action.options)
}

async function composeEditingProject(args: Record<string, unknown>): Promise<MediaEditingProject> {
  const explicitProject = objectArg(args, 'editingProject') ?? objectArg(args, 'editing_project') ?? objectArg(args, 'project')
  if (explicitProject) return editingProjectArg(args)

  const editingProjectId = stringValue(args.editingProjectId ?? args.editing_project_id)
  if (editingProjectId) {
    const result = await editingProjectGet({
      projectId: projectIdValue(args) ?? STANDALONE_EDITING_PROJECT_ID,
      editingProjectId,
    })
    return editingProjectFromServiceResult(result)
  }

  throw new Error('editingProject or editingProjectId is required')
}

function normalizeRenderRuntime(value: unknown): {
  value: string
  supported: boolean
} {
  const runtime = stringValue(value) ?? 'movscript_media_pipeline'
  return {
    value: runtime,
    supported: runtime === 'movscript_media_pipeline' || runtime === 'ffmpeg',
  }
}

function timelineValidationHasErrors(validation: unknown): boolean {
  if (!isRecord(validation)) return true
  if (validation.valid === false) return true
  const diagnostics = Array.isArray(validation.diagnostics) ? validation.diagnostics : []
  return diagnostics.some((diagnostic) => isRecord(diagnostic) && diagnostic.severity === 'error')
}

function editingProjectArg(args: Record<string, unknown>): MediaEditingProject {
  const project = objectArg(args, 'editingProject') ?? objectArg(args, 'editing_project') ?? objectArg(args, 'project')
  if (!project) throw new Error('editingProject is required')
  assertMediaEditingProjectEnvelope(project)
  return project as unknown as MediaEditingProject
}

function assertMediaEditingProjectEnvelope(project: Record<string, unknown>): void {
  if (project.version !== 1 || !stringValue(project.id) || !stringValue(project.projectId ?? project.project_id)) {
    throw new Error('editingProject must be a MediaEditingProject v1 object')
  }
  if (!isRecord(project.timeline) || project.timeline.version !== 1 || !Array.isArray(project.timeline.tracks)) {
    throw new Error('editingProject.timeline must be a MediaTimelineRecipe v1 object')
  }
  if (!isRecord(project.assets) || !Array.isArray(project.assets.assets)) {
    throw new Error('editingProject.assets must contain an assets array')
  }
}

function editingProjectFromServiceResult(result: unknown): MediaEditingProject {
  const record = isRecord(result) ? result : undefined
  const project = record && (isRecord(record.editing_project)
    ? record.editing_project
    : isRecord(record.editingProject)
      ? record.editingProject
      : undefined)
  if (!project) throw new Error('editing service did not return editing_project')
  assertMediaEditingProjectEnvelope(project)
  return project as unknown as MediaEditingProject
}

function projectIdValue(args: Record<string, unknown>): string | undefined {
  const value = args.mediaProjectId ?? args.media_project_id ?? args.projectId ?? args.project_id
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function editingProjectIdValue(args: Record<string, unknown>): string {
  const editingProjectId = stringValue(args.editingProjectId ?? args.editing_project_id)
  if (!editingProjectId) throw new Error('editingProjectId is required')
  return editingProjectId
}

function requiredResourceIdValue(value: unknown): number {
  const resourceId = optionalNumber(value)
  if (resourceId === undefined || !Number.isInteger(resourceId) || resourceId <= 0) throw new Error('resourceId is required')
  return resourceId
}

function optionalResourceIdValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requiredResourceIdValue(value)
}

function defaultMimeTypeForOutputKind(kind: string): string {
  if (kind === 'audio') return 'audio/mpeg'
  if (kind === 'image') return 'image/png'
  if (kind === 'hls_stream') return 'application/vnd.apple.mpegurl'
  if (kind === 'subtitle' || kind === 'text') return 'text/plain'
  return 'video/mp4'
}

function taskResult(task: unknown) {
  return {
    status: 'ok',
    task,
    media_pipeline_task: task,
  }
}

function mediaPipelineResultInput(args: Record<string, unknown>): Record<string, unknown> {
  const explicit = objectArg(args, 'result')
  if (explicit) return explicit
  return compactRecord({
    resultId: stringValue(args.resultId ?? args.result_id),
    projectId: projectIdValue(args),
    taskId: stringValue(args.taskId ?? args.task_id),
    backend: stringValue(args.backend),
    kind: stringValue(args.kind ?? args.outputKind ?? args.output_kind),
    outputKind: stringValue(args.outputKind ?? args.output_kind ?? args.kind),
    status: stringValue(args.status),
    source: stringValue(args.source),
    outputPath: stringValue(args.outputPath ?? args.output_path),
    outputName: stringValue(args.outputName ?? args.output_name ?? args.filename),
    hlsManifestPath: stringValue(args.hlsManifestPath ?? args.hls_manifest_path ?? args.manifestPath ?? args.manifest_path),
    hlsDirectory: stringValue(args.hlsDirectory ?? args.hls_directory),
    hlsSegmentPaths: arrayArg(args.hlsSegmentPaths ?? args.hls_segment_paths ?? args.segmentPaths ?? args.segment_paths)
      .filter((item): item is string => typeof item === 'string' && Boolean(item.trim())),
    resourceId: args.resourceId ?? args.resource_id,
    streamId: args.streamId ?? args.stream_id,
    candidateId: args.candidateId ?? args.candidate_id,
    provenance: objectArg(args, 'provenance'),
    metadata: objectArg(args, 'metadata') ?? objectArg(args, 'params'),
  })
}

function externalNleResultWatchInput(args: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    watchId: stringValue(args.watchId ?? args.watch_id),
    resultId: stringValue(args.resultId ?? args.result_id),
    projectId: projectIdValue(args),
    taskId: stringValue(args.taskId ?? args.task_id),
    outputPath: stringValue(args.outputPath ?? args.output_path),
    outputDirectory: stringValue(args.outputDirectory ?? args.output_directory ?? args.watchDirectory ?? args.watch_directory ?? args.exportDirectory ?? args.export_directory),
    hlsManifestPath: stringValue(args.hlsManifestPath ?? args.hls_manifest_path ?? args.manifestPath ?? args.manifest_path),
    hlsDirectory: stringValue(args.hlsDirectory ?? args.hls_directory),
    hlsSegmentPaths: arrayArg(args.hlsSegmentPaths ?? args.hls_segment_paths ?? args.segmentPaths ?? args.segment_paths)
      .filter((item): item is string => typeof item === 'string' && Boolean(item.trim())),
    pollIntervalMs: optionalNumber(args.pollIntervalMs ?? args.poll_interval_ms),
    timeoutMs: optionalNumber(args.timeoutMs ?? args.timeout_ms),
    exchangeProjectPath: stringValue(args.exchangeProjectPath ?? args.exchange_project_path),
    externalApp: stringValue(args.externalApp ?? args.external_app ?? args.externalNle ?? args.external_nle),
    reviewer: stringValue(args.reviewer),
    reviewStatus: stringValue(args.reviewStatus ?? args.review_status),
    outputKind: stringValue(args.outputKind ?? args.output_kind),
    provenance: objectArg(args, 'provenance'),
    metadata: objectArg(args, 'metadata') ?? objectArg(args, 'params'),
  })
}

async function detectExternalNleResult(args: Record<string, unknown>): Promise<{
  result?: Record<string, unknown>
  detected?: Record<string, unknown>
  error?: Record<string, unknown>
}> {
  const waitForMs = boundedNumber(optionalNumber(args.waitForMs ?? args.wait_for_ms), 0, 600_000) ?? 0
  const pollIntervalMs = boundedNumber(optionalNumber(args.pollIntervalMs ?? args.poll_interval_ms), 50, 10_000) ?? 500
  const deadline = Date.now() + waitForMs
  let attempts = 0
  let latest: Awaited<ReturnType<typeof detectExternalNleResultOnce>>
  do {
    attempts += 1
    latest = await detectExternalNleResultOnce(args, {
      attempts,
      waitForMs,
      pollIntervalMs,
      waitedMs: Math.max(0, Math.min(waitForMs, waitForMs - Math.max(0, deadline - Date.now()))),
    })
    if (!latest.error) return latest
    if (Date.now() >= deadline) break
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())))
  } while (Date.now() <= deadline)
  return latest
}

async function detectExternalNleResultOnce(args: Record<string, unknown>, watch: {
  attempts: number
  waitForMs: number
  pollIntervalMs: number
  waitedMs: number
}): Promise<{
  result?: Record<string, unknown>
  detected?: Record<string, unknown>
  error?: Record<string, unknown>
}> {
  const explicitManifestPath = pathValue(args.manifestPath ?? args.manifest_path ?? args.hlsManifestPath ?? args.hls_manifest_path)
  const explicitOutputPath = pathValue(args.outputPath ?? args.output_path)
  const outputDirectory = pathValue(args.outputDirectory ?? args.output_directory ?? args.watchDirectory ?? args.watch_directory ?? args.exportDirectory ?? args.export_directory)
  const files = outputDirectory ? await listExternalNleFiles(outputDirectory) : []
  const manifestPath = explicitManifestPath ?? newestFilePath(files.filter((file) => file.kind === 'hls_manifest'))
  const outputPath = manifestPath
    ? undefined
    : explicitOutputPath ?? newestFilePath(files.filter((file) => file.kind === 'video'))
  if (!manifestPath && !outputPath) {
    return {
      error: {
        status: 'not_found',
        code: 'EXTERNAL_NLE_RESULT_NOT_FOUND',
        message: 'No external NLE output artifact was found. Pass outputPath/manifestPath or an outputDirectory containing a video file or HLS manifest.',
        backend: 'external_nle',
        output_directory: outputDirectory,
        watch: compactRecord({
          attempts: watch.attempts,
          wait_for_ms: watch.waitForMs,
          poll_interval_ms: watch.pollIntervalMs,
          waited_ms: watch.waitedMs,
        }),
        candidate_created: false,
        adopted: false,
        selected: false,
      },
    }
  }

  const hlsSegmentPaths = manifestPath
    ? uniqueStrings([
      ...arrayArg(args.segmentPaths ?? args.segment_paths).filter((item): item is string => typeof item === 'string' && Boolean(item.trim())),
      ...files.filter((file) => file.kind === 'hls_segment').map((file) => file.path),
    ])
    : undefined
  const kind = manifestPath ? 'hls' : outputKindFromPath(outputPath)
  const outputKind = manifestPath ? 'hls_stream' : stringValue(args.outputKind ?? args.output_kind) ?? 'video'
  const projectId = projectIdValue(args)
  const resultId = stringValue(args.resultId ?? args.result_id)
  const detectedPath = manifestPath ?? outputPath
  const outputName = stringValue(args.outputName ?? args.output_name ?? args.filename) ?? (detectedPath ? basename(detectedPath) : undefined)
  const detected = compactRecord({
    backend: 'external_nle',
    kind,
    output_kind: outputKind,
    output_path: outputPath,
    hls_manifest_path: manifestPath,
    hls_directory: manifestPath ? (pathValue(args.hlsDirectory ?? args.hls_directory) ?? dirname(manifestPath)) : undefined,
    hls_segment_paths: hlsSegmentPaths,
    output_directory: outputDirectory,
    file_count: files.length,
    watch: compactRecord({
      attempts: watch.attempts,
      wait_for_ms: watch.waitForMs,
      poll_interval_ms: watch.pollIntervalMs,
      waited_ms: watch.waitedMs,
    }),
  })
  const provenance = compactRecord({
    ...objectArg(args, 'provenance'),
    backend: 'external_nle',
    recovery: watch.waitForMs > 0 ? 'watch_once' : 'auto_detect',
    output_directory: outputDirectory,
    exchange_project_path: pathValue(args.exchangeProjectPath ?? args.exchange_project_path),
    external_app: stringValue(args.externalApp ?? args.external_app ?? args.externalNle ?? args.external_nle),
    reviewer: stringValue(args.reviewer),
    review_status: stringValue(args.reviewStatus ?? args.review_status),
  })
  const metadata = compactRecord({
    ...objectArg(args, 'metadata'),
    ...objectArg(args, 'params'),
    detection: detected,
  })
  return {
    detected,
    result: compactRecord({
      resultId,
      projectId,
      taskId: stringValue(args.taskId ?? args.task_id),
      backend: 'external_nle',
      kind,
      outputKind,
      status: stringValue(args.status) ?? 'available',
      source: stringValue(args.source) ?? 'external_nle_result_recovery',
      outputPath,
      outputName,
      hlsManifestPath: manifestPath,
      hlsDirectory: manifestPath ? (pathValue(args.hlsDirectory ?? args.hls_directory) ?? dirname(manifestPath)) : undefined,
      hlsSegmentPaths,
      provenance,
      metadata,
    }),
  }
}

async function listExternalNleFiles(root: string): Promise<Array<{ path: string, kind: string, mtimeMs: number }>> {
  const absoluteRoot = resolve(root)
  const discovered: Array<{ path: string, kind: string, mtimeMs: number }> = []
  async function visit(directory: string): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (isNotFoundError(error)) return
      throw error
    }
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const fileKind = externalNleFileKind(absolutePath)
      if (!fileKind) continue
      const fileStat = await stat(absolutePath)
      discovered.push({ path: absolutePath, kind: fileKind, mtimeMs: fileStat.mtimeMs })
    }
  }
  await visit(absoluteRoot)
  return discovered
}

function boundedNumber(value: number | undefined, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined
  return Math.min(maximum, Math.max(minimum, value))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

function newestFilePath(files: Array<{ path: string, mtimeMs: number }>): string | undefined {
  return [...files].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))[0]?.path
}

function externalNleFileKind(filePath: string): string | undefined {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.m3u8') return 'hls_manifest'
  if (['.ts', '.m4s', '.cmfv', '.cmfa'].includes(extension)) return 'hls_segment'
  if (['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'].includes(extension)) return 'video'
  return undefined
}

function externalNleAppName(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['final_cut_pro', 'final_cut', 'fcpx', 'fcp'].includes(normalized)) return 'Final Cut Pro'
  if (['premiere', 'premiere_pro', 'adobe_premiere', 'adobe_premiere_pro'].includes(normalized)) return 'Adobe Premiere Pro'
  if (['davinci', 'davinci_resolve', 'resolve'].includes(normalized)) return 'DaVinci Resolve'
  return value
}

function externalNleOpenCommand({
  exchangeProjectPath,
  appName,
  platform,
}: {
  exchangeProjectPath: string
  appName?: string
  platform: string
}): { executable: string; argv: string[] } {
  if (platform === 'darwin') {
    return appName
      ? { executable: 'open', argv: ['-a', appName, exchangeProjectPath] }
      : { executable: 'open', argv: [exchangeProjectPath] }
  }
  if (platform === 'win32') {
    return { executable: 'cmd', argv: ['/c', 'start', '', exchangeProjectPath] }
  }
  return { executable: 'xdg-open', argv: [exchangeProjectPath] }
}

function runExternalNleOpenCommand(command: { executable: string; argv: string[] }): Promise<void> {
  return new Promise((resolveOpen, reject) => {
    const child = spawn(command.executable, command.argv, {
      stdio: 'ignore',
      detached: true,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolveOpen()
    })
  })
}

function outputKindFromPath(filePath: string | undefined): string {
  const extension = extname(filePath ?? '').toLowerCase()
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac'].includes(extension)) return 'audio'
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image'
  return extension ? extension.slice(1) : 'video'
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()))]
}

function pathValue(value: unknown): string | undefined {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const direct = args[key]
  if (isRecord(direct)) return direct
  return undefined
}

function arrayArg(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function resultString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function resultStringArray(value: unknown): string[] | undefined {
  const items = arrayArg(value)
    .map((item) => resultString(item))
    .filter((item): item is string => Boolean(item))
  return items.length > 0 ? items : undefined
}

function stringOrNumberValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringValue(value)
}

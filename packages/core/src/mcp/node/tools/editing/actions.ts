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

export async function editingProjectCreateFromEditPlan(args: Record<string, unknown>) {
  const result = await editingServiceProjectCommand('createProjectFromEditPlan', args)
  return persistCreatedEditingProject(editingProjectFromServiceResult(result), result)
}

export async function editingProjectCreateFromEditDecisions(args: Record<string, unknown>) {
  const result = await editingServiceProjectCommand('createProjectFromEditDecisions', args)
  return persistCreatedEditingProject(editingProjectFromServiceResult(result), result)
}

export async function editingVideoCompose(args: Record<string, unknown>) {
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

export async function editingExportImportResource(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.importExportResource) return editingRuntimeRequired(args)
  const task = await editingRuntimeTaskSnapshot(args, runtime)
  const envelope = await editingServiceTaskAction('importExportResource', {
    ...args,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return an import export resource request')
  return runtime.importExportResource(envelope.request as unknown as EditingRuntimeExportImportRequest)
}

export async function editingExportSaveLocal(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  const taskId = stringValue(args.taskId ?? args.task_id)
  const explicitOutputPath = stringValue(args.outputPath ?? args.output_path)
  if (taskId && !explicitOutputPath && !runtime?.getTask) return editingRuntimeRequired(args)
  const task = await editingRuntimeTaskSnapshot(args, runtime)
  const envelope = await editingServiceTaskAction('saveLocalExport', {
    ...args,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return a save local export request')
  if (!runtime?.saveLocalExport) return editingRuntimeRequired(args)
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
  const runtime = getEditingRuntimePort()
  if (!runtime?.publishHlsStream) return editingRuntimeRequired(args)
  const task = await editingRuntimeTaskSnapshot(args, runtime)
  const envelope = await editingServiceTaskAction('publishHlsStream', {
    ...args,
    ...(task ? { task } : {}),
  })
  if (envelope.result !== undefined) return envelope.result
  if (!envelope.request) throw new Error('editing service did not return an HLS publish request')
  return runtime.publishHlsStream(envelope.request as unknown as EditingRuntimeHlsPublishRequest)
}

export async function editingExportCreateCandidate(args: Record<string, unknown>) {
  const contentUnitId = stringOrNumberValue(args.contentUnitId ?? args.content_unit_id)
  if (contentUnitId === undefined) throw new Error('contentUnitId is required')
  const streamId = stringOrNumberValue(args.streamId ?? args.stream_id)
  if (streamId !== undefined && args.resourceId === undefined && args.resource_id === undefined) {
    return {
      status: 'unsupported_output',
      code: 'HLS_STREAM_CANDIDATE_UNSUPPORTED',
      message: 'editing_export_create_candidate currently writes RawResource-backed candidates only. HLS MediaStreamArtifact candidate outputs require a future domain candidate schema extension; keep the stream as a hosted preview or create a RawResource export before writing a candidate.',
      content_unit_id: contentUnitId,
      streamId,
      stream_id: streamId,
    }
  }
  const resourceId = requiredResourceIdValue(args.resourceId ?? args.resource_id)
  const candidateId = stringOrNumberValue(args.candidateId ?? args.candidate_id)
  const outputKind = stringValue(args.outputKind ?? args.output_kind ?? args.kind) ?? 'video'
  const mimeType = stringValue(args.mimeType ?? args.mime_type) ?? defaultMimeTypeForOutputKind(outputKind)
  const durationMs = optionalNumber(args.durationMs ?? args.duration_ms)
  const durationSec = optionalNumber(args.durationSec ?? args.duration_sec) ?? (durationMs !== undefined ? durationMs / 1000 : undefined)
  const width = optionalNumber(args.width)
  const height = optionalNumber(args.height)
  const taskId = stringValue(args.taskId ?? args.task_id)
  const outputPath = stringValue(args.outputPath ?? args.output_path)
  const editingProjectId = stringValue(args.editingProjectId ?? args.editing_project_id)
  const provenance = objectArg(args, 'provenance')
  const promptSnapshotRaw = args.promptSnapshot ?? args.prompt_snapshot
  const promptSnapshotInput: Record<string, unknown> = isRecord(promptSnapshotRaw)
    ? { ...promptSnapshotRaw }
    : {}
  const outputMetadata: Record<string, unknown> = {
    operation: 'editing_export_create_candidate',
    tool: 'editing_export_create_candidate',
    ...(taskId ? { task_id: taskId } : {}),
    ...(outputPath ? { output_path: outputPath } : {}),
    ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    ...(provenance ? { provenance } : {}),
  }
  const candidate = await domainCreateContentCandidate({
    ...args,
    contentUnitId,
    ...(candidateId !== undefined ? { candidateId } : {}),
    source: stringValue(args.source) ?? 'editing_export',
    status: stringValue(args.status) ?? 'imported',
    producer: {
      ...(isRecord(args.producer) ? args.producer : {}),
      kind: stringValue((args.producer as Record<string, unknown> | undefined)?.kind) ?? 'editing',
      tool: 'editing_export_create_candidate',
      ...(taskId ? { task_id: taskId } : {}),
      ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    },
    outputs: [{
      kind: outputKind,
      resource_id: resourceId,
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
      resource_id: resourceId,
      ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(outputPath ? { output_path: outputPath } : {}),
      ...(editingProjectId ? { editing_project_id: editingProjectId } : {}),
    },
  })
  return {
    status: 'created',
    candidate_created: true,
    adopted: false,
    selected: false,
    content_unit_id: contentUnitId,
    resource_id: resourceId,
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

async function editingRuntimeTaskSnapshot(args: Record<string, unknown>, runtime: NonNullable<ReturnType<typeof getEditingRuntimePort>> | undefined) {
  if (!stringValue(args.taskId ?? args.task_id) || !runtime?.getTask) return undefined
  const action = await editingServiceRuntimeTaskAction('getTask', args)
  return runtime.getTask(action.taskId, action.options)
}

async function composeEditingProject(args: Record<string, unknown>): Promise<MediaEditingProject> {
  const explicitProject = objectArg(args, 'editingProject') ?? objectArg(args, 'editing_project') ?? objectArg(args, 'project')
  if (explicitProject) return editingProjectArg(args)

  const editingProjectId = stringValue(args.editingProjectId ?? args.editing_project_id)
  if (editingProjectId && !objectArg(args, 'editDecisions') && !objectArg(args, 'edit_decisions')) {
    const result = await editingProjectGet({
      projectId: projectIdValue(args) ?? STANDALONE_EDITING_PROJECT_ID,
      editingProjectId,
    })
    return editingProjectFromServiceResult(result)
  }

  const editDecisions = objectArg(args, 'editDecisions') ?? objectArg(args, 'edit_decisions')
  if (editDecisions) {
    const result = await editingProjectCreateFromEditDecisions(args)
    return editingProjectFromServiceResult(result)
  }

  throw new Error('editingProject, editingProjectId, or editDecisions is required')
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
  const value = args.projectId ?? args.project_id
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

function defaultMimeTypeForOutputKind(kind: string): string {
  if (kind === 'audio') return 'audio/mpeg'
  if (kind === 'image') return 'image/png'
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

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const direct = args[key]
  if (isRecord(direct)) return direct
  return undefined
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

function stringOrNumberValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringValue(value)
}

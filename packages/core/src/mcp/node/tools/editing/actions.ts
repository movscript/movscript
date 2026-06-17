import {
  createMediaEditingProjectFromMovScriptEditPlan,
  createMediaEditingProjectService,
  type MediaAssetDescriptor,
  type MediaClip,
  type MediaClipPatch,
  type MediaEditingProject,
  type MediaTimelineCommand,
  type MediaTimelineFit,
  type MediaTrack,
  type MediaTrackType,
  type MovScriptEditPlanArtifact,
  validateMediaEditingProjectTimeline,
} from '@movscript/editing'
import { getOptionalNumeric, numericValue } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import {
  getEditingRuntimePort,
  type EditingRuntimeHlsPublishRequest,
  type EditingMediaPipelineOutputSpec,
  type EditingMediaPipelineTaskType,
} from './runtime.js'
import { domainCreateContentCandidate } from '../domain/actions.js'

export async function editingProjectCreate(args: Record<string, unknown>) {
  const now = new Date().toISOString()
  const projectId = stringValue(args.projectId ?? args.project_id) ?? 'local'
  const width = numericValue(args.width) ?? 1080
  const height = numericValue(args.height) ?? 1920
  const fps = numericValue(args.fps) ?? 30
  const background = stringValue(args.background) ?? '#000000'
  return {
    status: 'ok',
    editing_project: {
      version: 1,
      id: `editing_project_${Date.now()}`,
      projectId,
      title: stringValue(args.title) ?? 'Untitled edit',
      source: { kind: 'manual' },
      timeline: {
        version: 1,
        id: `timeline_${Date.now()}`,
        fps,
        width,
        height,
        background,
        durationMs: 0,
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
  }
}

export async function editingProjectCreateFromEditPlan(args: Record<string, unknown>) {
  const editPlan = objectArg(args, 'editPlan') ?? objectArg(args, 'edit_plan')
  if (!editPlan) throw new Error('editPlan is required')
  const defaultDurationMs = getOptionalNumeric(args, 'defaultDurationMs') ?? getOptionalNumeric(args, 'default_duration_ms')
  const editingProject = createMediaEditingProjectFromMovScriptEditPlan(editPlan as unknown as MovScriptEditPlanArtifact, {
    projectId: stringValue(args.projectId ?? args.project_id),
    title: stringValue(args.title),
    width: getOptionalNumeric(args, 'width'),
    height: getOptionalNumeric(args, 'height'),
    fps: getOptionalNumeric(args, 'fps'),
    background: stringValue(args.background),
    defaultDurationMs,
  })
  return {
    status: 'ok',
    editing_project: editingProject,
  }
}

export async function editingProjectAddAsset(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const asset = mediaAssetArg(args)
  const next = cloneProject(project)
  if (next.assets.assets.some((candidate) => candidate.id === asset.id)) {
    throw new Error(`Media asset already exists: ${asset.id}`)
  }
  next.assets.assets.push(asset)
  next.assets.assets.sort((left, right) => left.id.localeCompare(right.id))
  touchProject(next)
  return {
    status: 'ok',
    asset,
    media_asset: asset,
    editing_project: next,
  }
}

export async function editingProjectRemoveAsset(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const assetId = assetIdValue(args)
  const referenced = project.timeline.tracks
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .find(({ clip }) => clip.asset?.id === assetId)
  if (referenced) {
    throw new Error(`Cannot remove media asset ${assetId}; it is still referenced by clip ${referenced.clip.id} on track ${referenced.track.id}`)
  }
  const next = cloneProject(project)
  const before = next.assets.assets.length
  next.assets.assets = next.assets.assets.filter((asset) => asset.id !== assetId)
  if (next.assets.assets.length === before) {
    return {
      status: 'not_found',
      asset_id: assetId,
      editing_project: next,
    }
  }
  touchProject(next)
  return {
    status: 'ok',
    asset_id: assetId,
    editing_project: next,
  }
}

export async function editingProjectSave(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.saveProject) return editingRuntimeRequired(args)
  const project = editingProjectArg(args)
  const expectedRevision = getOptionalNumeric(args, 'expectedRevision') ?? getOptionalNumeric(args, 'expected_revision')
  return runtime.saveProject(project as unknown as Record<string, unknown>, { expectedRevision })
}

export async function editingProjectGet(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.getProject) return editingRuntimeRequired(args)
  const projectId = projectIdValue(args)
  if (!projectId) throw new Error('projectId is required')
  const editingProjectId = editingProjectIdValue(args)
  return runtime.getProject({ projectId, editingProjectId })
}

export async function editingProjectUpdateSettings(args: Record<string, unknown>) {
  const next = cloneProject(editingProjectArg(args))
  const title = stringValue(args.title)
  const width = optionalNumber(args.width)
  const height = optionalNumber(args.height)
  const fps = optionalNumber(args.fps)
  const background = stringValue(args.background)
  const workspace = objectArg(args, 'workspace')
  if (title) next.title = title
  if (width !== undefined) next.timeline.width = width
  if (height !== undefined) next.timeline.height = height
  if (fps !== undefined) next.timeline.fps = fps
  if (background) next.timeline.background = background
  if (workspace) next.workspace = workspace as unknown as MediaEditingProject['workspace']
  touchProject(next)
  return {
    status: 'ok',
    editing_project: next,
  }
}

export async function editingTimelineApplyCommands(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const commands = commandList(args)
  const service = createMediaEditingProjectService(project)
  for (const command of commands) service.applyCommand(command)
  return {
    status: 'ok',
    editing_project: service.getProject(),
    applied_count: commands.length,
  }
}

export async function editingTimelineValidate(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const diagnostics = validateMediaEditingProjectTimeline(project)
  return {
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'diagnostics' : 'ok',
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  }
}

export async function editingTimelineAddTrack(args: Record<string, unknown>) {
  const track = mediaTrackArg(args)
  const editingProject = applySingleTimelineCommand(args, { type: 'add_track', track })
  return {
    status: 'ok',
    track_id: track.id,
    track,
    editing_project: editingProject,
  }
}

export async function editingTimelineRemoveTrack(args: Record<string, unknown>) {
  const trackId = trackIdValue(args)
  const editingProject = applySingleTimelineCommand(args, { type: 'remove_track', trackId })
  return {
    status: 'ok',
    track_id: trackId,
    editing_project: editingProject,
  }
}

export async function editingTimelineAddClip(args: Record<string, unknown>) {
  const project = editingProjectArg(args)
  const trackId = trackIdValue(args)
  const clip = mediaClipArg(args, project)
  const editingProject = applyTimelineCommand(project, { type: 'add_clip', trackId, clip })
  return {
    status: 'ok',
    track_id: trackId,
    clip_id: clip.id,
    clip,
    editing_project: editingProject,
  }
}

export async function editingTimelineUpdateClip(args: Record<string, unknown>) {
  const clipId = clipIdValue(args)
  const patch = mediaClipPatchArg(args)
  const editingProject = applySingleTimelineCommand(args, { type: 'update_clip', clipId, patch })
  return {
    status: 'ok',
    clip_id: clipId,
    clip: findClip(editingProject, clipId)?.clip,
    editing_project: editingProject,
  }
}

export async function editingTimelineSplitClip(args: Record<string, unknown>) {
  const clipId = clipIdValue(args)
  const splitTimeMs = requiredNumeric(args, 'splitTimeMs', 'split_time_ms')
  const retainSide = retainSideValue(args.retainSide ?? args.retain_side)
  const editingProject = applySingleTimelineCommand(args, {
    type: 'split_clip',
    clipId,
    splitTimeMs,
    ...(retainSide ? { retainSide } : {}),
  })
  return {
    status: 'ok',
    clip_id: clipId,
    clips: relatedSplitClips(editingProject, clipId),
    editing_project: editingProject,
  }
}

export async function editingTimelineMoveClip(args: Record<string, unknown>) {
  const clipId = clipIdValue(args)
  const timelineStartMs = requiredNumeric(args, 'timelineStartMs', 'timeline_start_ms')
  const targetTrackId = stringValue(args.targetTrackId ?? args.target_track_id)
  const editingProject = applySingleTimelineCommand(args, {
    type: 'move_clip',
    clipId,
    timelineStartMs,
    ...(targetTrackId ? { targetTrackId } : {}),
  })
  return {
    status: 'ok',
    clip_id: clipId,
    clip: findClip(editingProject, clipId)?.clip,
    editing_project: editingProject,
  }
}

export async function editingTimelineDeleteClip(args: Record<string, unknown>) {
  const clipId = clipIdValue(args)
  const editingProject = applySingleTimelineCommand(args, { type: 'delete_clip', clipId })
  return {
    status: 'ok',
    clip_id: clipId,
    editing_project: editingProject,
  }
}

export async function editingRuntimeCapabilitiesGet(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.getCapabilities) return editingRuntimeRequired(args)
  return runtime.getCapabilities()
}

export async function editingTaskRenderCreate(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const project = editingProjectArg(args)
  const task = await runtime.createTask({
    projectId: projectIdValue(args) ?? project.projectId,
    taskType: 'timeline_render',
    editingProject: project as unknown as Record<string, unknown>,
    timeline: project.timeline as unknown as Record<string, unknown>,
    ...resourceRuntimeOptions(args),
    output: outputSpec(args, 'mp4'),
  })
  return taskResult(task)
}

export async function editingTaskHlsCreate(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const project = editingProjectArg(args)
  const task = await runtime.createTask({
    projectId: projectIdValue(args) ?? project.projectId,
    taskType: 'timeline_hls',
    editingProject: project as unknown as Record<string, unknown>,
    timeline: project.timeline as unknown as Record<string, unknown>,
    ...resourceRuntimeOptions(args),
    output: outputSpec(args, 'hls'),
  })
  return taskResult(task)
}

export async function editingTaskTranscodeCreate(args: Record<string, unknown>) {
  return editingTaskSourceCreate(args, 'media_transcode')
}

export async function editingTaskReframeCreate(args: Record<string, unknown>) {
  return editingTaskSourceCreate(args, 'media_reframe')
}

export async function editingTaskGet(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const taskId = taskIdValue(args)
  const task = await runtime.getTask(taskId, { projectId: projectIdValue(args) })
  if (!task) {
    return {
      status: 'not_found',
      task_id: taskId,
    }
  }
  return taskResult(task)
}

export async function editingTaskCancel(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  return taskResult(await runtime.cancelTask(taskIdValue(args), { projectId: projectIdValue(args) }))
}

export async function editingTaskLogsGet(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const taskId = taskIdValue(args)
  if (!runtime.getTaskLogs) {
    return {
      status: 'unsupported_runtime',
      code: 'EDITING_TASK_LOGS_UNAVAILABLE',
      message: 'The registered Electron editing runtime does not expose task logs yet.',
      task_id: taskId,
    }
  }
  const logs = await runtime.getTaskLogs(taskId, { projectId: projectIdValue(args) })
  return {
    ...logs,
    task_id: logs.taskId,
  }
}

export async function editingExportImportResource(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.importExportResource) return editingRuntimeRequired(args)
  const taskId = stringValue(args.taskId ?? args.task_id)
  const task = taskId && runtime.getTask ? await runtime.getTask(taskId, { projectId: projectIdValue(args) }) : undefined
  if (taskId && !task && !stringValue(args.outputPath ?? args.output_path)) {
    return {
      status: 'not_found',
      task_id: taskId,
    }
  }
  const outputPath = stringValue(args.outputPath ?? args.output_path)
    ?? stringValue(task?.outputPath)
  if (!outputPath) {
    if (taskId) {
      return {
        status: 'pending_output',
        task_id: taskId,
        task,
      }
    }
    throw new Error('outputPath or taskId is required')
  }
  if (isHlsTaskOutput(task, outputPath)) {
    return {
      status: 'unsupported_output',
      code: 'USE_EDITING_EXPORT_PUBLISH_HLS',
      message: 'Output is an HLS manifest. Use editing_export_publish_hls for HLS artifacts instead of importing it as a RawResource.',
      task_id: taskId,
      outputPath,
      output_path: outputPath,
      task,
    }
  }
  const outputName = stringValue(args.filename) ?? stringValue(task?.outputName)
  return runtime.importExportResource({
    outputPath,
    output_path: outputPath,
    ...(outputName ? { filename: outputName } : {}),
    ...(stringValue(args.mimeType ?? args.mime_type) ? { mimeType: stringValue(args.mimeType ?? args.mime_type), mime_type: stringValue(args.mimeType ?? args.mime_type) } : {}),
    ...(stringOrNumberValue(args.folderId ?? args.folder_id) !== undefined
      ? { folderId: stringOrNumberValue(args.folderId ?? args.folder_id), folder_id: stringOrNumberValue(args.folderId ?? args.folder_id) }
      : {}),
    ...exportImportDerivativeRequest(args),
  })
}

export async function editingExportSaveLocal(args: Record<string, unknown>) {
  const explicitOutputPath = stringValue(args.outputPath ?? args.output_path)
  const savePath = stringValue(args.savePath ?? args.save_path ?? args.destinationPath ?? args.destination_path)
  const saveDirectory = stringValue(args.saveDirectory ?? args.save_directory ?? args.destinationDirectory ?? args.destination_directory)
  const taskId = stringValue(args.taskId ?? args.task_id)
  const projectId = projectIdValue(args)
  if (explicitOutputPath && !savePath && !saveDirectory) {
    return {
      status: 'ok',
      outputPath: explicitOutputPath,
      output_path: explicitOutputPath,
      persisted: true,
      uploaded: false,
      candidate_created: false,
    }
  }

  const runtime = getEditingRuntimePort()
  if (!explicitOutputPath && !taskId) throw new Error('outputPath or taskId is required')
  if (taskId && !runtime?.getTask) return editingRuntimeRequired(args)
  const task = taskId && runtime?.getTask ? await runtime.getTask(taskId, { projectId }) : undefined
  if (taskId && !task && !explicitOutputPath) {
    return {
      status: 'not_found',
      task_id: taskId,
    }
  }
  const outputPath = explicitOutputPath
    ?? stringValue(task?.outputPath ?? task?.hlsManifestPath ?? task?.hls_manifest_path)
  if (!outputPath) {
    return {
      status: 'pending_output',
      task_id: taskId,
      task,
    }
  }
  if (isHlsTaskOutput(task, outputPath)) {
    if (saveDirectory) {
      if (!runtime?.saveLocalExport) return editingRuntimeRequired(args)
      const segmentPaths = stringList(args.segmentPaths ?? args.segment_paths)
        ?? stringList(task?.hlsSegmentPaths ?? task?.hls_segment_paths)
      const hlsDirectory = stringValue(args.hlsDirectory ?? args.hls_directory)
        ?? stringValue(task?.hlsDirectory ?? task?.hls_directory)
      const saved = await runtime.saveLocalExport({
        outputPath,
        output_path: outputPath,
        ...(projectId ? { projectId, project_id: projectId } : {}),
        ...(taskId ? { taskId, task_id: taskId } : {}),
        saveDirectory,
        save_directory: saveDirectory,
        ...(hlsDirectory ? { hlsDirectory, hls_directory: hlsDirectory } : {}),
        ...(segmentPaths ? { segmentPaths, segment_paths: segmentPaths } : {}),
        ...(stringValue(args.filename) ?? stringValue(task?.outputName) ? { filename: stringValue(args.filename) ?? stringValue(task?.outputName) } : {}),
      })
      return {
        ...saved,
        task_id: taskId,
        persisted: true,
        uploaded: false,
        candidate_created: false,
        ...(task ? { task } : {}),
      }
    }
    return {
      status: 'unsupported_output',
      code: 'USE_EDITING_EXPORT_PUBLISH_HLS',
      message: 'Output is an HLS manifest. Use saveDirectory to save the complete HLS bundle locally, or use editing_export_publish_hls for hosted HLS artifacts.',
      task_id: taskId,
      outputPath,
      output_path: outputPath,
      task,
    }
  }
  if (saveDirectory) throw new Error('saveDirectory is only supported for HLS manifest outputs')
  if (savePath) {
    if (!runtime?.saveLocalExport) return editingRuntimeRequired(args)
    const saved = await runtime.saveLocalExport({
      outputPath,
      output_path: outputPath,
      ...(projectId ? { projectId, project_id: projectId } : {}),
      ...(taskId ? { taskId, task_id: taskId } : {}),
      savePath,
      save_path: savePath,
      ...(stringValue(args.filename) ?? stringValue(task?.outputName) ? { filename: stringValue(args.filename) ?? stringValue(task?.outputName) } : {}),
    })
    return {
      ...saved,
      task_id: taskId,
      persisted: true,
      uploaded: false,
      candidate_created: false,
      ...(task ? { task } : {}),
    }
  }
  return {
    status: 'ok',
    task_id: taskId,
    outputPath,
    output_path: outputPath,
    persisted: true,
    uploaded: false,
    candidate_created: false,
    task,
  }
}

export async function editingExportPublishHls(args: Record<string, unknown>) {
  const runtime = getEditingRuntimePort()
  if (!runtime?.publishHlsStream) return editingRuntimeRequired(args)
  const taskId = stringValue(args.taskId ?? args.task_id)
  const task = taskId && runtime.getTask ? await runtime.getTask(taskId, { projectId: projectIdValue(args) }) : undefined
  const hasExplicitManifest = !!stringValue(args.manifestPath ?? args.manifest_path)
  const hasExplicitSegments = !!stringList(args.segmentPaths ?? args.segment_paths)?.length
  if (taskId && !task && !hasExplicitManifest) {
    return {
      status: 'not_found',
      task_id: taskId,
      message: 'No Electron mediaPipeline task was found for taskId. Pass projectId with taskId for persisted workspace recovery, or provide manifestPath and segmentPaths explicitly.',
    }
  }
  const manifestPath = stringValue(args.manifestPath ?? args.manifest_path)
    ?? stringValue(task?.hlsManifestPath ?? task?.hls_manifest_path ?? task?.outputPath)
  const segmentPaths = stringList(args.segmentPaths ?? args.segment_paths)
    ?? stringList(task?.hlsSegmentPaths ?? task?.hls_segment_paths)
  if (taskId && task && (!manifestPath || !segmentPaths?.length) && !hasExplicitManifest && !hasExplicitSegments) {
    return {
      status: 'pending_output',
      task_id: taskId,
      message: 'The Electron mediaPipeline task does not have a complete HLS manifest/segment output yet.',
      task,
    }
  }
  if (!manifestPath) throw new Error('manifestPath is required')
  if (!segmentPaths?.length) throw new Error('segmentPaths is required')

  const title = stringValue(args.title)
  const projectId = stringOrNumberValue(args.projectId ?? args.project_id)
  const sourceResourceId = stringOrNumberValue(args.sourceResourceId ?? args.source_resource_id)
  const sourceDerivativeId = stringOrNumberValue(args.sourceDerivativeId ?? args.source_derivative_id)
  const durationMs = optionalNumber(args.durationMs ?? args.duration_ms)
  const width = optionalNumber(args.width)
  const height = optionalNumber(args.height)
  const request: EditingRuntimeHlsPublishRequest = {
    manifestPath,
    manifest_path: manifestPath,
    segmentPaths,
    segment_paths: segmentPaths,
  }
  if (taskId) {
    request.taskId = taskId
    request.task_id = taskId
  }
  if (title) request.title = title
  if (projectId !== undefined) {
    request.projectId = projectId
    request.project_id = projectId
  }
  if (sourceResourceId !== undefined) {
    request.sourceResourceId = sourceResourceId
    request.source_resource_id = sourceResourceId
  }
  if (sourceDerivativeId !== undefined) {
    request.sourceDerivativeId = sourceDerivativeId
    request.source_derivative_id = sourceDerivativeId
  }
  if (durationMs !== undefined) {
    request.durationMs = durationMs
    request.duration_ms = durationMs
  }
  if (width !== undefined) request.width = width
  if (height !== undefined) request.height = height
  return runtime.publishHlsStream(request)
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

async function editingTaskSourceCreate(args: Record<string, unknown>, taskType: Extract<EditingMediaPipelineTaskType, 'media_transcode' | 'media_reframe'>) {
  const runtime = getEditingRuntimePort()
  if (!runtime) return editingRuntimeRequired(args)
  const projectId = projectIdValue(args)
  if (!projectId) {
    throw new Error(`projectId is required for ${taskType} Electron media workspace tasks`)
  }
  const source = objectArg(args, 'source')
  if (!source) throw new Error('source is required')
  const task = await runtime.createTask({
    projectId,
    taskType,
    source,
    ...(taskType === 'media_reframe' ? reframeRuntimeOptions(args) : {}),
    ...(taskType === 'media_transcode' ? transcodeRuntimeOptions(args) : {}),
    ...resourceRuntimeOptions(args),
    output: outputSpec(args, 'mp4'),
  })
  return taskResult(task)
}

function reframeRuntimeOptions(args: Record<string, unknown>): {
  target?: string
  mode?: string
  reframe?: Record<string, unknown>
} {
  const output = objectArg(args, 'output')
  const reframe = objectArg(args, 'reframe') ?? {}
  const target = stringValue(args.target ?? reframe.target ?? output?.target)
  const mode = stringValue(args.mode ?? reframe.mode ?? output?.mode)
  const width = optionalNumber(args.width ?? reframe.width ?? output?.width)
  const height = optionalNumber(args.height ?? reframe.height ?? output?.height)
  const background = stringValue(args.background ?? reframe.background ?? output?.background)
  const spec: Record<string, unknown> = {
    ...reframe,
    ...(target ? { target } : {}),
    ...(mode ? { mode } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(background ? { background } : {}),
  }
  return {
    ...(target ? { target } : {}),
    ...(mode ? { mode } : {}),
    ...(Object.keys(spec).length ? { reframe: spec } : {}),
  }
}

function transcodeRuntimeOptions(args: Record<string, unknown>): {
  transcode?: Record<string, unknown>
} {
  const output = objectArg(args, 'output')
  const transcode = objectArg(args, 'transcode') ?? {}
  const videoCodec = stringValue(args.videoCodec ?? args.video_codec ?? transcode.videoCodec ?? transcode.video_codec ?? output?.videoCodec ?? output?.video_codec)
  const audioCodec = stringValue(args.audioCodec ?? args.audio_codec ?? transcode.audioCodec ?? transcode.audio_codec ?? output?.audioCodec ?? output?.audio_codec)
  const videoBitrateKbps = optionalNumber(args.videoBitrateKbps ?? args.video_bitrate_kbps ?? transcode.videoBitrateKbps ?? transcode.video_bitrate_kbps ?? output?.videoBitrateKbps ?? output?.video_bitrate_kbps)
  const audioBitrateKbps = optionalNumber(args.audioBitrateKbps ?? args.audio_bitrate_kbps ?? transcode.audioBitrateKbps ?? transcode.audio_bitrate_kbps ?? output?.audioBitrateKbps ?? output?.audio_bitrate_kbps)
  const spec: Record<string, unknown> = {
    ...transcode,
    ...(videoCodec ? { videoCodec } : {}),
    ...(audioCodec ? { audioCodec } : {}),
    ...(videoBitrateKbps !== undefined ? { videoBitrateKbps } : {}),
    ...(audioBitrateKbps !== undefined ? { audioBitrateKbps } : {}),
  }
  return Object.keys(spec).length ? { transcode: spec } : {}
}

function resourceRuntimeOptions(args: Record<string, unknown>): {
  resourceCache?: Record<string, unknown>
  resourceDownload?: Record<string, unknown>
} {
  const output = objectArg(args, 'output')
  const resourceCache = objectArg(args, 'resourceCache') ?? objectArg(args, 'resource_cache') ?? (isRecord(output?.resourceCache) ? output.resourceCache : undefined) ?? (isRecord(output?.resource_cache) ? output.resource_cache : undefined)
  const resourceDownload = objectArg(args, 'resourceDownload') ?? objectArg(args, 'resource_download') ?? (isRecord(output?.resourceDownload) ? output.resourceDownload : undefined) ?? (isRecord(output?.resource_download) ? output.resource_download : undefined)
  return {
    ...(resourceCache ? { resourceCache } : {}),
    ...(resourceDownload ? { resourceDownload } : {}),
  }
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
  if (project.assets === undefined) {
    project.assets = { assets: [] }
    return
  }
  if (!isRecord(project.assets) || !Array.isArray(project.assets.assets)) {
    throw new Error('editingProject.assets must contain an assets array')
  }
}

function applySingleTimelineCommand(args: Record<string, unknown>, command: MediaTimelineCommand): MediaEditingProject {
  return applyTimelineCommand(editingProjectArg(args), command)
}

function applyTimelineCommand(project: MediaEditingProject, command: MediaTimelineCommand): MediaEditingProject {
  const service = createMediaEditingProjectService(project)
  service.applyCommand(command)
  return service.getProject()
}

function commandList(args: Record<string, unknown>): MediaTimelineCommand[] {
  const commands = Array.isArray(args.commands) ? args.commands : undefined
  if (commands) return commands as unknown as MediaTimelineCommand[]
  const command = objectArg(args, 'command')
  if (command) return [command as unknown as MediaTimelineCommand]
  return []
}

function mediaAssetArg(args: Record<string, unknown>): MediaAssetDescriptor {
  const asset = objectArg(args, 'asset')
  if (!asset) throw new Error('asset is required')
  const sourceKind = sourceKindValue(asset.sourceKind ?? asset.source_kind)
  const assetType = assetTypeValue(asset.assetType ?? asset.asset_type)
  const resourceId = optionalNumber(asset.resourceId ?? asset.resource_id)
  const localPath = stringValue(asset.localPath ?? asset.local_path)
  const id = stringValue(asset.id) ?? mediaAssetId({ sourceKind, assetType, resourceId, localPath })
  return {
    id,
    sourceKind,
    assetType,
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(localPath ? { localPath } : {}),
    ...(stringValue(asset.mimeType ?? asset.mime_type) ? { mimeType: stringValue(asset.mimeType ?? asset.mime_type) } : {}),
    ...(stringValue(asset.checksum) ? { checksum: stringValue(asset.checksum) } : {}),
    ...(stringValue(asset.label) ? { label: stringValue(asset.label) } : {}),
    ...(isRecord(asset.metadata) ? { metadata: asset.metadata } : {}),
  }
}

function mediaTrackArg(args: Record<string, unknown>): MediaTrack {
  const track = objectArg(args, 'track')
  if (track) {
    return {
      id: stringValue(track.id) ?? `track_${trackTypeValue(track.type)}_${Date.now()}`,
      type: trackTypeValue(track.type),
      zIndex: optionalNumber(track.zIndex ?? track.z_index) ?? 0,
      ...(stringValue(track.name) ? { name: stringValue(track.name) } : {}),
      ...(booleanValue(track.muted) !== undefined ? { muted: booleanValue(track.muted) } : {}),
      ...(booleanValue(track.locked) !== undefined ? { locked: booleanValue(track.locked) } : {}),
      clips: Array.isArray(track.clips) ? track.clips as MediaClip[] : [],
    }
  }
  const type = trackTypeValue(args.type ?? args.trackType ?? args.track_type)
  return {
    id: stringValue(args.trackId ?? args.track_id) ?? `track_${type}_${Date.now()}`,
    type,
    zIndex: getOptionalNumeric(args, 'zIndex') ?? getOptionalNumeric(args, 'z_index') ?? 0,
    ...(stringValue(args.name) ? { name: stringValue(args.name) } : {}),
    ...(booleanValue(args.muted) !== undefined ? { muted: booleanValue(args.muted) } : {}),
    ...(booleanValue(args.locked) !== undefined ? { locked: booleanValue(args.locked) } : {}),
    clips: [],
  }
}

function mediaClipArg(args: Record<string, unknown>, project: MediaEditingProject): MediaClip {
  const clip = objectArg(args, 'clip')
  const source = clip ?? args
  const asset = objectArg(source, 'asset') as unknown as MediaAssetDescriptor | undefined
  const assetId = stringValue(source.assetId ?? source.asset_id)
  const registeredAsset = assetId ? project.assets.assets.find((candidate) => candidate.id === assetId) : undefined
  const resolvedAsset = asset ?? registeredAsset
  const assetType = assetTypeValue(source.assetType ?? source.asset_type ?? resolvedAsset?.assetType)
  return {
    id: stringValue(source.id ?? source.clipId ?? source.clip_id) ?? `clip_${Date.now()}`,
    assetType,
    ...(resolvedAsset ? { asset: resolvedAsset } : {}),
    timelineStartMs: optionalNumber(source.timelineStartMs ?? source.timeline_start_ms) ?? 0,
    durationMs: optionalNumber(source.durationMs ?? source.duration_ms) ?? 4000,
    ...(optionalNumber(source.sourceStartMs ?? source.source_start_ms) !== undefined ? { sourceStartMs: optionalNumber(source.sourceStartMs ?? source.source_start_ms) } : {}),
    ...(optionalNumber(source.sourceEndMs ?? source.source_end_ms) !== undefined ? { sourceEndMs: optionalNumber(source.sourceEndMs ?? source.source_end_ms) } : {}),
    ...(optionalNumber(source.volume) !== undefined ? { volume: optionalNumber(source.volume) } : {}),
    ...(booleanValue(source.muted) !== undefined ? { muted: booleanValue(source.muted) } : {}),
    ...(fitValue(source.fit) ? { fit: fitValue(source.fit) } : {}),
    ...(stringValue(source.position) ? { position: stringValue(source.position) } : {}),
    ...(optionalNumber(source.xPercent ?? source.x_percent) !== undefined ? { xPercent: optionalNumber(source.xPercent ?? source.x_percent) } : {}),
    ...(optionalNumber(source.yPercent ?? source.y_percent) !== undefined ? { yPercent: optionalNumber(source.yPercent ?? source.y_percent) } : {}),
    ...(optionalNumber(source.scale) !== undefined ? { scale: optionalNumber(source.scale) } : {}),
    ...(optionalNumber(source.opacity) !== undefined ? { opacity: optionalNumber(source.opacity) } : {}),
    ...(isRecord(source.crop) ? { crop: source.crop } : {}),
    ...(isRecord(source.transition) ? { transition: source.transition as unknown as MediaClip['transition'] } : {}),
    ...(isRecord(source.text) ? { text: source.text as unknown as MediaClip['text'] } : {}),
    ...(isRecord(source.subtitle) ? { subtitle: source.subtitle as unknown as MediaClip['subtitle'] } : {}),
    ...(isRecord(source.metadata) ? { metadata: source.metadata } : {}),
  }
}

function mediaClipPatchArg(args: Record<string, unknown>): MediaClipPatch {
  const patch = objectArg(args, 'patch')
  const source = patch ?? args
  const next: Record<string, unknown> = {}
  for (const [inputKey, outputKey] of [
    ['timelineStartMs', 'timelineStartMs'],
    ['timeline_start_ms', 'timelineStartMs'],
    ['durationMs', 'durationMs'],
    ['duration_ms', 'durationMs'],
    ['sourceStartMs', 'sourceStartMs'],
    ['source_start_ms', 'sourceStartMs'],
    ['sourceEndMs', 'sourceEndMs'],
    ['source_end_ms', 'sourceEndMs'],
    ['volume', 'volume'],
    ['xPercent', 'xPercent'],
    ['x_percent', 'xPercent'],
    ['yPercent', 'yPercent'],
    ['y_percent', 'yPercent'],
    ['scale', 'scale'],
    ['opacity', 'opacity'],
  ] as const) {
    const value = optionalNumber(source[inputKey])
    if (value !== undefined) next[outputKey] = value
  }
  if (booleanValue(source.muted) !== undefined) next.muted = booleanValue(source.muted)
  if (fitValue(source.fit)) next.fit = fitValue(source.fit)
  if (stringValue(source.position)) next.position = stringValue(source.position)
  if (isRecord(source.crop)) next.crop = source.crop
  if (isRecord(source.transition)) next.transition = source.transition
  if (isRecord(source.text)) next.text = source.text
  if (isRecord(source.subtitle)) next.subtitle = source.subtitle
  if (isRecord(source.metadata)) next.metadata = source.metadata
  return next as MediaClipPatch
}

function outputSpec(args: Record<string, unknown>, defaultFormat: EditingMediaPipelineOutputSpec['format']): EditingMediaPipelineOutputSpec {
  const output = objectArg(args, 'output')
  const format = stringValue(output?.format) === 'hls' ? 'hls' : stringValue(output?.format) === 'mp4' ? 'mp4' : defaultFormat
  return {
    format,
    ...(stringValue(output?.filename) ? { filename: stringValue(output?.filename) } : {}),
    ...(booleanValue(output?.importToResource ?? output?.import_to_resource) !== undefined
      ? { importToResource: booleanValue(output?.importToResource ?? output?.import_to_resource) }
      : {}),
    ...(stringOrNumberValue(output?.folderId ?? output?.folder_id) !== undefined
      ? { folderId: stringOrNumberValue(output?.folderId ?? output?.folder_id) }
      : {}),
    ...(exportDerivativePayload(output ?? {}) ? { derivative: exportDerivativePayload(output ?? {}) } : {}),
    ...(Array.isArray(output?.hlsVariants ?? output?.hls_variants)
      ? { hlsVariants: (output?.hlsVariants ?? output?.hls_variants) as EditingMediaPipelineOutputSpec['hlsVariants'] }
      : {}),
  }
}

function exportImportDerivativeRequest(args: Record<string, unknown>): {
  derivative?: NonNullable<EditingMediaPipelineOutputSpec['derivative']>
  operation?: string
  tool?: string
  inputResourceIds?: Array<string | number>
  input_resource_ids?: Array<string | number>
  sourceResourceId?: string | number
  source_resource_id?: string | number
  sourceResourceIds?: Array<string | number>
  source_resource_ids?: Array<string | number>
  params?: Record<string, unknown>
} {
  const derivative = exportDerivativePayload(args)
  return {
    ...(derivative ? { derivative } : {}),
    ...(stringValue(args.operation) ? { operation: stringValue(args.operation) } : {}),
    ...(stringValue(args.tool) ? { tool: stringValue(args.tool) } : {}),
    ...(idList(args.inputResourceIds) ? { inputResourceIds: idList(args.inputResourceIds) } : {}),
    ...(idList(args.input_resource_ids) ? { input_resource_ids: idList(args.input_resource_ids) } : {}),
    ...(stringOrNumberValue(args.sourceResourceId) !== undefined ? { sourceResourceId: stringOrNumberValue(args.sourceResourceId) } : {}),
    ...(stringOrNumberValue(args.source_resource_id) !== undefined ? { source_resource_id: stringOrNumberValue(args.source_resource_id) } : {}),
    ...(idList(args.sourceResourceIds) ? { sourceResourceIds: idList(args.sourceResourceIds) } : {}),
    ...(idList(args.source_resource_ids) ? { source_resource_ids: idList(args.source_resource_ids) } : {}),
    ...(isRecord(args.params) ? { params: args.params } : {}),
  }
}

function exportDerivativePayload(source: Record<string, unknown>): NonNullable<EditingMediaPipelineOutputSpec['derivative']> | undefined {
  const explicit = source.derivative
  if (isRecord(explicit)) {
    const operation = stringValue(explicit.operation)
    if (!operation) return undefined
    const inputIds = numericIdList(explicit.input_resource_ids ?? explicit.inputResourceIds)
    return {
      operation,
      ...(stringValue(explicit.tool) ? { tool: stringValue(explicit.tool) } : {}),
      ...(inputIds.length ? { input_resource_ids: inputIds } : {}),
      ...(isRecord(explicit.params) ? { params: explicit.params } : {}),
    }
  }
  return undefined
}

function idList(value: unknown): Array<string | number> | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
  return list.length ? list : undefined
}

function numericIdList(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return Array.from(new Set(values
    .map((item) => typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN)
    .filter((item) => Number.isInteger(item) && item > 0)))
}

function projectIdValue(args: Record<string, unknown>): string | undefined {
  const value = args.projectId ?? args.project_id
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function taskIdValue(args: Record<string, unknown>): string {
  const taskId = stringValue(args.taskId ?? args.task_id)
  if (!taskId) throw new Error('taskId is required')
  return taskId
}

function editingProjectIdValue(args: Record<string, unknown>): string {
  const editingProjectId = stringValue(args.editingProjectId ?? args.editing_project_id)
  if (!editingProjectId) throw new Error('editingProjectId is required')
  return editingProjectId
}

function trackIdValue(args: Record<string, unknown>): string {
  const trackId = stringValue(args.trackId ?? args.track_id)
  if (!trackId) throw new Error('trackId is required')
  return trackId
}

function clipIdValue(args: Record<string, unknown>): string {
  const clipId = stringValue(args.clipId ?? args.clip_id)
  if (!clipId) throw new Error('clipId is required')
  return clipId
}

function assetIdValue(args: Record<string, unknown>): string {
  const assetId = stringValue(args.assetId ?? args.asset_id)
  if (!assetId) throw new Error('assetId is required')
  return assetId
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

function isHlsTaskOutput(task: unknown, outputPath: string): boolean {
  if (isRecord(task) && stringValue(task.taskType) === 'timeline_hls') return true
  return outputPath.toLowerCase().endsWith('.m3u8')
}

function findClip(project: MediaEditingProject, clipId: string): { track: MediaTrack; clip: MediaClip } | undefined {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { track, clip }
  }
  return undefined
}

function relatedSplitClips(project: MediaEditingProject, clipId: string): MediaClip[] {
  const found = findClip(project, clipId)
  if (found) {
    return found.track.clips.filter((clip) => clip.id === clipId || clip.id.startsWith(`${clipId}_right`))
  }
  return project.timeline.tracks.flatMap((track) => track.clips.filter((clip) => clip.id === clipId || clip.id.startsWith(`${clipId}_right`)))
}

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const direct = args[key]
  if (isRecord(direct)) return direct
  return undefined
}

function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    return list.length ? list : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    const list = value.split(',').map((item) => item.trim()).filter(Boolean)
    return list.length ? list : undefined
  }
  return undefined
}

function requiredNumeric(args: Record<string, unknown>, primary: string, alias: string): number {
  const value = optionalNumber(args[primary] ?? args[alias])
  if (value === undefined) throw new Error(`${primary} is required`)
  return value
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function sourceKindValue(value: unknown): MediaAssetDescriptor['sourceKind'] {
  if (value === 'backend_resource' || value === 'local_file' || value === 'generated_resource' || value === 'bytes') return value
  throw new Error('asset.sourceKind must be backend_resource, local_file, generated_resource, or bytes')
}

function assetTypeValue(value: unknown): MediaAssetDescriptor['assetType'] {
  if (value === 'video' || value === 'image' || value === 'audio' || value === 'text' || value === 'subtitle') return value
  throw new Error('assetType must be video, image, audio, text, or subtitle')
}

function trackTypeValue(value: unknown): MediaTrackType {
  if (value === 'video' || value === 'image' || value === 'audio' || value === 'text' || value === 'subtitle' || value === 'effect') return value
  throw new Error('track type must be video, image, audio, text, subtitle, or effect')
}

function fitValue(value: unknown): MediaTimelineFit | undefined {
  if (value === 'crop' || value === 'contain' || value === 'cover' || value === 'none') return value
  return undefined
}

function retainSideValue(value: unknown): 'both' | 'left' | 'right' | undefined {
  if (value === 'both' || value === 'left' || value === 'right') return value
  return undefined
}

function mediaAssetId(input: {
  sourceKind: MediaAssetDescriptor['sourceKind']
  assetType: MediaAssetDescriptor['assetType']
  resourceId?: number
  localPath?: string
}): string {
  if (input.resourceId !== undefined) return `resource_${input.resourceId}`
  if (input.localPath) return `local_${input.assetType}_${Math.abs(hashString(input.localPath))}`
  return `asset_${input.sourceKind}_${input.assetType}_${Date.now()}`
}

function cloneProject(project: MediaEditingProject): MediaEditingProject {
  return structuredClone(project)
}

function touchProject(project: MediaEditingProject): void {
  project.updatedAt = new Date().toISOString()
  project.revision = (project.revision ?? 0) + 1
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return hash
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

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

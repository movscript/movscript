import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { createMediaPipelineServiceClientFromRuntime } from '@movscript/editing'
import { backendGet, backendPostMultipart } from '../../../../backend/node/client.js'
import {
  getEditingRuntimePort,
  type EditingRuntimeHlsPublishRequest,
} from '../editing/runtime.js'

export async function artifactUploadExport(args: Record<string, unknown>) {
  const resolved = await resolveArtifactArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const uploadArgs = resolved.args
  const taskResolution = await resolveExportUploadTask(uploadArgs)
  if ('diagnostic' in taskResolution) return taskResolution.diagnostic
  const request = await exportUploadRequest(uploadArgs, taskResolution.task)
  if (isHlsManifestExportRequest(request)) {
    return {
      status: 'unsupported_output',
      code: 'USE_SYSTEM_ARTIFACT_UPLOAD_HLS_STREAM',
      message: 'Output is an HLS manifest. Use system_artifact_upload_hls_stream for HLS artifacts instead of uploading it as a RawResource.',
      outputPath: request.outputPath,
      output_path: request.outputPath,
      filename: request.filename,
      mimeType: request.mimeType,
      mime_type: request.mimeType,
    }
  }
  const info = await stat(request.outputPath)
  if (!info.isFile()) throw new Error(`ARTIFACT_EXPORT_FILE_INVALID: ${request.outputPath} is not a file.`)

  const bytes = await readFile(request.outputPath)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: request.mimeType }), request.filename)
  appendFormValue(form, 'folder_id', request.folderId)
  const derivative = exportDerivativePayload(uploadArgs)
  if (derivative) form.append('derivative', JSON.stringify(derivative))

  const response = await backendPostMultipart('/resources/upload', form)
  const resourceId = numericResourceId(response)
  if (resourceId === undefined) {
    throw new Error('ARTIFACT_EXPORT_UPLOAD_RESPONSE_INVALID: resource upload response did not include a valid resource ID.')
  }
  return {
    status: 'ok',
    resourceId,
    resource_id: resourceId,
    resource: response,
    outputPath: request.outputPath,
    output_path: request.outputPath,
    filename: request.filename,
    mimeType: request.mimeType,
    mime_type: request.mimeType,
    ...(request.folderId !== undefined ? { folderId: request.folderId, folder_id: request.folderId } : {}),
    ...(stringValue(uploadArgs.resultId ?? uploadArgs.result_id) ? { resultId: stringValue(uploadArgs.resultId ?? uploadArgs.result_id), result_id: stringValue(uploadArgs.resultId ?? uploadArgs.result_id) } : {}),
  }
}

export async function artifactUploadHlsStream(args: Record<string, unknown>) {
  const resolved = await resolveArtifactArgsWithMediaPipelineResult(args)
  if (resolved.error) return resolved.error
  const uploadArgs = resolved.args
  const taskId = stringValue(uploadArgs.taskId ?? uploadArgs.task_id)
  const runtime = getEditingRuntimePort()
  if (taskId && runtime?.publishHlsStream) {
    const task = runtime.getTask ? await runtime.getTask(taskId, { projectId: mediaProjectIdString(uploadArgs) }) : undefined
    const hasExplicitManifest = !!stringValue(uploadArgs.manifestPath ?? uploadArgs.manifest_path)
    const hasExplicitSegments = !!stringList(uploadArgs.segmentPaths ?? uploadArgs.segment_paths)?.length
    if (!task && !hasExplicitManifest) {
      return {
        status: 'not_found',
        task_id: taskId,
        message: 'No Electron mediaPipeline task was found for taskId. Pass mediaProjectId with taskId for persisted workspace recovery, or provide manifestPath and segmentPaths explicitly.',
      }
    }
    if (isRecord(task) && !hasExplicitManifest && !hasExplicitSegments) {
      const manifestPath = stringValue(task.hlsManifestPath ?? task.hls_manifest_path ?? task.outputPath)
      const segmentPaths = stringList(task.hlsSegmentPaths ?? task.hls_segment_paths)
      if (!manifestPath || !segmentPaths?.length) {
        return {
          status: 'pending_output',
          task_id: taskId,
          message: 'The Electron mediaPipeline task does not have a complete HLS manifest/segment output yet.',
          task,
        }
      }
    }
    const request = hlsPublishRequest(uploadArgs, task)
    return runtime.publishHlsStream(request)
  }

  const request = hlsPublishRequest(uploadArgs)
  const form = new FormData()
  const manifest = await readFile(request.manifestPath)
  form.append('manifest', new Blob([new Uint8Array(manifest)], { type: 'application/vnd.apple.mpegurl' }), basename(request.manifestPath))
  for (const segmentPath of request.segmentPaths ?? []) {
    const bytes = await readFile(segmentPath)
    form.append('segments', new Blob([new Uint8Array(bytes)], { type: mimeTypeForFilename(segmentPath) }), basename(segmentPath))
  }
  appendFormValue(form, 'title', request.title)
  appendFormValue(form, 'task_id', request.task_id ?? request.taskId)
  appendFormValue(form, 'project_id', request.project_id ?? request.projectId)
  appendFormValue(form, 'source_resource_id', request.source_resource_id ?? request.sourceResourceId)
  appendFormValue(form, 'source_derivative_id', request.source_derivative_id ?? request.sourceDerivativeId)
  appendFormValue(form, 'duration_ms', request.duration_ms ?? request.durationMs)
  appendFormValue(form, 'width', request.width)
  appendFormValue(form, 'height', request.height)
  appendFormValue(form, 'expires_at', stringValue(uploadArgs.expiresAt ?? uploadArgs.expires_at))
  appendFormValue(form, 'expires_in_seconds', numberValue(uploadArgs.expiresInSeconds ?? uploadArgs.expires_in_seconds))

  const response = await backendPostMultipart('/media/streams/uploads', form)
  const result = hlsUploadResult(response)
  const resultId = stringValue(uploadArgs.resultId ?? uploadArgs.result_id)
  return {
    ...result,
    ...(resultId ? { resultId, result_id: resultId } : {}),
  }
}

export async function artifactGetStream(args: Record<string, unknown>) {
  const streamId = stringOrNumberValue(args.streamId ?? args.stream_id ?? args.id)
  if (streamId === undefined) throw new Error('streamId is required')
  const response = await backendGet(`/media/streams/${encodeURIComponent(String(streamId))}`)
  const record = response && typeof response === 'object' ? response as Record<string, unknown> : {}
  const stream = record.stream ?? record.media_stream ?? response
  return {
    status: 'ok',
    streamId: numericId(response) ?? numericId(stream) ?? Number(streamId),
    stream_id: numericId(response) ?? numericId(stream) ?? Number(streamId),
    stream,
    media_stream: stream,
    manifestUrl: stringValue(record.manifest_url ?? record.manifestUrl),
    manifest_url: stringValue(record.manifest_url ?? record.manifestUrl),
    presignedManifestUrl: stringValue(record.presigned_manifest_url ?? record.presignedManifestUrl),
    presigned_manifest_url: stringValue(record.presigned_manifest_url ?? record.presignedManifestUrl),
    segmentBaseUrl: stringValue(record.segment_base_url ?? record.segmentBaseUrl),
    segment_base_url: stringValue(record.segment_base_url ?? record.segmentBaseUrl),
    segments: record.segments,
  }
}

async function resolveArtifactArgsWithMediaPipelineResult(args: Record<string, unknown>): Promise<{
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
        ...mediaPipelineResultArtifactArgs(explicitResult, args),
        ...args,
      },
      result: explicitResult,
    }
  }

  const service = optionalMediaPipelineServiceClient(args)
  if (!service) {
    return {
      args,
      error: mediaPipelineServiceRequired(args),
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
      ...mediaPipelineResultArtifactArgs(result, args),
      ...args,
    },
    result,
  }
}

function optionalMediaPipelineServiceClient(args: Record<string, unknown>) {
  try {
    return createMediaPipelineServiceClientFromRuntime({
      baseUrl: stringValue(args.mediaPipelineServiceURL ?? args.media_pipeline_service_url),
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('movscript.media.pipeline endpoint was not found')) {
      return undefined
    }
    throw error
  }
}

function mediaPipelineServiceRequired(args: Record<string, unknown>) {
  return {
    status: 'unsupported_runtime',
    code: 'MEDIA_PIPELINE_SERVICE_REQUIRED',
    message: 'This artifact tool requires movscript.media.pipeline to resolve resultId. Start the local daemon or pass MOVSCRIPT_MEDIA_PIPELINE_URL / --media-pipeline-service-url, or provide explicit output/manifest paths.',
    received: Object.keys(args).sort(),
  }
}

function mediaPipelineResultArtifactArgs(result: Record<string, unknown>, explicitArgs: Record<string, unknown>): Record<string, unknown> {
  const outputPath = resultString(result.outputPath ?? result.output_path ?? result.path)
    ?? mediaPipelineResultArtifactPath(result, ['video', 'mp4', 'mov', 'webm', resultString(result.kind)])
  const manifestPath = resultString(result.hlsManifestPath ?? result.hls_manifest_path ?? result.manifestPath ?? result.manifest_path)
    ?? mediaPipelineResultArtifactPath(result, ['hls_manifest', 'manifest', 'hls', 'hls_stream', 'm3u8'])
  const segmentPaths = resultStringArray(result.hlsSegmentPaths ?? result.hls_segment_paths ?? result.segmentPaths ?? result.segment_paths)
    ?? mediaPipelineResultArtifactPaths(result, ['hls_segment', 'segment'])
  const outputKind = candidateOutputKindForResult(resultString(result.outputKind ?? result.output_kind ?? result.kind), {
    outputPath,
    manifestPath,
    segmentPaths,
    hasStream: result.streamId !== undefined || result.stream_id !== undefined,
  })
  const derived: Record<string, unknown> = {}
  addDerivedArg(derived, explicitArgs, ['resultId', 'result_id'], resultString(result.resultId ?? result.result_id))
  addDerivedArg(derived, explicitArgs, ['mediaProjectId', 'media_project_id'], resultString(result.projectId ?? result.project_id))
  addDerivedArg(derived, explicitArgs, ['projectId', 'project_id'], resultString(result.projectId ?? result.project_id))
  addDerivedArg(derived, explicitArgs, ['taskId', 'task_id'], resultString(result.taskId ?? result.task_id))
  addDerivedArg(derived, explicitArgs, ['outputKind', 'output_kind', 'kind'], outputKind)
  addDerivedArg(derived, explicitArgs, ['outputPath', 'output_path', 'filePath', 'file_path'], outputKind === 'hls_stream' ? undefined : outputPath)
  addDerivedArg(derived, explicitArgs, ['filename'], resultString(result.outputName ?? result.output_name ?? result.name)
    ?? (outputPath ? outputPath.split(/[\\/]/).filter(Boolean).at(-1) : undefined))
  addDerivedArg(derived, explicitArgs, ['mimeType', 'mime_type'], mimeTypeForResult({ outputPath, manifestPath, outputKind }))
  addDerivedArg(derived, explicitArgs, ['manifestPath', 'manifest_path'], manifestPath ?? (outputKind === 'hls_stream' ? outputPath : undefined))
  addDerivedArg(derived, explicitArgs, ['segmentPaths', 'segment_paths'], segmentPaths)
  addDerivedArg(derived, explicitArgs, ['streamId', 'stream_id'], result.streamId ?? result.stream_id)
  addDerivedArg(derived, explicitArgs, ['resourceId', 'resource_id'], result.resourceId ?? result.resource_id)
  addDerivedArg(derived, explicitArgs, ['candidateId', 'candidate_id'], result.candidateId ?? result.candidate_id)
  addDerivedArg(derived, explicitArgs, ['title'], resultString(result.title ?? result.name ?? result.outputName ?? result.output_name))
  addDerivedArg(derived, explicitArgs, ['durationMs', 'duration_ms'], numberValue(result.durationMs ?? result.duration_ms))
  addDerivedArg(derived, explicitArgs, ['width'], numberValue(result.width))
  addDerivedArg(derived, explicitArgs, ['height'], numberValue(result.height))
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

function mediaPipelineResultReference(result: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    resultId: resultString(result.resultId ?? result.result_id),
    result_id: resultString(result.resultId ?? result.result_id),
    mediaProjectId: resultString(result.projectId ?? result.project_id),
    media_project_id: resultString(result.projectId ?? result.project_id),
    project_id: resultString(result.projectId ?? result.project_id),
    task_id: resultString(result.taskId ?? result.task_id),
    backend: resultString(result.backend),
    kind: resultString(result.kind),
    output_path: resultString(result.outputPath ?? result.output_path ?? result.path),
    manifest_path: resultString(result.hlsManifestPath ?? result.hls_manifest_path ?? result.manifestPath ?? result.manifest_path),
    resource_id: result.resourceId ?? result.resource_id,
    stream_id: result.streamId ?? result.stream_id,
    candidate_id: result.candidateId ?? result.candidate_id,
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
  if (['subtitle', 'subtitles', 'text', 'srt', 'vtt', 'ass'].includes(normalized)) return 'subtitle'
  return value
}

function mimeTypeForResult(input: { outputPath?: string, manifestPath?: string, outputKind?: string }): string | undefined {
  if (input.outputKind === 'hls_stream') return 'application/vnd.apple.mpegurl'
  const path = input.outputPath ?? input.manifestPath
  return path ? mimeTypeForFilename(path) : undefined
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

async function resolveExportUploadTask(args: Record<string, unknown>): Promise<
  | { task?: Record<string, unknown> }
  | { diagnostic: Record<string, unknown> }
> {
  const taskId = stringValue(args.taskId ?? args.task_id)
  const explicitOutputPath = stringValue(args.outputPath ?? args.output_path ?? args.filePath ?? args.file_path)
  if (!taskId || explicitOutputPath) return {}

  const runtime = getEditingRuntimePort()
  if (!runtime?.getTask) {
    return {
      diagnostic: {
        status: 'unsupported_runtime',
        code: 'ELECTRON_EDITING_RUNTIME_REQUIRED',
        task_id: taskId,
        message: 'Resolving an Electron mediaPipeline task output requires the Electron runtime. Provide outputPath/filePath explicitly, or run this task inside MovScript Desktop with mediaProjectId and taskId.',
      },
    }
  }

  const task = await runtime.getTask(taskId, { projectId: mediaProjectIdString(args) })
  if (!isRecord(task)) {
    return {
      diagnostic: {
        status: 'not_found',
        task_id: taskId,
        message: 'No Electron mediaPipeline task was found for taskId. Pass mediaProjectId with taskId for persisted workspace recovery, or provide outputPath/filePath explicitly.',
      },
    }
  }
  const outputPath = stringValue(task.outputPath ?? task.output_path)
  if (!outputPath) {
    return {
      diagnostic: {
        status: 'pending_output',
        task_id: taskId,
        message: 'The Electron mediaPipeline task does not have a local export output path yet.',
        task,
      },
    }
  }
  return { task }
}

async function exportUploadRequest(args: Record<string, unknown>, task?: Record<string, unknown>): Promise<{
  outputPath: string
  filename: string
  mimeType: string
  folderId?: string | number
}> {
  const outputPath = stringValue(args.outputPath ?? args.output_path ?? args.filePath ?? args.file_path)
    ?? stringValue(task?.outputPath ?? task?.output_path)
  if (!outputPath) throw new Error('outputPath is required')
  const filename = stringValue(args.filename)
    ?? stringValue(task?.filename)
    ?? basename(outputPath)
  const mimeType = stringValue(args.mimeType ?? args.mime_type)
    ?? stringValue(task?.mimeType ?? task?.mime_type)
    ?? mimeTypeForFilename(filename)
  return {
    outputPath,
    filename,
    mimeType,
    ...(stringOrNumberValue(args.folderId ?? args.folder_id) !== undefined
      ? { folderId: stringOrNumberValue(args.folderId ?? args.folder_id) }
      : {}),
  }
}

function exportDerivativePayload(args: Record<string, unknown>): {
  operation: string
  tool?: string
  input_resource_ids?: number[]
  params?: Record<string, unknown>
} | undefined {
  const explicit = args.derivative
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

  const operation = stringValue(args.operation)
  const inputIds = [
    ...numericIdList(args.inputResourceIds ?? args.input_resource_ids),
    ...numericIdList(args.sourceResourceIds ?? args.source_resource_ids),
    ...numericIdList(args.sourceResourceId ?? args.source_resource_id),
  ]
  if (!operation && !inputIds.length && !isRecord(args.params)) return undefined
  return {
    operation: operation ?? 'artifact_export',
    ...(stringValue(args.tool) ? { tool: stringValue(args.tool) } : { tool: 'system_artifact_upload_export' }),
    ...(inputIds.length ? { input_resource_ids: Array.from(new Set(inputIds)) } : {}),
    ...(isRecord(args.params) ? { params: args.params } : {}),
  }
}

function hlsPublishRequest(args: Record<string, unknown>, taskValue?: unknown): EditingRuntimeHlsPublishRequest {
  const task = isRecord(taskValue) ? taskValue : undefined
  const manifestPath = stringValue(args.manifestPath ?? args.manifest_path)
    ?? stringValue(task?.hlsManifestPath ?? task?.hls_manifest_path ?? task?.outputPath)
  const segmentPaths = stringList(args.segmentPaths ?? args.segment_paths)
    ?? stringList(task?.hlsSegmentPaths ?? task?.hls_segment_paths)
  if (!manifestPath) throw new Error('manifestPath is required')
  if (!segmentPaths?.length) throw new Error('segmentPaths is required')
  const request: EditingRuntimeHlsPublishRequest = {
    manifestPath,
    manifest_path: manifestPath,
    segmentPaths,
    segment_paths: segmentPaths,
  }
  const taskId = stringValue(args.taskId ?? args.task_id)
  const title = stringValue(args.title)
  const projectId = mediaProjectIdStringOrNumber(args)
  const sourceResourceId = stringOrNumberValue(args.sourceResourceId ?? args.source_resource_id)
  const sourceDerivativeId = stringOrNumberValue(args.sourceDerivativeId ?? args.source_derivative_id)
  const durationMs = numberValue(args.durationMs ?? args.duration_ms)
  const width = numberValue(args.width)
  const height = numberValue(args.height)
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
  return request
}

function mediaProjectIdString(args: Record<string, unknown>): string | undefined {
  return stringValue(args.mediaProjectId ?? args.media_project_id ?? args.projectId ?? args.project_id)
}

function mediaProjectIdStringOrNumber(args: Record<string, unknown>): string | number | undefined {
  return stringOrNumberValue(args.mediaProjectId ?? args.media_project_id ?? args.projectId ?? args.project_id)
}

function hlsUploadResult(response: unknown) {
  const record = response && typeof response === 'object' ? response as Record<string, unknown> : {}
  const stream = record.stream ?? record.media_stream ?? response
  const streamId = numericId(response) ?? numericId(stream)
  if (streamId === undefined) {
    throw new Error('HLS_STREAM_UPLOAD_RESPONSE_INVALID: response did not include a valid stream ID.')
  }
  const manifestUrl = stringValue(record.manifest_url ?? record.manifestUrl)
  const presignedManifestUrl = stringValue(record.presigned_manifest_url ?? record.presignedManifestUrl)
  const segmentBaseUrl = stringValue(record.segment_base_url ?? record.segmentBaseUrl)
  return {
    status: 'ok',
    streamId,
    stream_id: streamId,
    stream,
    media_stream: stream,
    ...(manifestUrl ? { manifestUrl, manifest_url: manifestUrl } : {}),
    ...(presignedManifestUrl ? { presignedManifestUrl, presigned_manifest_url: presignedManifestUrl } : {}),
    ...(segmentBaseUrl ? { segmentBaseUrl, segment_base_url: segmentBaseUrl } : {}),
    segments: record.segments,
  }
}

function mimeTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.m4s')) return 'video/iso.segment'
  if (lower.endsWith('.ts')) return 'video/mp2t'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.m4v')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.vtt')) return 'text/vtt'
  if (lower.endsWith('.srt')) return 'application/x-subrip'
  if (lower.endsWith('.ass')) return 'text/x-ssa'
  return 'application/octet-stream'
}

function isHlsManifestExportRequest(request: { outputPath: string; filename: string; mimeType: string }): boolean {
  const outputPath = request.outputPath.toLowerCase()
  const filename = request.filename.toLowerCase()
  const mimeType = request.mimeType.toLowerCase()
  return outputPath.endsWith('.m3u8')
    || filename.endsWith('.m3u8')
    || mimeType === 'application/vnd.apple.mpegurl'
    || mimeType === 'application/x-mpegurl'
}

function appendFormValue(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || String(value).trim() === '') return
  form.append(key, String(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resultString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value)
}

function stringOrNumberValue(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function numberValue(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
  return out.length ? out : undefined
}

function resultStringArray(value: unknown): string[] | undefined {
  const items = arrayArg(value)
    .map((item) => resultString(item))
    .filter((item): item is string => Boolean(item))
  return items.length > 0 ? items : undefined
}

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const direct = args[key]
  if (isRecord(direct)) return direct
  return undefined
}

function arrayArg(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function numericId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const raw = record.ID ?? record.id ?? record.stream_id ?? record.streamId
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function numericResourceId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const raw = record.ID ?? record.id ?? record.resource_id ?? record.resourceId
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function numericIdList(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return values.flatMap((item) => {
    const n = typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN
    return Number.isInteger(n) && n > 0 ? [n] : []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

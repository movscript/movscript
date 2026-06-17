import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { backendGet, backendPostMultipart } from '../../../../backend/node/client.js'
import {
  getEditingRuntimePort,
  type EditingRuntimeHlsPublishRequest,
} from '../editing/runtime.js'

export async function artifactUploadExport(args: Record<string, unknown>) {
  const taskResolution = await resolveExportUploadTask(args)
  if ('diagnostic' in taskResolution) return taskResolution.diagnostic
  const request = await exportUploadRequest(args, taskResolution.task)
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
  const derivative = exportDerivativePayload(args)
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
  }
}

export async function artifactUploadHlsStream(args: Record<string, unknown>) {
  const taskId = stringValue(args.taskId ?? args.task_id)
  const runtime = getEditingRuntimePort()
  if (taskId && runtime?.publishHlsStream) {
    const task = runtime.getTask ? await runtime.getTask(taskId, { projectId: stringValue(args.projectId ?? args.project_id) }) : undefined
    const hasExplicitManifest = !!stringValue(args.manifestPath ?? args.manifest_path)
    const hasExplicitSegments = !!stringList(args.segmentPaths ?? args.segment_paths)?.length
    if (!task && !hasExplicitManifest) {
      return {
        status: 'not_found',
        task_id: taskId,
        message: 'No Electron mediaPipeline task was found for taskId. Pass projectId with taskId for persisted workspace recovery, or provide manifestPath and segmentPaths explicitly.',
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
    const request = hlsPublishRequest(args, task)
    return runtime.publishHlsStream(request)
  }

  const request = hlsPublishRequest(args)
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
  appendFormValue(form, 'expires_at', stringValue(args.expiresAt ?? args.expires_at))
  appendFormValue(form, 'expires_in_seconds', numberValue(args.expiresInSeconds ?? args.expires_in_seconds))

  const response = await backendPostMultipart('/media/streams/uploads', form)
  return hlsUploadResult(response)
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
        message: 'Resolving an Electron mediaPipeline task output requires the Electron runtime. Provide outputPath/filePath explicitly, or run this task inside MovScript Desktop with projectId and taskId.',
      },
    }
  }

  const task = await runtime.getTask(taskId, { projectId: stringValue(args.projectId ?? args.project_id) })
  if (!isRecord(task)) {
    return {
      diagnostic: {
        status: 'not_found',
        task_id: taskId,
        message: 'No Electron mediaPipeline task was found for taskId. Pass projectId with taskId for persisted workspace recovery, or provide outputPath/filePath explicitly.',
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
  const projectId = stringOrNumberValue(args.projectId ?? args.project_id)
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

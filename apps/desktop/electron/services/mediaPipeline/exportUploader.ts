import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { createDataServiceClientFromRuntime } from '@movscript/data-client'

export interface MediaPipelineUploadedResource {
  resourceId: number
  resource: unknown
}

export interface MediaPipelineExportDerivative {
  operation: string
  tool?: string
  input_resource_ids?: number[]
  params?: Record<string, unknown>
}

export async function uploadMediaPipelineExportResource(input: {
  outputPath: string
  filename: string
  mimeType: string
  folderId?: string | number
  derivative?: MediaPipelineExportDerivative
}): Promise<MediaPipelineUploadedResource> {
  const info = await stat(input.outputPath)
  if (!info.isFile()) throw new Error(`EXPORT_UPLOAD_FILE_INVALID: ${input.outputPath} is not a file.`)
  const bytes = await readFile(input.outputPath)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: input.mimeType }), input.filename)
  if (input.folderId !== undefined && String(input.folderId).trim()) {
    form.append('folder_id', String(input.folderId).trim())
  }
  if (input.derivative) form.append('derivative', JSON.stringify(input.derivative))
  const resource = await createDataServiceClientFromRuntime({ env: process.env }).postMultipart('/resources/upload', form)
  const resourceId = numericResourceId(resource)
  if (resourceId === undefined) {
    throw new Error('EXPORT_UPLOAD_RESPONSE_INVALID: resource upload response did not include a valid resource ID.')
  }
  return { resourceId, resource }
}

export async function importMediaPipelineExportResource(input: {
  outputPath: string
  output_path?: string
  filename?: string
  mimeType?: string
  mime_type?: string
  folderId?: string | number
  folder_id?: string | number
  derivative?: MediaPipelineExportDerivative
  operation?: string
  tool?: string
  inputResourceIds?: Array<string | number>
  input_resource_ids?: Array<string | number>
  sourceResourceId?: string | number
  source_resource_id?: string | number
  sourceResourceIds?: Array<string | number>
  source_resource_ids?: Array<string | number>
  params?: Record<string, unknown>
}): Promise<{
  status: 'ok'
  resourceId: number
  resource_id: number
  resource: unknown
  outputPath: string
  output_path: string
  filename: string
  mimeType: string
  mime_type: string
}> {
  const outputPath = input.outputPath || input.output_path
  if (!outputPath || !outputPath.trim()) throw new Error('outputPath is required')
  const filename = input.filename?.trim() || basename(outputPath)
  const mimeType = input.mimeType || input.mime_type || mimeTypeForFilename(filename)
  const uploaded = await uploadMediaPipelineExportResource({
    outputPath,
    filename,
    mimeType,
    folderId: input.folderId ?? input.folder_id,
    derivative: exportDerivativePayload(input),
  })
  return {
    status: 'ok',
    resourceId: uploaded.resourceId,
    resource_id: uploaded.resourceId,
    resource: uploaded.resource,
    outputPath,
    output_path: outputPath,
    filename,
    mimeType,
    mime_type: mimeType,
  }
}

export async function saveMediaPipelineExportLocal(input: {
  outputPath: string
  output_path?: string
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
  savePath?: string
  save_path?: string
  saveDirectory?: string
  save_directory?: string
  hlsDirectory?: string
  hls_directory?: string
  segmentPaths?: string[]
  segment_paths?: string[]
  filename?: string
}): Promise<{
  status: 'ok'
  outputPath: string
  output_path: string
  savePath?: string
  save_path?: string
  saveDirectory?: string
  save_directory?: string
  manifestPath?: string
  manifest_path?: string
  savedFiles?: string[]
  saved_files?: string[]
  filename: string
  sizeBytes: number
  size_bytes: number
}> {
  const outputPath = input.outputPath || input.output_path
  if (!outputPath || !outputPath.trim()) throw new Error('outputPath is required')
  const saveDirectory = input.saveDirectory || input.save_directory
  if (saveDirectory && saveDirectory.trim()) {
    return saveMediaPipelineHlsDirectory({
      outputPath,
      saveDirectory,
      hlsDirectory: input.hlsDirectory || input.hls_directory,
      segmentPaths: input.segmentPaths || input.segment_paths,
      filename: input.filename,
    })
  }
  const savePath = input.savePath || input.save_path
  if (!savePath || !savePath.trim()) throw new Error('savePath is required')
  if (isHlsManifestPath(outputPath)) {
    throw new Error('USE_EDITING_EXPORT_PUBLISH_HLS: HLS outputs include a manifest and segment files. Use editing_export_publish_hls or publishMediaHlsStream instead of saving only the manifest file.')
  }
  const info = await stat(outputPath)
  if (!info.isFile()) throw new Error(`EXPORT_SAVE_LOCAL_SOURCE_INVALID: ${outputPath} is not a file.`)
  await mkdir(dirname(savePath), { recursive: true })
  await copyFile(outputPath, savePath)
  const saved = await stat(savePath)
  return {
    status: 'ok',
    outputPath,
    output_path: outputPath,
    savePath,
    save_path: savePath,
    filename: input.filename?.trim() || basename(savePath),
    sizeBytes: saved.size,
    size_bytes: saved.size,
  }
}

async function saveMediaPipelineHlsDirectory(input: {
  outputPath: string
  saveDirectory: string
  hlsDirectory?: string
  segmentPaths?: string[]
  filename?: string
}): Promise<{
  status: 'ok'
  outputPath: string
  output_path: string
  saveDirectory: string
  save_directory: string
  manifestPath: string
  manifest_path: string
  savedFiles: string[]
  saved_files: string[]
  filename: string
  sizeBytes: number
  size_bytes: number
}> {
  if (!isHlsManifestPath(input.outputPath)) {
    throw new Error('EXPORT_SAVE_LOCAL_HLS_MANIFEST_REQUIRED: saveDirectory is only supported for HLS manifest outputs.')
  }
  const manifestInfo = await stat(input.outputPath)
  if (!manifestInfo.isFile()) throw new Error(`EXPORT_SAVE_LOCAL_SOURCE_INVALID: ${input.outputPath} is not a file.`)
  const hlsDirectory = input.hlsDirectory?.trim()
  const sourceRoot = resolve(hlsDirectory || dirname(input.outputPath))
  const shouldDiscoverFiles = Boolean(hlsDirectory) || !input.segmentPaths?.length
  const discoveredFiles = shouldDiscoverFiles ? await hlsBundleFiles(sourceRoot) : []
  const files = uniquePaths([input.outputPath, ...(input.segmentPaths ?? []), ...discoveredFiles])
  if (!files.length) throw new Error('EXPORT_SAVE_LOCAL_HLS_FILES_REQUIRED: HLS save requires manifest and segment files.')
  await mkdir(input.saveDirectory, { recursive: true })
  const savedFiles: string[] = []
  let sizeBytes = 0
  for (const file of files) {
    const relativeName = basename(file)
    const target = join(input.saveDirectory, relativeName)
    const info = await stat(file)
    if (!info.isFile()) throw new Error(`EXPORT_SAVE_LOCAL_HLS_FILE_INVALID: ${file} is not a file.`)
    if (resolve(dirname(file)) !== sourceRoot) {
      throw new Error(`EXPORT_SAVE_LOCAL_HLS_FILE_OUTSIDE_DIRECTORY: ${file} is outside ${sourceRoot}.`)
    }
    await copyFile(file, target)
    savedFiles.push(target)
    sizeBytes += info.size
  }
  const manifestPath = join(input.saveDirectory, basename(input.outputPath))
  return {
    status: 'ok',
    outputPath: input.outputPath,
    output_path: input.outputPath,
    saveDirectory: input.saveDirectory,
    save_directory: input.saveDirectory,
    manifestPath,
    manifest_path: manifestPath,
    savedFiles,
    saved_files: savedFiles,
    filename: input.filename?.trim() || basename(input.outputPath),
    sizeBytes,
    size_bytes: sizeBytes,
  }
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter((item) => item.trim())))
}

async function hlsBundleFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory).catch(() => [])
  return entries
    .filter((entry) => {
      const lower = entry.toLowerCase()
      return lower.endsWith('.m3u8')
        || lower.endsWith('.m4s')
        || lower.endsWith('.mp4')
        || lower.endsWith('.ts')
        || lower.endsWith('.aac')
    })
    .map((entry) => join(directory, entry))
}

function isHlsManifestPath(path: string): boolean {
  return path.toLowerCase().endsWith('.m3u8')
}

function exportDerivativePayload(input: {
  derivative?: MediaPipelineExportDerivative
  operation?: string
  tool?: string
  inputResourceIds?: Array<string | number>
  input_resource_ids?: Array<string | number>
  sourceResourceId?: string | number
  source_resource_id?: string | number
  sourceResourceIds?: Array<string | number>
  source_resource_ids?: Array<string | number>
  params?: Record<string, unknown>
}): MediaPipelineExportDerivative | undefined {
  if (input.derivative?.operation?.trim()) {
    return {
      operation: input.derivative.operation.trim(),
      ...(input.derivative.tool?.trim() ? { tool: input.derivative.tool.trim() } : {}),
      ...(input.derivative.input_resource_ids?.length ? { input_resource_ids: uniquePositiveIds(input.derivative.input_resource_ids) } : {}),
      ...(input.derivative.params ? { params: input.derivative.params } : {}),
    }
  }
  const operation = input.operation?.trim()
  const inputResourceIds = uniquePositiveIds([
    ...(input.inputResourceIds ?? []),
    ...(input.input_resource_ids ?? []),
    ...(input.sourceResourceIds ?? []),
    ...(input.source_resource_ids ?? []),
    ...(input.sourceResourceId !== undefined ? [input.sourceResourceId] : []),
    ...(input.source_resource_id !== undefined ? [input.source_resource_id] : []),
  ])
  if (!operation && inputResourceIds.length === 0 && !input.params) return undefined
  return {
    operation: operation || 'editing_export',
    tool: input.tool?.trim() || 'editing_export_import_resource',
    ...(inputResourceIds.length ? { input_resource_ids: inputResourceIds } : {}),
    ...(input.params ? { params: input.params } : {}),
  }
}

function uniquePositiveIds(values: Array<string | number>): number[] {
  return Array.from(new Set(values
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)))
}

export async function publishMediaPipelineHlsStream(input: {
  manifestPath: string
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
}): Promise<{
  status: 'ok'
  streamId: number
  stream_id: number
  stream: unknown
  media_stream: unknown
  manifestUrl?: string
  manifest_url?: string
  presignedManifestUrl?: string
  presigned_manifest_url?: string
  segmentBaseUrl?: string
  segment_base_url?: string
  segments?: unknown
}> {
  const manifestPath = input.manifestPath || input.manifest_path
  if (!manifestPath || !manifestPath.trim()) throw new Error('manifestPath is required')
  const segmentPaths = input.segmentPaths ?? input.segment_paths ?? []
  if (!segmentPaths.length) throw new Error('segmentPaths is required')
  const manifest = await readFile(manifestPath)
  const form = new FormData()
  form.append('manifest', new Blob([new Uint8Array(manifest)], { type: 'application/vnd.apple.mpegurl' }), basename(manifestPath))
  for (const segmentPath of segmentPaths) {
    const bytes = await readFile(segmentPath)
    form.append('segments', new Blob([new Uint8Array(bytes)], { type: mimeTypeForFilename(segmentPath) }), basename(segmentPath))
  }
  appendFormValue(form, 'title', input.title)
  appendFormValue(form, 'task_id', input.taskId ?? input.task_id)
  appendFormValue(form, 'project_id', input.projectId ?? input.project_id)
  appendFormValue(form, 'source_resource_id', input.sourceResourceId ?? input.source_resource_id)
  appendFormValue(form, 'source_derivative_id', input.sourceDerivativeId ?? input.source_derivative_id)
  appendFormValue(form, 'duration_ms', input.durationMs ?? input.duration_ms)
  appendFormValue(form, 'width', input.width)
  appendFormValue(form, 'height', input.height)

  const response = await createDataServiceClientFromRuntime({ env: process.env }).postMultipart('/media/streams/uploads', form)
  const record = response && typeof response === 'object' ? response as Record<string, unknown> : {}
  const stream = record.stream ?? record.media_stream ?? response
  const streamId = numericResourceId(response) ?? numericResourceId(stream)
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
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.m4v')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.ts')) return 'video/mp2t'
  if (lower.endsWith('.m4s')) return 'video/iso.segment'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.vtt')) return 'text/vtt'
  if (lower.endsWith('.srt')) return 'application/x-subrip'
  if (lower.endsWith('.ass')) return 'text/x-ssa'
  return 'application/octet-stream'
}

function numericResourceId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const raw = record.ID ?? record.id ?? record.resource_id ?? record.resourceId
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function appendFormValue(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || String(value).trim() === '') return
  form.append(key, String(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

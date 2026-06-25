import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { DataServiceHTTPError, createDataServiceClientFromRuntime } from '@movscript/data-client'

import type { MediaPipelineAssetDescriptor } from './types'
import type { MediaWorkspacePaths } from './workspace'

export interface MaterializedMediaAsset {
  asset: MediaPipelineAssetDescriptor
  path: string
  cached: boolean
  mimeType?: string
  sizeBytes?: number
}

export interface MediaResourceCacheCleanupResult {
  scannedCount: number
  removedCount: number
  retainedCount: number
  bytesBefore: number
  bytesAfter: number
  removedBytes: number
  removedPaths: string[]
}

export interface MediaResourceCacheOptions {
  maxBytes?: number
  maxEntries?: number
}

export interface BackendResourceDownloadOptions {
  attempts?: number
  retryDelayMs?: number
  maxRetryDelayMs?: number
  onProgress?: (progress: BackendResourceDownloadProgress) => void
}

export interface BackendResourceDownloadProgress {
  asset: MediaPipelineAssetDescriptor
  resourceId: number
  attempt: number
  receivedBytes: number
  totalBytes?: number
  done: boolean
}

export interface MediaPipelineMaterializeOptions {
  resourceCache?: MediaResourceCacheOptions
  resourceDownload?: BackendResourceDownloadOptions
}

const DEFAULT_RESOURCE_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024
const DEFAULT_RESOURCE_CACHE_MAX_ENTRIES = 512
const BACKEND_RESOURCE_DOWNLOAD_ATTEMPTS = 3
const BACKEND_RESOURCE_DOWNLOAD_RETRY_DELAY_MS = 25
const BACKEND_RESOURCE_DOWNLOAD_MAX_RETRY_DELAY_MS = 200

export async function materializeMediaPipelineAsset(input: {
  asset: MediaPipelineAssetDescriptor
  workspace: MediaWorkspacePaths
  options?: MediaPipelineMaterializeOptions
}): Promise<MaterializedMediaAsset> {
  const asset = input.asset
  if (asset.sourceKind === 'local_file') return materializeLocalFile(asset)
  if (asset.sourceKind === 'bytes') return materializeBytesAsset({ asset, workspace: input.workspace })
  if (asset.sourceKind === 'raw_resource' || asset.sourceKind === 'backend_resource' || asset.sourceKind === 'generated_resource') {
    return materializeBackendResource({ asset, workspace: input.workspace, options: input.options })
  }
  throw new Error(`ASSET_MATERIALIZE_UNSUPPORTED: ${asset.sourceKind} assets are not materializable yet.`)
}

async function materializeLocalFile(asset: MediaPipelineAssetDescriptor): Promise<MaterializedMediaAsset> {
  if (!asset.localPath) throw new Error(`ASSET_LOCAL_PATH_REQUIRED: asset ${asset.id} is missing localPath.`)
  const info = await stat(asset.localPath)
  if (!info.isFile()) throw new Error(`ASSET_LOCAL_FILE_INVALID: asset ${asset.id} localPath is not a file.`)
  return {
    asset,
    path: asset.localPath,
    cached: false,
    mimeType: asset.mimeType,
    sizeBytes: info.size,
  }
}

async function materializeBytesAsset(input: {
  asset: MediaPipelineAssetDescriptor
  workspace: MediaWorkspacePaths
}): Promise<MaterializedMediaAsset> {
  const bytes = decodeAssetBytes(input.asset)
  if (bytes.length <= 0) throw new Error(`ASSET_BYTES_REQUIRED: asset ${input.asset.id} is missing bytes.`)

  await mkdir(input.workspace.taskInputs, { recursive: true })
  const mimeType = normalizeMimeType(input.asset.mimeType)
  const filename = bytesFilename(input.asset, bytes)
  const inputPath = join(input.workspace.taskInputs, filename)
  const tempPath = `${inputPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tempPath, bytes)
  await rename(tempPath, inputPath)
  const info = await stat(inputPath)
  return {
    asset: input.asset,
    path: inputPath,
    cached: false,
    mimeType,
    sizeBytes: info.size,
  }
}

async function materializeBackendResource(input: {
  asset: MediaPipelineAssetDescriptor
  workspace: MediaWorkspacePaths
  options?: MediaPipelineMaterializeOptions
}): Promise<MaterializedMediaAsset> {
  const resourceId = input.asset.resourceId
  if (!resourceId || !Number.isFinite(resourceId) || resourceId < 1) {
    throw new Error(`ASSET_RESOURCE_ID_REQUIRED: asset ${input.asset.id} is missing resourceId.`)
  }

  await mkdir(input.workspace.cacheResources, { recursive: true })
  const cachePath = join(input.workspace.cacheResources, cacheFilename(input.asset))
  const existing = await stat(cachePath).catch(() => undefined)
  if (existing?.isFile() && existing.size > 0) {
    await touchFile(cachePath)
    return {
      asset: input.asset,
      path: cachePath,
      cached: true,
      mimeType: input.asset.mimeType,
      sizeBytes: existing.size,
    }
  }

  const file = await downloadBackendResourceFile(resourceId, input.asset, input.options?.resourceDownload)
  const mimeType = normalizeMimeType(input.asset.mimeType ?? file.contentType)
  const finalPath = replaceExtension(cachePath, extensionForMimeType(mimeType, input.asset.assetType))
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tempPath, file.bytes)
  await rename(tempPath, finalPath)
  const info = await stat(finalPath)
  await cleanupMediaResourceCache({
    cacheResources: input.workspace.cacheResources,
    maxBytes: input.options?.resourceCache?.maxBytes,
    maxEntries: input.options?.resourceCache?.maxEntries,
    protectPaths: [finalPath],
  })
  return {
    asset: input.asset,
    path: finalPath,
    cached: false,
    mimeType,
    sizeBytes: info.size,
  }
}

async function downloadBackendResourceFile(
  resourceId: number,
  asset: MediaPipelineAssetDescriptor,
  options: BackendResourceDownloadOptions | undefined,
): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  const path = `/resources/${encodeURIComponent(String(resourceId))}/file`
  const attempts = clampPositiveInteger(options?.attempts, BACKEND_RESOURCE_DOWNLOAD_ATTEMPTS)
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await createDataServiceClientFromRuntime({ env: process.env }).getBinary(path, {
        onProgress: (progress) => {
          options?.onProgress?.({
            asset,
            resourceId,
            attempt,
            receivedBytes: progress.receivedBytes,
            ...(progress.totalBytes !== undefined ? { totalBytes: progress.totalBytes } : {}),
            done: progress.done,
          })
        },
      })
    } catch (error) {
      lastError = error
      if (!shouldRetryBackendResourceDownload(error) || attempt === attempts) break
      await waitForRetry(attempt, options)
    }
  }
  throw backendResourceDownloadError(resourceId, lastError)
}

function shouldRetryBackendResourceDownload(error: unknown): boolean {
  if (error instanceof DataServiceHTTPError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500
  }
  return true
}

function backendResourceDownloadError(resourceId: number, error: unknown): Error {
  if (error instanceof DataServiceHTTPError) {
    if (error.status === 401 || error.status === 403) {
      return new Error(`ASSET_RESOURCE_UNAUTHORIZED: resource ${resourceId} is not authorized for editing materialize.`)
    }
    if (error.status === 404) {
      return new Error(`ASSET_RESOURCE_NOT_FOUND: resource ${resourceId} was not found.`)
    }
    if (error.status === 429) {
      return new Error(`ASSET_RESOURCE_RATE_LIMITED: resource ${resourceId} download was rate limited after retry.`)
    }
    if (error.status >= 500) {
      return new Error(`ASSET_RESOURCE_BACKEND_UNAVAILABLE: resource ${resourceId} download failed with backend HTTP ${error.status} after retry.`)
    }
    return new Error(`ASSET_RESOURCE_DOWNLOAD_FAILED: resource ${resourceId} download failed with backend HTTP ${error.status}.`)
  }
  const message = error instanceof Error ? error.message : 'network error'
  return new Error(`ASSET_RESOURCE_DOWNLOAD_FAILED: resource ${resourceId} download failed after retry: ${message}`)
}

function waitForRetry(attempt: number, options: BackendResourceDownloadOptions | undefined): Promise<void> {
  const delayMs = clampLimit(options?.retryDelayMs, BACKEND_RESOURCE_DOWNLOAD_RETRY_DELAY_MS)
  const maxDelayMs = clampLimit(options?.maxRetryDelayMs, BACKEND_RESOURCE_DOWNLOAD_MAX_RETRY_DELAY_MS)
  return new Promise((resolve) => setTimeout(resolve, Math.min(maxDelayMs, delayMs * attempt)))
}

export async function cleanupMediaResourceCache(input: {
  cacheResources: string
  maxBytes?: number
  maxEntries?: number
  protectPaths?: string[]
}): Promise<MediaResourceCacheCleanupResult> {
  const maxBytes = clampLimit(input.maxBytes, DEFAULT_RESOURCE_CACHE_MAX_BYTES)
  const maxEntries = clampLimit(input.maxEntries, DEFAULT_RESOURCE_CACHE_MAX_ENTRIES)
  const protectedPaths = new Set((input.protectPaths ?? []).map((path) => path))
  const entries = await resourceCacheEntries(input.cacheResources)
  const bytesBefore = entries.reduce((sum, entry) => sum + entry.size, 0)
  const removable = entries
    .filter((entry) => !protectedPaths.has(entry.path))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path))
  let bytesAfter = bytesBefore
  let retainedCount = entries.length
  const removedPaths: string[] = []

  for (const entry of removable) {
    if (bytesAfter <= maxBytes && retainedCount <= maxEntries) break
    await unlink(entry.path).catch(() => undefined)
    bytesAfter -= entry.size
    retainedCount -= 1
    removedPaths.push(entry.path)
  }

  return {
    scannedCount: entries.length,
    removedCount: removedPaths.length,
    retainedCount,
    bytesBefore,
    bytesAfter,
    removedBytes: bytesBefore - bytesAfter,
    removedPaths,
  }
}

async function resourceCacheEntries(cacheResources: string): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
  const names = await readdir(cacheResources).catch(() => [])
  const entries = await Promise.all(names.map(async (name) => {
    const path = join(cacheResources, name)
    const info = await stat(path).catch(() => undefined)
    if (!info?.isFile()) return undefined
    return { path, size: info.size, mtimeMs: info.mtimeMs }
  }))
  return entries.filter((entry): entry is { path: string; size: number; mtimeMs: number } => Boolean(entry))
}

function clampLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

async function touchFile(path: string): Promise<void> {
  const now = new Date()
  await utimes(path, now, now).catch(() => undefined)
}

function decodeAssetBytes(asset: MediaPipelineAssetDescriptor): Uint8Array {
  if (asset.bytes instanceof Uint8Array) return asset.bytes
  if (asset.bytes instanceof ArrayBuffer) return new Uint8Array(asset.bytes)
  if (Array.isArray(asset.bytes)) return Uint8Array.from(asset.bytes.map((value) => clampByte(value)))
  if (asset.base64) return Buffer.from(asset.base64.replace(/^data:[^,]+,/, ''), 'base64')
  return new Uint8Array()
}

function clampByte(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
  return Math.max(0, Math.min(255, n))
}

function cacheFilename(asset: MediaPipelineAssetDescriptor): string {
  const identity = [
    asset.sourceKind,
    asset.resourceId ?? asset.id,
    asset.resourceVersion ?? asset.resource_version ?? '',
    asset.checksum ?? '',
    asset.mimeType ?? '',
    asset.label ?? '',
  ].join(':')
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 16)
  const base = sanitizeFilenameBase(
    asset.resourceId ? `resource-${asset.resourceId}` : basename(asset.localPath ?? asset.label ?? asset.id, extname(asset.localPath ?? asset.label ?? asset.id)),
  )
  return `${base}-${hash}${extensionForMimeType(normalizeMimeType(asset.mimeType), asset.assetType)}`
}

function bytesFilename(asset: MediaPipelineAssetDescriptor, bytes: Uint8Array): string {
  const base = sanitizeFilenameBase(asset.label ?? asset.id)
  const hash = createHash('sha256')
    .update(asset.checksum ?? '')
    .update(bytes)
    .digest('hex')
    .slice(0, 16)
  return `${base}-${hash}${extensionForMimeType(normalizeMimeType(asset.mimeType), asset.assetType)}`
}

function replaceExtension(path: string, extension: string): string {
  const current = extname(path)
  if (!current) return `${path}${extension}`
  return `${path.slice(0, -current.length)}${extension}`
}

function sanitizeFilenameBase(value: string): string {
  return value
    .trim()
    .replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'asset'
}

function normalizeMimeType(value: string | undefined): string | undefined {
  return value?.split(';')[0]?.trim().toLowerCase() || undefined
}

function extensionForMimeType(mimeType: string | undefined, assetType: MediaPipelineAssetDescriptor['assetType']): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/svg+xml':
      return '.svg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'video/quicktime':
      return '.mov'
    case 'video/webm':
      return '.webm'
    case 'video/x-matroska':
      return '.mkv'
    case 'audio/mpeg':
      return '.mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return '.wav'
    case 'audio/mp4':
      return '.m4a'
    case 'text/vtt':
      return '.vtt'
    case 'application/x-subrip':
      return '.srt'
    case 'text/x-ssa':
    case 'text/x-ass':
    case 'application/x-ass':
    case 'application/x-ssa':
    case 'application/x-substation-alpha':
    case 'application/ssa':
      return '.ass'
    case 'video/mp4':
      return '.mp4'
    case 'image/png':
      return '.png'
    default:
      if (assetType === 'video') return '.mp4'
      if (assetType === 'audio') return '.m4a'
      if (assetType === 'subtitle') return '.vtt'
      if (assetType === 'text') return '.txt'
      return '.png'
  }
}

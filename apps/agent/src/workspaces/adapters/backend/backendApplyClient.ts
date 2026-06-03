import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { ApplyWorkspaceReview } from '../../apply/workspaceApply.js'

export interface BackendApplyClientOptions {
  baseURL?: string
  resourceCacheDir?: string
}

export interface BackendApplyAuthContext {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export interface BackendApplyResult {
  performed: boolean
  method?: 'GET' | 'PATCH' | 'POST'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

export interface BackendResourceFileDownloadResult {
  performed: boolean
  method?: 'GET'
  url?: string
  path?: string
  contentType?: string
  contentLength?: number
  skippedReason?: string
}

export interface BackendJSONReadResult {
  performed: boolean
  method?: 'GET'
  url?: string
  response?: JSONValue
  skippedReason?: string
}

export interface BackendApplyErrorDetail {
  method: 'GET' | 'PATCH' | 'POST'
  path: string
  status: number
  responseText: string
  response?: JSONValue
}

export class BackendApplyHTTPError extends Error {
  readonly detail: BackendApplyErrorDetail

  constructor(message: string, detail: BackendApplyErrorDetail) {
    super(message)
    this.name = 'BackendApplyHTTPError'
    this.detail = detail
  }
}

export class BackendApplyClient {
  private readonly baseURL?: string
  private readonly resourceCacheDir: string
  private readonly resourceFileDownloads = new Map<string, Promise<ResourceFileCacheMetadata>>()

  constructor(options: BackendApplyClientOptions = {}) {
    this.baseURL = normalizeBaseURL(options.baseURL ?? process.env.MOVSCRIPT_BACKEND_API_BASE_URL ?? process.env.MOVSCRIPT_API_BASE_URL)
    this.resourceCacheDir = options.resourceCacheDir ?? process.env.MOVSCRIPT_AGENT_RESOURCE_CACHE_DIR ?? join(tmpdir(), 'movscript-agent-resource-cache')
  }

  isEnabled(): boolean {
    return !!this.baseURL
  }

  async applyReview(review: ApplyWorkspaceReview, _auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    void review
    return {
      performed: false,
      skippedReason: 'workspace apply is owned by MCP; the agent backend client does not encode application entity routes.',
    }
  }

  async previewApplyReview(review: ApplyWorkspaceReview, _auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    void review
    return {
      performed: false,
      skippedReason: 'workspace validation is owned by MCP; the agent backend client does not encode application entity routes.',
    }
  }

  async applyWorkspace(_projectId: number, _payload: Record<string, JSONValue>, _auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    return {
      performed: false,
      skippedReason: 'workspace apply is owned by MCP; direct backend workspace apply is not implemented in the agent.',
    }
  }

  async getProject(_projectId: number, _auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    return {
      performed: false,
      skippedReason: 'project reads are owned by MCP; direct backend project reads are not implemented in the agent.',
    }
  }

  async getJSON(path: string, auth?: BackendApplyAuthContext, options: { signal?: AbortSignal } = {}): Promise<BackendJSONReadResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend read disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const url = `${baseURL}${normalizedPath}`
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(auth),
      signal: options.signal,
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend GET ${normalizedPath} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: 'GET',
        path: normalizedPath,
        status: response.status,
        responseText,
        ...(parsed !== undefined ? { response: parsed } : {}),
      })
    }
    return {
      performed: true,
      method: 'GET',
      url,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async downloadResourceFile(resourceId: number, targetPath: string, auth?: BackendApplyAuthContext, options: { signal?: AbortSignal } = {}): Promise<BackendResourceFileDownloadResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend resource download disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const path = `/resources/${encodeURIComponent(String(resourceId))}/file`
    const url = `${baseURL}${path}`
    const cacheKey = resourceFileCacheKey(baseURL, resourceId, auth)
    const cachePath = join(this.resourceCacheDir, `${cacheKey}.bin`)
    const metadataPath = join(this.resourceCacheDir, `${cacheKey}.json`)
    const cached = await readCachedResourceFile(cachePath, metadataPath)
    if (cached) {
      await copyCachedResourceFile(cachePath, targetPath)
      return {
        performed: true,
        method: 'GET',
        url,
        path: targetPath,
        ...(cached.contentType ? { contentType: cached.contentType } : {}),
        ...(Number.isFinite(cached.contentLength) ? { contentLength: cached.contentLength } : {}),
      }
    }

    let download = this.resourceFileDownloads.get(cacheKey)
    if (!download) {
      download = downloadResourceFileToCache({
        url,
        path,
        auth,
        cachePath,
        metadataPath,
        signal: options.signal,
      }).finally(() => {
        this.resourceFileDownloads.delete(cacheKey)
      })
      this.resourceFileDownloads.set(cacheKey, download)
    }

    const downloaded = await waitForResourceFileCache(download, options.signal)
    await copyCachedResourceFile(cachePath, targetPath)
    return {
      performed: true,
      method: 'GET',
      url,
      path: targetPath,
      ...(downloaded.contentType ? { contentType: downloaded.contentType } : {}),
      ...(Number.isFinite(downloaded.contentLength) ? { contentLength: downloaded.contentLength } : {}),
    }
  }

  private resolveBaseURL(auth?: BackendApplyAuthContext): string | undefined {
    return normalizeBaseURL(auth?.backendAPIBaseURL) ?? this.baseURL
  }
}

interface ResourceFileCacheMetadata {
  contentType?: string
  contentLength?: number
  etag?: string
}

interface ResourceFileCacheDownloadInput {
  url: string
  path: string
  auth?: BackendApplyAuthContext
  cachePath: string
  metadataPath: string
  signal?: AbortSignal
}

function resourceFileCacheKey(baseURL: string, resourceId: number, auth?: BackendApplyAuthContext): string {
  const authScope = resourceFileCacheAuthScope(auth)
  const raw = JSON.stringify({
    baseURL,
    resourceId,
    authScope,
  })
  return createHash('sha256').update(raw).digest('hex')
}

function resourceFileCacheAuthScope(auth?: BackendApplyAuthContext): string {
  const userId = normalizeBackendApplyAuthUserId(auth?.userId)
  const tokenHash = auth?.backendAuthToken ? createHash('sha256').update(auth.backendAuthToken).digest('hex') : 'none'
  return `user:${userId !== undefined ? String(userId) : 'anonymous'}:token:${tokenHash}`
}

async function readCachedResourceFile(cachePath: string, metadataPath: string): Promise<ResourceFileCacheMetadata | undefined> {
  let fileStat: Awaited<ReturnType<typeof stat>>
  try {
    fileStat = await stat(cachePath)
  } catch {
    return undefined
  }
  if (!fileStat.isFile() || fileStat.size <= 0) return undefined
  const metadata = await readResourceFileCacheMetadata(metadataPath)
  return {
    ...metadata,
    contentLength: metadata.contentLength ?? fileStat.size,
  }
}

async function downloadResourceFileToCache(input: ResourceFileCacheDownloadInput): Promise<ResourceFileCacheMetadata> {
  const response = await fetch(input.url, {
    method: 'GET',
    headers: buildHeaders(input.auth, { json: false }),
    signal: input.signal,
  })

  if (!response.ok) {
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    throw new BackendApplyHTTPError(`backend GET ${input.path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
      method: 'GET',
      path: input.path,
      status: response.status,
      responseText,
      ...(parsed !== undefined ? { response: parsed } : {}),
    })
  }
  if (!response.body) throw new Error(`backend GET ${input.path} returned an empty response body`)

  await mkdir(dirname(input.cachePath), { recursive: true })
  const cacheTempPath = `${input.cachePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(cacheTempPath), { signal: input.signal })
    await rename(cacheTempPath, input.cachePath).catch(async () => {
      await copyFile(cacheTempPath, input.cachePath)
      await unlink(cacheTempPath).catch(() => undefined)
    })
  } catch (error) {
    await unlink(cacheTempPath).catch(() => undefined)
    throw error
  }

  const contentLength = Number(response.headers.get('content-length'))
  const metadata: ResourceFileCacheMetadata = {
    contentType: response.headers.get('content-type') ?? undefined,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    etag: response.headers.get('etag') ?? undefined,
  }
  await writeResourceFileCacheMetadata(input.metadataPath, metadata)
  return metadata
}

async function waitForResourceFileCache(download: Promise<ResourceFileCacheMetadata>, signal?: AbortSignal): Promise<ResourceFileCacheMetadata> {
  if (!signal) return download
  if (signal.aborted) throw abortSignalError(signal)
  return Promise.race([
    download,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortSignalError(signal)), { once: true })
    }),
  ])
}

function abortSignalError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('resource download aborted')
}

async function copyCachedResourceFile(cachePath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(cachePath, targetPath)
}

async function readResourceFileCacheMetadata(metadataPath: string): Promise<ResourceFileCacheMetadata> {
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
    return {
      ...(typeof parsed.contentType === 'string' && parsed.contentType ? { contentType: parsed.contentType } : {}),
      ...(typeof parsed.contentLength === 'number' && Number.isFinite(parsed.contentLength) ? { contentLength: parsed.contentLength } : {}),
      ...(typeof parsed.etag === 'string' && parsed.etag ? { etag: parsed.etag } : {}),
    }
  } catch {
    return {}
  }
}

async function writeResourceFileCacheMetadata(metadataPath: string, metadata: ResourceFileCacheMetadata): Promise<void> {
  await writeFile(metadataPath, JSON.stringify(metadata), 'utf8').catch(() => undefined)
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function buildHeaders(auth?: BackendApplyAuthContext, options: { json?: boolean } = { json: true }): Record<string, string> {
  const headers: Record<string, string> = options.json === false ? {} : { 'Content-Type': 'application/json' }
  if (auth?.backendAuthToken) headers.Authorization = `Bearer ${auth.backendAuthToken}`
  const userId = normalizeBackendApplyAuthUserId(auth?.userId)
  if (userId !== undefined) headers['X-User-ID'] = String(userId)
  return headers
}

export function normalizeBackendApplyAuthUserId(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function parseJSONText(text: string): JSONValue | undefined {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
  }
}

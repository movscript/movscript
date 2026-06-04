import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  CoreImageInspectionResult,
  CoreImageOutputFormat,
  CoreImagePreset,
  CoreImageProcessingPort,
  CoreImageProcessingRequest,
  CoreImageProcessingResult,
} from '../../ports/media/imageProcessingPort.js'
import type { ResourceFileDownloadAuthContext, ResourceFileDownloadPort, ResourceFileDownloadResult } from '../../ports/files/resourceDownloadPort.js'
import type { AgentRun, JSONValue } from '../../state/shared/types.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'
import { isValidAgentReferenceId } from '../../context/runtime/runtimeContext.js'

type SharpFactory = (input: Buffer, options?: Record<string, unknown>) => SharpPipeline

interface SharpPipeline {
  metadata(): Promise<Record<string, unknown>>
  rotate(): SharpPipeline
  toColorspace(space: string): SharpPipeline
  resize(options: Record<string, unknown>): SharpPipeline
  extract(rect: { left: number; top: number; width: number; height: number }): SharpPipeline
  flatten(options?: Record<string, unknown>): SharpPipeline
  jpeg(options?: Record<string, unknown>): SharpPipeline
  png(options?: Record<string, unknown>): SharpPipeline
  webp(options?: Record<string, unknown>): SharpPipeline
  toBuffer(options?: { resolveWithObject?: boolean }): Promise<Buffer | { data: Buffer; info: Record<string, unknown> }>
}

export type ImageProcessorFactory = () => Promise<SharpFactory>

interface LoadedImageBytes {
  kind: 'backend_resource' | 'data_url'
  resourceId?: number
  mimeType?: string
  bytes: Buffer
  warnings: string[]
}

export interface ImagePreprocessingPortOptions {
  resourceFileDownloader: ResourceFileDownloadPort
  processorFactory?: ImageProcessorFactory
}

const DEFAULT_PRESETS: Record<CoreImagePreset, { maxDimension: number; format: CoreImageOutputFormat; quality: number }> = {
  vision_default: { maxDimension: 1600, format: 'jpeg', quality: 82 },
  vision_detail: { maxDimension: 2400, format: 'jpeg', quality: 88 },
  ui_screenshot: { maxDimension: 2048, format: 'png', quality: 92 },
  thumbnail: { maxDimension: 512, format: 'jpeg', quality: 78 },
}

const MIME_BY_FORMAT: Record<CoreImageOutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function createSharpImageProcessingPort(options: ImagePreprocessingPortOptions): CoreImageProcessingPort {
  const cache = new Map<string, CoreImageProcessingResult>()
  const sourceCache = new Map<string, Promise<LoadedImageBytes>>()
  return {
    async inspect(input) {
      const loaded = await loadImageBytes(input, options.resourceFileDownloader, sourceCache)
      const sharp = await (options.processorFactory ?? loadSharp)()
      const metadata = await sharp(loaded.bytes, { animated: false }).metadata()
      return {
        status: 'inspected',
        source: {
          kind: loaded.kind,
          ...(loaded.resourceId !== undefined ? { resourceId: loaded.resourceId } : {}),
          ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
          sizeBytes: loaded.bytes.length,
          hash: sha256(loaded.bytes),
        },
        image: imageMetadata(metadata),
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      }
    },
    async process(input) {
      const loaded = await loadImageBytes(input, options.resourceFileDownloader, sourceCache)
      const preset = normalizePreset(input.preset)
      const resolved = resolveOutputOptions(input, preset)
      const cacheKey = JSON.stringify({
        sourceHash: sha256(loaded.bytes),
        preset,
        maxDimension: resolved.maxDimension,
        format: resolved.format,
        quality: resolved.quality,
        crop: input.crop ?? null,
      })
      const cached = cache.get(cacheKey)
      if (cached) return cached

      const sharp = await (options.processorFactory ?? loadSharp)()
      const sourceMetadata = await sharp(loaded.bytes, { animated: false }).metadata()
      let pipeline = sharp(loaded.bytes, { animated: false }).rotate().toColorspace('srgb')
      if (input.crop) {
        pipeline = pipeline.extract({
          left: Math.max(0, Math.floor(input.crop.left)),
          top: Math.max(0, Math.floor(input.crop.top)),
          width: Math.max(1, Math.floor(input.crop.width)),
          height: Math.max(1, Math.floor(input.crop.height)),
        })
      }
      pipeline = pipeline.resize({
        width: resolved.maxDimension,
        height: resolved.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      if (resolved.format === 'jpeg') {
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: resolved.quality, mozjpeg: true })
      } else if (resolved.format === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 })
      } else {
        pipeline = pipeline.webp({ quality: resolved.quality })
      }
      const output = await pipeline.toBuffer({ resolveWithObject: true }) as { data: Buffer; info: Record<string, unknown> }
      const mimeType = MIME_BY_FORMAT[resolved.format]
      const result: CoreImageProcessingResult = {
        status: 'processed',
        preset,
        source: {
          kind: loaded.kind,
          ...(loaded.resourceId !== undefined ? { resourceId: loaded.resourceId } : {}),
          ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
          sizeBytes: loaded.bytes.length,
          hash: sha256(loaded.bytes),
        },
        original: imageMetadata(sourceMetadata),
        output: {
          width: numberField(output.info.width) ?? 0,
          height: numberField(output.info.height) ?? 0,
          format: resolved.format,
          mimeType,
          sizeBytes: output.data.length,
          dataUrl: `data:${mimeType};base64,${output.data.toString('base64')}`,
          quality: resolved.quality,
          maxDimension: resolved.maxDimension,
          ...(input.crop ? { crop: input.crop } : {}),
          hash: sha256(output.data),
        },
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      }
      cache.set(cacheKey, result)
      return result
    },
  }
}

async function loadImageBytes(
  input: CoreImageProcessingRequest,
  resourceFileDownloader: ResourceFileDownloadPort,
  sourceCache: Map<string, Promise<LoadedImageBytes>>,
): Promise<LoadedImageBytes> {
  if (input.dataUrl) {
    const parsed = parseImageDataUrl(input.dataUrl)
    if (parsed) {
      return {
        kind: 'data_url',
        ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
        mimeType: parsed.mimeType,
        bytes: parsed.bytes,
        warnings: [],
      }
    }
  }
  if (input.resourceId === undefined) throw new Error('image processing requires resourceId or image dataUrl')
  const resourceInput = { ...input, resourceId: input.resourceId }
  const cacheKey = backendResourceImageSourceCacheKey(resourceInput)
  const cached = sourceCache.get(cacheKey)
  if (cached) return cached

  const loadPromise = loadBackendResourceImageBytes(resourceInput, resourceFileDownloader)
    .catch((error) => {
      sourceCache.delete(cacheKey)
      throw error
    })
  sourceCache.set(cacheKey, loadPromise)
  return loadPromise
}

async function loadBackendResourceImageBytes(
  input: CoreImageProcessingRequest & { resourceId: number },
  resourceFileDownloader: ResourceFileDownloadPort,
): Promise<LoadedImageBytes> {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-agent-image-'))
  const targetPath = join(dir, `resource-${input.resourceId}`)
  let download: ResourceFileDownloadResult | undefined
  try {
    download = await resourceFileDownloader.downloadResourceFile(input.resourceId, targetPath, backendAuthFromRun(input.run), { signal: input.signal })
    if (!download.performed || !download.path) {
      throw new Error(download.skippedReason ?? 'backend resource download did not return a file')
    }
    const bytes = await readFile(download.path)
    return {
      kind: 'backend_resource',
      resourceId: input.resourceId,
      mimeType: download.contentType ?? input.mimeType,
      bytes,
      warnings: [],
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function backendResourceImageSourceCacheKey(input: CoreImageProcessingRequest & { resourceId: number }): string {
  const auth = backendAuthFromRun(input.run)
  const raw = JSON.stringify({
    resourceId: input.resourceId,
    userId: auth.userId ?? null,
    backendAuthTokenHash: auth.backendAuthToken ? sha256(Buffer.from(auth.backendAuthToken)) : null,
    backendAPIBaseURL: auth.backendAPIBaseURL ?? null,
  })
  return createHash('sha256').update(raw).digest('hex')
}

function parseImageDataUrl(value: string): { mimeType: string; bytes: Buffer } | undefined {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value.trim())
  if (!match) return undefined
  return {
    mimeType: match[1] ?? 'image/png',
    bytes: Buffer.from(match[2] ?? '', 'base64'),
  }
}

function resolveOutputOptions(input: CoreImageProcessingRequest, preset: CoreImagePreset): { maxDimension: number; format: CoreImageOutputFormat; quality: number } {
  const defaults = DEFAULT_PRESETS[preset]
  return {
    maxDimension: clampInteger(input.maxDimension, 128, 4096) ?? defaults.maxDimension,
    format: normalizeFormat(input.format) ?? defaults.format,
    quality: clampInteger(input.quality, 1, 100) ?? defaults.quality,
  }
}

function imageMetadata(metadata: Record<string, unknown>): CoreImageInspectionResult['image'] {
  return {
    ...(numberField(metadata.width) !== undefined ? { width: numberField(metadata.width) } : {}),
    ...(numberField(metadata.height) !== undefined ? { height: numberField(metadata.height) } : {}),
    ...(typeof metadata.format === 'string' ? { format: metadata.format } : {}),
    ...(typeof metadata.hasAlpha === 'boolean' ? { hasAlpha: metadata.hasAlpha } : {}),
    ...(numberField(metadata.orientation) !== undefined ? { orientation: numberField(metadata.orientation) } : {}),
  }
}

function normalizePreset(value: unknown): CoreImagePreset {
  return value === 'vision_detail' || value === 'ui_screenshot' || value === 'thumbnail' ? value : 'vision_default'
}

function normalizeFormat(value: unknown): CoreImageOutputFormat | undefined {
  return value === 'jpeg' || value === 'png' || value === 'webp' ? value : undefined
}

function clampInteger(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : undefined
  if (parsed === undefined) return undefined
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function backendAuthFromRun(run: AgentRun): ResourceFileDownloadAuthContext {
  const user = userFromRunContext(run)
  return {
    ...(isValidAgentReferenceId(user?.id) ? { userId: user.id } : {}),
    ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
    ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
  }
}

function userFromRunContext(run: AgentRun): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  return isJSONRecord(context?.user) ? context.user : undefined
}

async function loadSharp(): Promise<SharpFactory> {
  const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ default?: SharpFactory }>
  try {
    const mod = await importer('sharp')
    if (typeof mod.default !== 'function') throw new Error('sharp default export is not a function')
    return mod.default
  } catch (error) {
    throw new Error(`sharp is required for local image preprocessing: ${error instanceof Error ? error.message : String(error)}`)
  }
}

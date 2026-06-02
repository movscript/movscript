import { createHash } from 'node:crypto'
import type { BackendApplyClient } from '../../drafts/adapters/backend/backendApplyClient.js'
import { extractVideoFramesFromBackendResource, type VideoFrameExtraction, type VideoFrameExtractionRequest } from '../../media/video/videoFrameExtraction.js'
import { isValidAgentReferenceId } from '../../context/runtime/runtimeContext.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'
import type { CoreVideoFrameExtractionPort } from '../../ports/media/videoFrameExtractionPort.js'
import type { AgentRun, JSONValue } from '../../state/shared/types.js'

export type BackendVideoFrameExtractor = (input: VideoFrameExtractionRequest) => Promise<VideoFrameExtraction>

const MAX_VIDEO_FRAME_EXTRACTION_CACHE_ENTRIES = 32

export function createBackendVideoFrameExtractionPort(
  backendApplyClient: Pick<BackendApplyClient, 'downloadResourceFile'>,
  extractor: BackendVideoFrameExtractor = extractVideoFramesFromBackendResource,
): CoreVideoFrameExtractionPort {
  const cache = new Map<string, Promise<VideoFrameExtraction>>()
  return {
    extract(input) {
      const auth = backendAuthFromRun(input.run)
      const request: VideoFrameExtractionRequest = {
        resourceId: input.resourceId,
        count: input.count,
        ...(input.timestampsSec && input.timestampsSec.length > 0 ? { timestampsSec: input.timestampsSec } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.startSec !== undefined ? { startSec: input.startSec } : {}),
        ...(input.endSec !== undefined ? { endSec: input.endSec } : {}),
        ...(input.centerSec !== undefined ? { centerSec: input.centerSec } : {}),
        ...(input.windowSec !== undefined ? { windowSec: input.windowSec } : {}),
        ...(input.fps !== undefined ? { fps: input.fps } : {}),
        ...(input.intervalSec !== undefined ? { intervalSec: input.intervalSec } : {}),
        ...(input.maxFrames !== undefined ? { maxFrames: input.maxFrames } : {}),
        ...(input.outputLayout ? { outputLayout: input.outputLayout } : {}),
        maxWidth: input.maxWidth,
        imageFormat: input.imageFormat,
        backendApplyClient,
        auth,
        signal: input.signal,
      }
      const cacheKey = videoFrameExtractionCacheKey(request)
      const cached = cache.get(cacheKey)
      if (cached) return cached.then(cloneVideoFrameExtraction)

      const extraction = extractor(request)
        .then(cloneVideoFrameExtraction)
        .catch((error) => {
          cache.delete(cacheKey)
          throw error
        })
      cache.set(cacheKey, extraction)
      pruneVideoFrameExtractionCache(cache)
      return extraction.then(cloneVideoFrameExtraction)
    },
  }
}

function videoFrameExtractionCacheKey(input: VideoFrameExtractionRequest): string {
  const raw = JSON.stringify({
    resourceId: input.resourceId,
    count: input.count,
    timestampsSec: input.timestampsSec ?? null,
    mode: input.mode ?? null,
    startSec: input.startSec ?? null,
    endSec: input.endSec ?? null,
    centerSec: input.centerSec ?? null,
    windowSec: input.windowSec ?? null,
    fps: input.fps ?? null,
    intervalSec: input.intervalSec ?? null,
    maxFrames: input.maxFrames ?? null,
    outputLayout: input.outputLayout ?? null,
    maxWidth: input.maxWidth,
    imageFormat: input.imageFormat,
    backendAPIBaseURL: input.auth?.backendAPIBaseURL ?? null,
    authScope: backendResourceAuthScope(input.auth),
  })
  return createHash('sha256').update(raw).digest('hex')
}

function backendResourceAuthScope(auth: ReturnType<typeof backendAuthFromRun> | undefined): string {
  const tokenHash = auth?.backendAuthToken ? createHash('sha256').update(auth.backendAuthToken).digest('hex') : 'none'
  return `user:${auth?.userId !== undefined ? String(auth.userId) : 'anonymous'}:token:${tokenHash}`
}

function pruneVideoFrameExtractionCache(cache: Map<string, Promise<VideoFrameExtraction>>): void {
  while (cache.size > MAX_VIDEO_FRAME_EXTRACTION_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

function cloneVideoFrameExtraction(extraction: VideoFrameExtraction): VideoFrameExtraction {
  return {
    ...extraction,
    frames: extraction.frames.map((frame) => ({ ...frame })),
    download: { ...extraction.download },
    ...(extraction.video ? { video: { ...extraction.video } } : {}),
    sampling: {
      ...extraction.sampling,
      timestampsSec: [...extraction.sampling.timestampsSec],
      warnings: [...extraction.sampling.warnings],
    },
    ...(extraction.warnings ? { warnings: [...extraction.warnings] } : {}),
  }
}

function backendAuthFromRun(run: AgentRun): {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
} {
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

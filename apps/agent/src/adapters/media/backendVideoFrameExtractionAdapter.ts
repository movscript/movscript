import type { BackendApplyClient } from '../../drafts/adapters/backend/backendApplyClient.js'
import { extractVideoFramesFromBackendResource, type VideoFrameExtractionRequest } from '../../media/video/videoFrameExtraction.js'
import { isValidAgentReferenceId } from '../../context/runtime/runtimeContext.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'
import type { CoreVideoFrameExtractionPort } from '../../ports/media/videoFrameExtractionPort.js'
import type { AgentRun, JSONValue } from '../../state/shared/types.js'

export type BackendVideoFrameExtractor = (input: VideoFrameExtractionRequest) => Promise<import('../../media/video/videoFrameExtraction.js').VideoFrameExtraction>

export function createBackendVideoFrameExtractionPort(
  backendApplyClient: Pick<BackendApplyClient, 'downloadResourceFile'>,
  extractor: BackendVideoFrameExtractor = extractVideoFramesFromBackendResource,
): CoreVideoFrameExtractionPort {
  return {
    extract(input) {
      return extractor({
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
        auth: backendAuthFromRun(input.run),
        signal: input.signal,
      })
    },
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

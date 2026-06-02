import {
  buildGenerationEvent,
  buildGenerationTimeoutEvent,
  extractGenerationMonitorRequest,
  type GenerationEvent,
} from '../../../generation/events/generationEvents.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../../graph/types/agentGraphTypes.js'
import { executeTool } from '../../tools/execution/executor/toolExecutor.js'

export type AgentGraphGenerationMonitorRequest = NonNullable<ReturnType<typeof extractGenerationMonitorRequest>>

export async function monitorGenerationJob(
  request: AgentGraphGenerationMonitorRequest,
  initialEvent: GenerationEvent,
  input: Pick<
    AgentGraphInput,
    | 'run'
    | 'draftStore'
    | 'externalToolGatewayPort'
    | 'draftApplyPort'
    | 'draftApplyPreviewPort'
    | 'proposalSnapshotHydrationPort'
    | 'resourceFilePort'
    | 'imageProcessingPort'
    | 'videoFrameExtractionPort'
    | 'projectStandardsPort'
    | 'registry'
    | 'runtimeToolHandlers'
    | 'memoryManager'
    | 'referenceManager'
    | 'catalogManager'
    | 'runtimeLimits'
    | 'signal'
    | 'onGenerationEvent'
  >,
  trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>,
): Promise<void> {
  if (!input.onGenerationEvent || request.timeoutMs <= 0) return
  const deadline = Date.now() + request.timeoutMs
  let previousKey = generationEventChangeKey(initialEvent)
  let lastEmittedAt = Date.now()
  const heartbeatMs = request.heartbeatMs > 0 ? request.heartbeatMs : Number.POSITIVE_INFINITY
  while (true) {
    throwIfAborted(input.signal)
    const execResult = await executeTool({ name: request.toolName, args: request.args }, {
      run: input.run,
      draftStore: input.draftStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      draftApplyPort: input.draftApplyPort,
      draftApplyPreviewPort: input.draftApplyPreviewPort,
      proposalSnapshotHydrationPort: input.proposalSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      projectStandardsPort: input.projectStandardsPort,
      registry: input.registry,
      runtimeToolHandlers: input.runtimeToolHandlers,
      memoryManager: input.memoryManager,
      referenceManager: input.referenceManager,
      catalogManager: input.catalogManager,
      sandboxMode: input.runtimeLimits.sandboxMode === true,
      signal: input.signal,
    })
    const event = buildGenerationEvent({ name: request.toolName, args: request.args }, execResult.result)
    if (!event) continue
    const nextKey = generationEventChangeKey(event)
    const now = Date.now()
    const timedOut = now >= deadline
    if (event.stage === 'timeout') {
      input.onGenerationEvent(event, trace)
      return
    }
    if (event.terminal || nextKey !== previousKey || (!timedOut && now - lastEmittedAt >= heartbeatMs)) {
      input.onGenerationEvent(event, trace)
      previousKey = nextKey
      lastEmittedAt = now
    }
    if (event.terminal) return
    if (timedOut) break
    await sleep(Math.min(request.pollIntervalMs, Math.max(0, deadline - now)), input.signal)
  }
  input.onGenerationEvent(buildGenerationTimeoutEvent(initialEvent), trace)
}

function generationEventChangeKey(event: GenerationEvent): string {
  return [
    event.stage,
    event.status,
    event.progress ?? '',
    event.outputResourceId ?? '',
    event.outputResourceIds?.join(',') ?? '',
  ].join(':')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortErrorFromSignal(signal))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(abortErrorFromSignal(signal))
    }, { once: true })
  })
}

function abortErrorFromSignal(signal?: AbortSignal): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw abortErrorFromSignal(signal)
}

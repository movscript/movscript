import type { AgentThreadControlState } from '@movscript/agent-chat'
import { isAgentRunStreamSettledStatus, isAgentRunTerminalStatus } from '@movscript/agent-protocol'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import { DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS } from '@/shared/infrastructure/provider-session-client/config'
import { isRetryableRunStreamError, providerSessionStreamError } from '@/shared/infrastructure/provider-session-client/errors'
import { parseProviderSessionEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEvent'
import { providerSessionRunFromEvent, providerSessionRunIdFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'
import { normalizeOptionalAgentRun, parseTimelineEvent } from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { createProviderSessionAbortError, normalizePositiveTimeoutMs, sleepWithAbort } from '@/shared/infrastructure/provider-session-client/requestSignal'
import { ProviderSessionHttpBaseClient } from '@/shared/infrastructure/provider-session-client/providerSessionHttpBaseClient'
import type {
  AgentRun,
  AgentSession,
  AgentTimelineStreamOptions,
  AgentToolCall,
  AgentThread,
  CreateMessageRunResult,
  PlanStreamOptions,
  ProviderManifest,
  ProviderSessionClientInput,
  ProviderSessionEventV2,
  ProviderSessionLimitsOverride,
  RunMessageOptions,
  SessionStreamOptions,
  ThreadStreamOptions,
} from '@/shared/infrastructure/provider-session-client/types'

export interface ProviderSessionCreateMessageRunInput {
  message: string
  sourceMessageId?: string
  toolCall?: AgentToolCall
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  approvedToolNames?: string[]
  clientInput?: ProviderSessionClientInput
  providerSessionLimits?: ProviderSessionLimitsOverride
  runProfile?: AgentRunProfileSelection
  threadControl?: Partial<AgentThreadControlState>
  activeRunMode?: 'runtime_input' | 'new_run'
  providerSessionInputMode?: 'soft' | 'hard'
  title?: string
  projectId?: number
}

export abstract class ProviderSessionStreamingClient extends ProviderSessionHttpBaseClient {
  abstract getSession(sessionId: string, signal?: AbortSignal): Promise<AgentSession>
  abstract getRun(runId: string, signal?: AbortSignal): Promise<AgentRun>
  abstract getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread>
  abstract createSessionMessageRun(sessionId: string, input: ProviderSessionCreateMessageRunInput, signal?: AbortSignal): Promise<CreateMessageRunResult>

  async waitForRun(runId: string, options: { timeoutMs?: number; pollMs?: number; onRunUpdate?: (run: AgentRun) => void; signal?: AbortSignal } = {}): Promise<AgentRun> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const pollMs = options.pollMs ?? 300
    const deadline = Date.now() + timeoutMs

    while (true) {
      const run = await this.getRun(runId, options.signal)
      options.onRunUpdate?.(run)
      if (isAgentRunStreamSettledStatus(run.status)) return run
      if (Date.now() > deadline) throw new Error(`provider session run ${runId} did not finish within ${timeoutMs}ms`)
      await sleepWithAbort(pollMs, options.signal)
    }
  }

  async streamRun(runId: string, options: RunMessageOptions = {}): Promise<AgentRun> {
    const overallStartedAt = Date.now()
    const overallTimeoutMs = normalizePositiveTimeoutMs(options.timeoutMs)
    const streamRequestTimeoutMs = normalizePositiveTimeoutMs(options.streamRequestTimeoutMs) ?? DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS
    let lastKnownRun: AgentRun | undefined
    const timeoutMs = options.timeoutMs ?? 30_000
    const externalSignal = options.signal
    const fullRunOrLatest = async (run: AgentRun): Promise<AgentRun> => {
      if (run.streamPartial) {
        const fullRun = await this.getRun(run.id, externalSignal).catch(() => undefined)
        if (fullRun) return fullRun
      }
      return run
    }

    let streamRequestCount = 0
    while (true) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()
      const remainingOverallMs = overallTimeoutMs === undefined
        ? undefined
        : overallTimeoutMs - (Date.now() - overallStartedAt)
      if (remainingOverallMs !== undefined && remainingOverallMs <= 0) {
        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (isAgentRunStreamSettledStatus(latestRun.status)) return await fullRunOrLatest(latestRun)
        }
        throw new Error(`provider session stream for run ${runId} timed out after ${timeoutMs}ms across ${streamRequestCount} HTTP request${streamRequestCount === 1 ? '' : 's'}`)
      }

      const controller = new AbortController()
      let streamRequestTimedOut = false
      const abortFromExternal = () => {
        if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
      }
      if (externalSignal?.aborted) abortFromExternal()
      else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

      const requestTimeoutMs = Math.max(1, Math.min(streamRequestTimeoutMs, remainingOverallMs ?? streamRequestTimeoutMs))
      const requestTimeout = globalThis.setTimeout(() => {
        streamRequestTimedOut = true
        controller.abort(createProviderSessionAbortError())
      }, requestTimeoutMs)

      try {
        streamRequestCount += 1
        const attempt = await this.readRunStreamAttempt(runId, options, controller.signal)
        lastKnownRun = attempt.run
        if (isAgentRunStreamSettledStatus(attempt.run.status)) return await fullRunOrLatest(attempt.run)
        options.onRunUpdate?.(attempt.run)
      } catch (error) {
        if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()

        const latestRun = await this.getRun(runId, externalSignal).catch(() => undefined)
        if (latestRun) {
          lastKnownRun = latestRun
          options.onRunUpdate?.(latestRun)
          if (isAgentRunStreamSettledStatus(latestRun.status)) return await fullRunOrLatest(latestRun)
        }

        if (streamRequestTimedOut || (latestRun && isRetryableRunStreamError(error))) {
          continue
        }

        const fallbackRun = lastKnownRun ?? latestRun
        if (fallbackRun && isAgentRunStreamSettledStatus(fallbackRun.status)) return await fullRunOrLatest(fallbackRun)
        throw error
      } finally {
        globalThis.clearTimeout(requestTimeout)
        externalSignal?.removeEventListener('abort', abortFromExternal)
      }
    }
  }

  async streamThread(threadId: string, options: ThreadStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/threads/${encodeURIComponent(threadId)}/stream`, options)
  }

  async streamSession(sessionId: string, options: SessionStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/sessions/${encodeURIComponent(sessionId)}/stream`, options)
  }

  async streamThreadTimeline(threadId: string, options: AgentTimelineStreamOptions = {}): Promise<void> {
    await this.streamTimelineEvents(`/threads/${encodeURIComponent(threadId)}/timeline/stream`, options)
  }

  async streamSessionTimeline(sessionId: string, options: AgentTimelineStreamOptions = {}): Promise<void> {
    const params = new URLSearchParams()
    if (options.threadId) params.set('threadId', options.threadId)
    await this.streamTimelineEvents(`/sessions/${encodeURIComponent(sessionId)}/timeline/stream${params.size ? `?${params.toString()}` : ''}`, options)
  }

  async streamPlan(taskGraphId: string, options: PlanStreamOptions = {}): Promise<void> {
    await this.streamProviderEvents(`/plans/${encodeURIComponent(taskGraphId)}/stream`, options)
  }

  private async streamProviderEvents(
    path: string,
    options: { onProviderEvent?: (event: ProviderSessionEventV2) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseProviderSessionEvent(data)
        if (event) options.onProviderEvent?.(event)
      } catch {
        continue
      }
    }
  }

  private async streamTimelineEvents(
    path: string,
    options: AgentTimelineStreamOptions = {},
  ): Promise<void> {
    const stream = await this.openMeasuredEventStream(path, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal: options.signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    for await (const data of stream.messages()) {
      try {
        const event = parseTimelineEvent(data)
        if (event) options.onTimelineEvent?.(event)
      } catch {
        continue
      }
    }
  }

  private async streamRunFromThread(threadId: string, runId: string, options: RunMessageOptions, initialRun?: AgentRun): Promise<AgentRun> {
    const externalSignal = options.signal
    const controller = new AbortController()
    let latestRun = initialRun
    let settled = false
    const abortFromExternal = () => {
      if (!controller.signal.aborted) controller.abort(externalSignal?.reason)
    }
    if (externalSignal?.aborted) abortFromExternal()
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

    const timeoutMs = normalizePositiveTimeoutMs(options.timeoutMs) ?? 30_000
    const timeout = globalThis.setTimeout(() => {
      if (latestRun?.status === 'requires_action') return
      if (!controller.signal.aborted) controller.abort(createProviderSessionAbortError())
    }, timeoutMs)

    try {
      await this.streamThread(threadId, {
        signal: controller.signal,
        onProviderEvent: (event) => {
          options.onProviderEvent?.(event)
          if (providerSessionRunIdFromEvent(event) !== runId) return
          const eventRun = normalizeOptionalAgentRun(providerSessionRunFromEvent(event))
          if (eventRun) {
            latestRun = eventRun
            options.onRunUpdate?.(eventRun)
          }
          if (latestRun && isAgentRunTerminalStatus(latestRun.status)) {
            settled = true
            if (!controller.signal.aborted) controller.abort(createProviderSessionAbortError())
          }
        },
      })
    } catch (error) {
      if (externalSignal?.aborted) throw externalSignal.reason ?? createProviderSessionAbortError()
      if (!settled) return this.streamRun(runId, options)
    } finally {
      globalThis.clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    }

    const settledRun = latestRun
    if (settledRun && isAgentRunTerminalStatus(settledRun.status)) {
      return settledRun.streamPartial
        ? await this.getRun(settledRun.id, externalSignal).catch(() => settledRun)
        : settledRun
    }
    return this.streamRun(runId, options)
  }

  private async readRunStreamAttempt(runId: string, options: RunMessageOptions, signal: AbortSignal): Promise<{ run: AgentRun }> {
    const stream = await this.openMeasuredEventStream(`/runs/${encodeURIComponent(runId)}/stream`, {
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      signal,
    })
    if (!stream.ok) throw await providerSessionStreamError(stream)

    let latestRun = await this.getRun(runId, signal)
    const processData = (data: string): AgentRun | undefined => {
      const event = parseProviderSessionEvent(data)
      if (!event) return undefined
      options.onProviderEvent?.(event)
      const eventRun = normalizeOptionalAgentRun(providerSessionRunFromEvent(event))
      if (eventRun) {
        latestRun = eventRun
        options.onRunUpdate?.(eventRun)
      }
      if (isAgentRunTerminalStatus(latestRun.status)) return latestRun
      return undefined
    }

    for await (const data of stream.messages()) {
      const settledRun = processData(data)
      if (settledRun) return { run: settledRun }
    }
    if (latestRun.streamPartial && isAgentRunTerminalStatus(latestRun.status)) {
      return { run: latestRun }
    }
    return { run: latestRun }
  }

}

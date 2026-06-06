import { reasoningTextFromStreamEvent, toolNameFromToolCallStreamEvent } from '@/features/agent/domain/agentRunActivity'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface AgentThinkingState {
  status: 'preparing_request' | 'thinking' | 'preparing_tool_call' | 'calling_tool' | 'retrying_model'
  toolName?: string
  label?: string
  reasoning?: string
}

export function getAgentThinkingState(run: AgentRun | null, events: ChatRunActivityEvent[]): AgentThinkingState {
  const retryStatus = latestModelRetryStatus(events)
  if (retryStatus) return { status: 'retrying_model', label: retryStatus }
  const reasoning = latestReasoningStatus(events)
  if (!run || run.status !== 'in_progress') return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  const activeToolStep = [...run.steps].reverse().find((step) => step.type === 'tool_call' && step.status === 'in_progress')
  if (activeToolStep) {
    return {
      status: 'calling_tool',
      ...(activeToolStep.toolName ? { toolName: activeToolStep.toolName } : {}),
      ...(reasoning ? { reasoning } : {}),
    }
  }
  const latestToolCallEvent = [...events].reverse().find((event) => event.kind === 'tool_call' && event.title === 'Model tool call delta')
  if (!latestToolCallEvent) return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  if (latestToolCallEvent.status !== 'started' && latestToolCallEvent.status !== 'info') return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  const eventMs = new Date(latestToolCallEvent.createdAt).getTime()
  const hasNewerToolStep = Number.isFinite(eventMs)
    ? run.steps.some((step) => step.type === 'tool_call' && new Date(step.createdAt).getTime() >= eventMs)
    : false
  if (hasNewerToolStep) return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  const toolName = toolNameFromToolCallStreamEvent(latestToolCallEvent)
  return {
    status: 'preparing_tool_call',
    ...(toolName ? { toolName } : {}),
    ...(reasoning ? { reasoning } : {}),
  }
}

function latestReasoningStatus(events: ChatRunActivityEvent[]): string | undefined {
  for (const event of [...events].reverse()) {
    if (event.kind !== 'reasoning' && event.title !== 'Model reasoning delta') continue
    const reasoning = reasoningTextFromStreamEvent(event)
    if (reasoning) return reasoning
  }
  return undefined
}

function latestModelRetryStatus(events: ChatRunActivityEvent[]): string | undefined {
  const event = [...events].reverse().find((candidate) => candidate.kind === 'model_call' && candidate.title === 'Model retry scheduled')
  if (!event) return undefined
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const retry = data?.retry && typeof data.retry === 'object' ? data.retry as Record<string, unknown> : undefined
  const nextAttempt = typeof retry?.nextAttempt === 'number' ? retry.nextAttempt : undefined
  const maxAttempts = typeof retry?.maxAttempts === 'number' ? retry.maxAttempts : undefined
  const delayMs = typeof retry?.delayMs === 'number' ? retry.delayMs : undefined
  const attemptLabel = nextAttempt !== undefined && maxAttempts !== undefined ? `第 ${nextAttempt}/${maxAttempts} 次` : '下一次'
  const delayLabel = delayMs !== undefined ? `，等待 ${formatDurationLabel(delayMs)}` : ''
  return `模型请求暂时不可用，正在${attemptLabel}重试${delayLabel}`
}

function formatDurationLabel(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

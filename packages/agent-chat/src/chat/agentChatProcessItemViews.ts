import type {
  AgentChatPlanStep,
  AgentChatThreadItem,
} from './agentChatThreadItems.js'

export type AgentChatProcessTone = 'neutral' | 'result' | 'process' | 'diagnostic'

export type AgentChatPlanStatusIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type AgentChatReasoningItemView = {
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentChatProcessTone
  summary: string
  trace: string
  resultDetails?: unknown
  errorDetails?: unknown
  rawDetails?: unknown
  visible: boolean
}

export type AgentChatPlanItemView = {
  intro: string
  text: string
  steps: AgentChatPlanStep[]
  details: unknown | undefined
  visible: boolean
}

export function agentChatReasoningItemView(item: Extract<AgentChatThreadItem, { type: 'reasoning' }>): AgentChatReasoningItemView {
  const summary = item.summary.join('\n').trim()
  const trace = item.content.join('\n').trim()
  return {
    title: item.title?.trim() || 'Reasoning',
    meta: agentChatReasoningMeta(item),
    tone: agentChatReasoningTone(item),
    summary,
    trace,
    ...(item.result !== undefined ? { resultDetails: item.result } : {}),
    ...(item.error !== undefined ? { errorDetails: item.error } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
    visible: Boolean(summary || trace || item.result !== undefined || item.error !== undefined),
  }
}

export function agentChatPlanItemView(item: Extract<AgentChatThreadItem, { type: 'plan' }>): AgentChatPlanItemView {
  const steps = item.items?.length ? item.items : agentChatPlanItems(item.text)
  return {
    intro: agentChatPlanIntro(item.text),
    text: item.text,
    steps,
    details: agentChatPlanDetails(item, steps),
    visible: Boolean(item.text.trim() || item.items?.length),
  }
}

export function agentChatPlanStatusIntent(status: string): AgentChatPlanStatusIntent {
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'done') return 'success'
  if (normalized === 'inprogress' || normalized === 'in_progress' || normalized === 'running') return 'info'
  if (normalized === 'failed' || normalized === 'error') return 'danger'
  if (normalized === 'blocked') return 'warning'
  return 'neutral'
}

function agentChatReasoningMeta(item: Extract<AgentChatThreadItem, { type: 'reasoning' }>): Array<string | undefined | null | false> {
  return [
    item.status ?? undefined,
    item.source ?? undefined,
    ...agentChatRoundMeta(item),
    item.durationMs !== undefined && item.durationMs !== null ? `${item.durationMs}ms` : undefined,
    item.summary.length ? `${item.summary.length} summary part(s)` : undefined,
    item.content.length ? `${item.content.length} trace part(s)` : undefined,
  ]
}

function agentChatRoundMeta(item: Pick<Extract<AgentChatThreadItem, { type: 'reasoning' }>, 'roundId' | 'roundIndex' | 'roundLabel'>): Array<string | undefined> {
  return [
    item.roundLabel ?? undefined,
    item.roundIndex !== undefined && item.roundIndex !== null ? `round ${item.roundIndex}` : undefined,
    item.roundId ? `round id ${item.roundId}` : undefined,
  ]
}

function agentChatReasoningTone(item: Extract<AgentChatThreadItem, { type: 'reasoning' }>): AgentChatProcessTone {
  if (item.error !== undefined) return 'diagnostic'
  if (item.status && /fail|failed|error|cancel|cancelled|rejected|denied/i.test(item.status)) return 'diagnostic'
  return 'process'
}

function agentChatPlanItems(text: string): AgentChatPlanStep[] {
  return text.split('\n').flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed) return []
    const match = /^\[([^\]]+)\]\s+(.+)$/.exec(trimmed)
    if (!match) return []
    return [{ status: match[1]?.trim() || 'pending', text: match[2]?.trim() || '' }].filter((item) => item.text)
  })
}

function agentChatPlanIntro(text: string): string {
  return text.split('\n').filter((line) => {
    const trimmed = line.trim()
    return trimmed && !/^\[[^\]]+\]\s+.+$/.test(trimmed)
  }).join('\n').trim()
}

function agentChatPlanDetails(
  item: Extract<AgentChatThreadItem, { type: 'plan' }>,
  steps: AgentChatPlanStep[],
): unknown | undefined {
  const rawSteps = steps.flatMap((step, index) => step.raw !== undefined
    ? [{
      index: index + 1,
      text: step.text,
      status: step.status,
      raw: step.raw,
    }]
    : [])
  if (item.raw === undefined && rawSteps.length === 0) return undefined
  return {
    ...(item.raw !== undefined ? { raw: item.raw } : {}),
    ...(rawSteps.length > 0 ? { steps: rawSteps } : {}),
  }
}

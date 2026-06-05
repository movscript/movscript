import type { AgentChatNotificationEvent, AgentChatThread, AgentChatTurn } from '@/features/agent/domain/agentChatProtocol'
import type { AgentChatPlanStep, AgentChatTerminalInteraction, AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'

export function upsertAgentChatTurn(thread: AgentChatThread, turn: AgentChatTurn): AgentChatThread {
  const turns = thread.turns ?? []
  const nextTurns = turns.some((item) => item.id === turn.id)
    ? turns.map((item) => item.id === turn.id ? mergeAgentChatTurn(item, turn) : item)
    : [...turns, turn]
  return { ...thread, turns: nextTurns, updatedAt: Math.max(thread.updatedAt, turn.completedAt ?? turn.startedAt ?? 0) }
}

function mergeAgentChatTurn(existing: AgentChatTurn, next: AgentChatTurn): AgentChatTurn {
  return {
    ...next,
    items: mergeAgentChatTurnItems(existing.items, next.items),
  }
}

function mergeAgentChatTurnItems(existing: AgentChatThreadItem[], next: AgentChatThreadItem[]): AgentChatThreadItem[] {
  const existingById = new Map(existing.map((item) => [item.id, item]))
  const nextIds = new Set(next.map((item) => item.id))
  return [
    ...next.map((item) => {
      const existingItem = existingById.get(item.id)
      return existingItem ? mergeAgentChatTurnItem(existingItem, item) : item
    }),
    ...existing.filter((item) => !nextIds.has(item.id)),
  ]
}

export function appendAgentChatTurnItem(thread: AgentChatThread, turnId: string, item: AgentChatThreadItem): AgentChatThread {
  const turns = thread.turns ?? []
  const existingTurn = turns.find((turn) => turn.id === turnId)
  if (!existingTurn) {
    return upsertAgentChatTurn(thread, {
      id: turnId,
      items: [item],
      itemsView: 'full',
      status: 'inProgress',
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    })
  }
  const items = existingTurn.items.some((existing) => existing.id === item.id)
    ? existingTurn.items.map((existing) => existing.id === item.id ? mergeAgentChatTurnItem(existing, item) : existing)
    : [...existingTurn.items, item]
  return upsertAgentChatTurn(thread, { ...existingTurn, items })
}

export function appendAgentChatDeltaTurnItem(
  thread: AgentChatThread,
  turnId: string,
  nextItem: AgentChatThreadItem,
  delta: string,
  reasoningTarget: 'summary' | 'content' = 'content',
  reasoningIndex?: number,
): AgentChatThread {
  const turn = thread.turns.find((item) => item.id === turnId)
  const existing = turn?.items.find((item) => item.id === nextItem.id)
  if (!existing) {
    return appendAgentChatTurnItem(
      thread,
      turnId,
      nextItem.type === 'reasoning'
        ? agentChatReasoningDeltaItem(nextItem, delta, reasoningTarget, reasoningIndex)
        : nextItem,
    )
  }
  if (existing.type === 'agentMessage' && nextItem.type === 'agentMessage') {
    return appendAgentChatTurnItem(thread, turnId, { ...existing, text: `${existing.text}${delta}` })
  }
  if (existing.type === 'plan' && nextItem.type === 'plan') {
    return appendAgentChatTurnItem(thread, turnId, { ...existing, text: `${existing.text}${delta}` })
  }
  if (existing.type === 'reasoning' && nextItem.type === 'reasoning') {
    if (reasoningTarget === 'summary') {
      const summary = appendAgentChatTextPartDelta(existing.summary, delta, reasoningIndex)
      return appendAgentChatTurnItem(thread, turnId, { ...existing, summary })
    }
    const content = appendAgentChatTextPartDelta(existing.content, delta, reasoningIndex)
    return appendAgentChatTurnItem(thread, turnId, { ...existing, content })
  }
  if (existing.type === 'commandExecution' && nextItem.type === 'commandExecution') {
    return appendAgentChatTurnItem(thread, turnId, { ...existing, aggregatedOutput: `${existing.aggregatedOutput ?? ''}${delta}` })
  }
  if (existing.type === 'fileChange' && nextItem.type === 'fileChange') {
    return appendAgentChatTurnItem(thread, turnId, { ...existing, changes: appendAgentChatFileChangeDelta(existing.changes, delta) })
  }
  return appendAgentChatTurnItem(thread, turnId, nextItem)
}

function agentChatReasoningDeltaItem(
  item: Extract<AgentChatThreadItem, { type: 'reasoning' }>,
  delta: string,
  target: 'summary' | 'content',
  index: number | undefined,
): Extract<AgentChatThreadItem, { type: 'reasoning' }> {
  return {
    ...item,
    summary: target === 'summary' ? appendAgentChatTextPartDelta([], delta, index) : item.summary,
    content: target === 'content' ? appendAgentChatTextPartDelta([], delta, index) : item.content,
  }
}

function appendAgentChatTextPartDelta(parts: string[], delta: string, requestedIndex: number | undefined): string[] {
  const index = Number.isInteger(requestedIndex) && requestedIndex !== undefined && requestedIndex >= 0
    ? requestedIndex
    : Math.max(parts.length - 1, 0)
  const next = [...parts]
  while (next.length <= index) next.push('')
  next[index] = `${next[index] ?? ''}${delta}`
  return next
}

export function applyAgentChatNotificationEventToThread(
  thread: AgentChatThread,
  event: AgentChatNotificationEvent,
): AgentChatThread {
  if (event.type === 'commandOutput' || event.type === 'processOutput') {
    return updateCommandExecutionItemByProcessId(thread, agentChatNotificationEventProcessId(event), (item) => ({
      ...item,
      aggregatedOutput: `${item.aggregatedOutput ?? ''}${event.text}`,
    }))
  }
  if (event.type === 'processExited') {
    return updateCommandExecutionItemByProcessId(thread, event.processHandle, (item) => {
      const finalOutput = [event.stdout, event.stderr].filter(Boolean).join('')
      return {
        ...item,
        status: event.exitCode === 0 ? 'completed' : 'failed',
        exitCode: event.exitCode,
        aggregatedOutput: item.aggregatedOutput || finalOutput || item.aggregatedOutput,
      }
    })
  }
  return thread
}

function agentChatNotificationEventProcessId(event: Extract<AgentChatNotificationEvent, { type: 'commandOutput' | 'processOutput' }>): string {
  return event.type === 'commandOutput' ? event.processId : event.processHandle
}

export function appendAgentChatMcpToolCallProgress(
  thread: AgentChatThread,
  turnId: string,
  itemId: string,
  message: string,
): AgentChatThread {
  const updated = updateTurnItem(thread, turnId, itemId, (item) => {
    if (item.type !== 'mcpToolCall') return item
    return {
      ...item,
      status: item.status ?? 'in_progress',
      progressMessages: [...(item.progressMessages ?? []), message],
    }
  })
  if (updated !== thread) return updated
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'mcpToolCall',
    id: itemId,
    server: 'unknown',
    tool: 'unknown',
    status: 'inProgress',
    progressMessages: [message],
  })
}

export function appendAgentChatCommandTerminalInteraction(
  thread: AgentChatThread,
  turnId: string,
  itemId: string,
  interaction: AgentChatTerminalInteraction,
): AgentChatThread {
  const updated = updateTurnItem(thread, turnId, itemId, (item) => {
    if (item.type !== 'commandExecution') return item
    return {
      ...item,
      processId: item.processId ?? interaction.processId,
      terminalInteractions: [...(item.terminalInteractions ?? []), interaction],
    }
  })
  if (updated !== thread) return updated
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'commandExecution',
    id: itemId,
    command: 'Terminal interaction',
    processId: interaction.processId,
    status: 'running',
    terminalInteractions: [interaction],
    aggregatedOutput: null,
  })
}

export function upsertAgentChatApprovalReview(
  thread: AgentChatThread,
  turnId: string,
  review: Extract<AgentChatThreadItem, { type: 'approvalReview' }>,
): AgentChatThread {
  return appendAgentChatTurnItem(thread, turnId, review)
}

export function upsertAgentChatSystemNotice(
  thread: AgentChatThread,
  turnId: string,
  notice: Extract<AgentChatThreadItem, { type: 'systemNotice' }>,
): AgentChatThread {
  return appendAgentChatTurnItem(thread, turnId, notice)
}

export function setAgentChatContextCompaction(
  thread: AgentChatThread,
  turnId: string,
  raw?: unknown,
): AgentChatThread {
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'contextCompaction',
    id: turnContextCompactionItemId(turnId),
    raw,
  })
}

export function setAgentChatFileChangePatch(
  thread: AgentChatThread,
  turnId: string,
  itemId: string,
  changes: unknown[],
): AgentChatThread {
  const updated = updateTurnItem(thread, turnId, itemId, (item) => {
    if (item.type !== 'fileChange') return item
    return {
      ...item,
      status: item.status ?? 'streaming',
      changes: [...changes, ...agentChatFileChangeTextEntries(item.changes)],
    }
  })
  if (updated !== thread) return updated
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'fileChange',
    id: itemId,
    status: 'streaming',
    changes,
  })
}

function appendAgentChatFileChangeDelta(changes: unknown[] | undefined, delta: string): unknown[] {
  if (!changes?.length) return [delta]
  const next = [...changes]
  const last = next.at(-1)
  if (typeof last === 'string') {
    next[next.length - 1] = `${last}${delta}`
    return next
  }
  next.push(delta)
  return next
}

function agentChatFileChangeTextEntries(changes: unknown[] | undefined): string[] {
  return (changes ?? []).filter((change): change is string => typeof change === 'string' && change.length > 0)
}

export function setAgentChatTurnPlan(
  thread: AgentChatThread,
  turnId: string,
  explanation: string | null,
  plan: unknown[],
): AgentChatThread {
  const items = agentChatTurnPlanItems(plan)
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'plan',
    id: turnPlanItemId(turnId),
    text: agentChatTurnPlanText(explanation, items),
    items,
    raw: { explanation, plan },
  })
}

export function setAgentChatTurnDiff(
  thread: AgentChatThread,
  turnId: string,
  diff: string,
): AgentChatThread {
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'fileChange',
    id: turnDiffItemId(turnId),
    status: 'streaming',
    changes: [{ path: 'turn.diff', kind: 'update', diff }],
    raw: { diff },
  })
}

export function ensureAgentChatReasoningSummaryPart(
  thread: AgentChatThread,
  turnId: string,
  itemId: string,
  summaryIndex: number,
): AgentChatThread {
  if (!Number.isInteger(summaryIndex) || summaryIndex < 0) return thread
  const updated = updateTurnItem(thread, turnId, itemId, (item) => {
    if (item.type !== 'reasoning') return item
    const summary = ensureAgentChatTextPart(item.summary, summaryIndex)
    return { ...item, summary }
  })
  if (updated !== thread) return updated
  return appendAgentChatTurnItem(thread, turnId, {
    type: 'reasoning',
    id: itemId,
    summary: ensureAgentChatTextPart([], summaryIndex),
    content: [],
  })
}

function ensureAgentChatTextPart(parts: string[], requestedIndex: number): string[] {
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0) return parts
  const next = [...parts]
  while (next.length <= requestedIndex) next.push('')
  return next
}

function mergeAgentChatTurnItem(existing: AgentChatThreadItem, next: AgentChatThreadItem): AgentChatThreadItem {
  if (existing.type === 'agentMessage' && next.type === 'agentMessage') {
    return { ...next, text: mergeAgentChatText(existing.text, next.text) }
  }
  if (existing.type === 'plan' && next.type === 'plan') {
    if (next.items) return next
    return {
      ...next,
      text: mergeAgentChatText(existing.text, next.text),
      items: next.items ?? existing.items,
    }
  }
  if (existing.type === 'reasoning' && next.type === 'reasoning') {
    return {
      ...next,
      summary: mergeAgentChatTextParts(existing.summary, next.summary),
      content: mergeAgentChatTextParts(existing.content, next.content),
    }
  }
  if (existing.type === 'fileChange' && next.type === 'fileChange') {
    return { ...next, changes: mergeAgentChatFileChanges(existing.changes, next.changes) }
  }
  if (existing.type === 'mcpToolCall' && next.type === 'mcpToolCall' && (existing.progressMessages?.length || next.progressMessages?.length)) {
    return { ...next, progressMessages: uniqueStrings([...(existing.progressMessages ?? []), ...(next.progressMessages ?? [])]) }
  }
  if (existing.type === 'commandExecution' && next.type === 'commandExecution' && (existing.terminalInteractions?.length || next.terminalInteractions?.length)) {
    return {
      ...next,
      aggregatedOutput: mergeAgentChatCommandOutput(existing.aggregatedOutput, next.aggregatedOutput),
      terminalInteractions: uniqueTerminalInteractions([...(existing.terminalInteractions ?? []), ...(next.terminalInteractions ?? [])]),
    }
  }
  if (existing.type === 'commandExecution' && next.type === 'commandExecution') {
    return {
      ...next,
      aggregatedOutput: mergeAgentChatCommandOutput(existing.aggregatedOutput, next.aggregatedOutput),
    }
  }
  return next
}

function mergeAgentChatFileChanges(existing: unknown[] | undefined, next: unknown[] | undefined): unknown[] {
  if (!existing?.length) return next ?? []
  if (!next?.length) return existing
  const existingText = agentChatFileChangeTextEntries(existing)
  const nextText = agentChatFileChangeTextEntries(next)
  const nextStructured = next.filter((change) => typeof change !== 'string')
  const structured = nextStructured.length
    ? nextStructured
    : existing.filter((change) => typeof change !== 'string')
  const mergedText = mergeAgentChatText(
    existingText.join(''),
    nextText.join(''),
  )
  return [
    ...structured,
    ...(mergedText ? [mergedText] : []),
  ]
}

function mergeAgentChatTextParts(existing: string[], next: string[]): string[] {
  const partCount = Math.max(existing.length, next.length)
  const parts: string[] = []
  for (let index = 0; index < partCount; index += 1) {
    parts.push(mergeAgentChatText(existing[index] ?? '', next[index] ?? ''))
  }
  return parts
}

function mergeAgentChatText(existing: string, next: string): string {
  if (!existing) return next
  if (!next) return existing
  if (next.startsWith(existing)) return next
  if (existing.startsWith(next)) return existing
  return `${existing}${next}`
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, array) => value.trim() && array.indexOf(value) === index)
}

function uniqueTerminalInteractions(interactions: AgentChatTerminalInteraction[]): AgentChatTerminalInteraction[] {
  const seen = new Set<string>()
  const next: AgentChatTerminalInteraction[] = []
  for (const interaction of interactions) {
    const key = `${interaction.processId}\u0000${interaction.stdin}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(interaction)
  }
  return next
}

function mergeAgentChatCommandOutput(existing: string | null, next: string | null): string | null {
  if (!existing) return next
  if (!next) return existing
  if (next.startsWith(existing)) return next
  if (existing.startsWith(next)) return existing
  return `${existing}${next}`
}

function turnPlanItemId(turnId: string): string {
  return `turn-plan:${turnId}`
}

function turnDiffItemId(turnId: string): string {
  return `turn-diff:${turnId}`
}

function turnContextCompactionItemId(turnId: string): string {
  return `turn-context-compaction:${turnId}`
}

function agentChatTurnPlanText(explanation: string | null, plan: AgentChatPlanStep[]): string {
  const lines = [
    explanation?.trim() ?? '',
    ...plan.map((step) => `[${step.status}] ${step.text}`),
  ].filter(Boolean)
  return lines.join('\n')
}

function agentChatTurnPlanItems(plan: unknown[]): AgentChatPlanStep[] {
  return plan.flatMap((step) => {
    if (!isRecord(step)) return []
    const text = typeof step.step === 'string' ? step.step.trim() : ''
    if (!text) return []
    const status = typeof step.status === 'string' && step.status.trim() ? step.status.trim() : 'pending'
    return [{ text, status, raw: step }]
  })
}

function updateCommandExecutionItemByProcessId(
  thread: AgentChatThread,
  processId: string,
  update: (item: Extract<AgentChatThreadItem, { type: 'commandExecution' }>) => AgentChatThreadItem,
): AgentChatThread {
  let changed = false
  const turns = thread.turns.map((turn) => {
    const items = turn.items.map((item) => {
      if (item.type !== 'commandExecution' || item.processId !== processId) return item
      changed = true
      return update(item)
    })
    return items === turn.items ? turn : { ...turn, items }
  })
  return changed ? { ...thread, turns } : thread
}

function updateTurnItem(
  thread: AgentChatThread,
  turnId: string,
  itemId: string,
  update: (item: AgentChatThreadItem) => AgentChatThreadItem,
): AgentChatThread {
  let changed = false
  const turns = thread.turns.map((turn) => {
    if (turn.id !== turnId) return turn
    const items = turn.items.map((item) => {
      if (item.id !== itemId) return item
      const nextItem = update(item)
      if (nextItem !== item) changed = true
      return nextItem
    })
    return items === turn.items ? turn : { ...turn, items }
  })
  return changed ? { ...thread, turns } : thread
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function agentChatValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}

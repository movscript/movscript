const AGENT_CONVERSATION_OPEN_STATE_STORAGE_KEY = 'movscript-agent-conversation-open-state'
const AGENT_ACTIVE_CONVERSATION_STORAGE_KEY = 'movscript-agent-active-conversation'
export const AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT = 'movscript-agent-conversation-open-state-changed'

export interface AgentConversationOpenRecord {
  id: string
  open: boolean
}

export function agentConversationOpenStateStorageKey(userId: string) {
  return `${AGENT_CONVERSATION_OPEN_STATE_STORAGE_KEY}:${userId || 'anonymous'}`
}

export function readAgentConversationOpenState(userId: string): AgentConversationOpenRecord[] {
  if (typeof window === 'undefined') return []
  const saved = window.localStorage.getItem(agentConversationOpenStateStorageKey(userId))
  if (saved === null) return []
  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) {
      return normalizeOpenRecords(parsed)
    }
  } catch {
    return []
  }
  return []
}

export function writeAgentConversationOpenState(userId: string, records: AgentConversationOpenRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(agentConversationOpenStateStorageKey(userId), JSON.stringify(normalizeOpenRecords(records)))
  window.dispatchEvent(new CustomEvent(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, { detail: { userId } }))
}

export function agentActiveConversationStorageKey(userId: string) {
  return `${AGENT_ACTIVE_CONVERSATION_STORAGE_KEY}:${userId || 'anonymous'}`
}

export function readAgentActiveConversationId(userId: string) {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(agentActiveConversationStorageKey(userId))?.trim()
  return value || null
}

export function writeAgentActiveConversationId(userId: string, conversationId: string | null | undefined) {
  if (typeof window === 'undefined') return
  const key = agentActiveConversationStorageKey(userId)
  const value = conversationId?.trim()
  if (value) {
    window.localStorage.setItem(key, value)
  } else {
    window.localStorage.removeItem(key)
  }
  window.dispatchEvent(new CustomEvent(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, { detail: { userId } }))
}

export function mergeAgentConversationOpenState(
  records: AgentConversationOpenRecord[],
  conversationIds: string[],
  options: { defaultOpen?: boolean } = {},
) {
  const available = new Set(conversationIds)
  const next = normalizeOpenRecords(records).filter((record) => available.has(record.id))
  const known = new Set(next.map((record) => record.id))
  const defaultOpen = options.defaultOpen ?? true
  for (const id of conversationIds) {
    if (known.has(id)) continue
    if (defaultOpen) next.push({ id, open: true })
    known.add(id)
  }
  return next
}

export function openAgentConversationIds(records: AgentConversationOpenRecord[]) {
  return normalizeOpenRecords(records)
    .filter((record) => record.open)
    .map((record) => record.id)
}

export function hasOpenAgentConversationRecords(records: AgentConversationOpenRecord[]) {
  return normalizeOpenRecords(records).some((record) => record.open)
}

export function setAgentConversationOpen(
  records: AgentConversationOpenRecord[],
  ids: Iterable<string>,
  open: boolean,
) {
  const targetIds = new Set(Array.from(ids).map((id) => id.trim()).filter(Boolean))
  if (targetIds.size === 0) return normalizeOpenRecords(records)
  const next = normalizeOpenRecords(records)
  const known = new Set(next.map((record) => record.id))
  for (const record of next) {
    if (targetIds.has(record.id)) record.open = open
  }
  for (const id of targetIds) {
    if (!known.has(id)) next.push({ id, open })
  }
  return next
}

export function removeAgentConversationOpenRecords(
  records: AgentConversationOpenRecord[],
  ids: Iterable<string>,
) {
  const targetIds = new Set(Array.from(ids).map((id) => id.trim()).filter(Boolean))
  if (targetIds.size === 0) return normalizeOpenRecords(records)
  return normalizeOpenRecords(records).filter((record) => !targetIds.has(record.id))
}

export function reorderAgentConversationOpenState(
  records: AgentConversationOpenRecord[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  if (draggedId === targetId) return normalizeOpenRecords(records)
  const normalized = normalizeOpenRecords(records)
  const dragged = normalized.find((record) => record.id === draggedId)
  if (!dragged) return normalized
  const next = normalized.filter((record) => record.id !== draggedId)
  const targetIndex = next.findIndex((record) => record.id === targetId)
  if (targetIndex < 0) return next
  next.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, dragged)
  return next
}

export function agentConversationOpenRecordsEqual(left: AgentConversationOpenRecord[], right: AgentConversationOpenRecord[]) {
  const normalizedLeft = normalizeOpenRecords(left)
  const normalizedRight = normalizeOpenRecords(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((record, index) => {
      const rightRecord = normalizedRight[index]
      return rightRecord?.id === record.id && rightRecord.open === record.open
    })
}

function normalizeOpenRecords(records: unknown[]) {
  const seen = new Set<string>()
  const normalized: AgentConversationOpenRecord[] = []
  for (const record of records) {
    const recordObject = record && typeof record === 'object' ? record as { id?: unknown; open?: unknown } : null
    const rawId = typeof record === 'string' ? record : typeof recordObject?.id === 'string' ? recordObject.id : ''
    const id = rawId.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push({
      id,
      open: typeof record === 'string' ? true : recordObject?.open !== false,
    })
  }
  return normalized
}

import type { AgentMessage, AgentThread } from '../shared/types.js'

export function normalizeThreadTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return undefined
  const cleaned = firstLine
    .replace(/^["'`“”‘’「『《<\s]+|["'`“”‘’」』》>\s.!?。！？:：,，;；]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return undefined
  return truncateThreadTitle(cleaned)
}

export function fallbackThreadTitle(message: string): string {
  return truncateThreadTitle(
    message
      .replace(/@\[[^\]]+\]\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ) || '新会话'
}

export function isPlaceholderThreadTitle(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ['新会话', '新对话', 'New conversation', 'New Conversation', 'New chat', 'New Chat']
    .includes(value.trim())
}

export function truncateThreadTitle(value: string): string {
  const title = value.trim()
  if (!title) return ''
  return Array.from(title).slice(0, 30).join('')
}

export function shouldGenerateThreadTitle(thread: AgentThread, userMessage: AgentMessage | undefined): boolean {
  if (!userMessage?.content.trim()) return false
  if (thread.title?.trim() && !isPlaceholderThreadTitle(thread.title)) {
    return thread.metadata?.titleGenerationStatus === 'pending' && thread.metadata?.titleSource === 'fallback_pending'
  }
  if (thread.metadata?.titleGeneratedAt) return false
  return true
}

export function markThreadTitleGenerationPending(thread: AgentThread, now: string, userMessage?: AgentMessage): AgentThread {
  if (userMessage?.content.trim()) {
    thread.title = fallbackThreadTitle(userMessage.content)
  }
  thread.metadata = {
    ...(thread.metadata ?? {}),
    titleGenerationStatus: 'pending',
    ...(userMessage ? { titleSourceMessageId: userMessage.id, titleSource: 'fallback_pending' } : {}),
  }
  thread.updatedAt = now
  return thread
}

export function applyThreadTitleGenerationResult(input: {
  thread: AgentThread
  userMessage: AgentMessage
  modelTitle: unknown
  now: string
}): AgentThread {
  const { thread, userMessage, modelTitle, now } = input
  thread.title = normalizeThreadTitle(modelTitle) ?? fallbackThreadTitle(userMessage.content)
  thread.metadata = {
    ...(thread.metadata ?? {}),
    titleGeneratedAt: now,
    titleGenerationStatus: 'completed',
    titleSourceMessageId: userMessage.id,
    titleSource: 'model',
  }
  return thread
}

export function applyThreadTitleGenerationFallback(input: {
  thread: AgentThread
  userMessage: AgentMessage
  error: unknown
  now: string
}): AgentThread {
  const { thread, userMessage, error, now } = input
  thread.title = fallbackThreadTitle(userMessage.content)
  thread.metadata = {
    ...(thread.metadata ?? {}),
    titleGeneratedAt: now,
    titleGenerationStatus: 'fallback',
    titleSourceMessageId: userMessage.id,
    titleSource: 'fallback',
    titleGenerationError: error instanceof Error ? error.message : String(error),
  }
  return thread
}

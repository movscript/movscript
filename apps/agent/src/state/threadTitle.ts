import type { AgentMessage, AgentThread } from './types.js'

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

export function truncateThreadTitle(value: string): string {
  const title = value.trim()
  if (!title) return ''
  return Array.from(title).slice(0, 30).join('')
}

export function shouldGenerateThreadTitle(thread: AgentThread, userMessage: AgentMessage | undefined): boolean {
  if (thread.title?.trim()) return false
  if (!userMessage?.content.trim()) return false
  if (thread.metadata?.titleGeneratedAt) return false
  return true
}

export function markThreadTitleGenerationPending(thread: AgentThread, now: string): AgentThread {
  thread.metadata = {
    ...(thread.metadata ?? {}),
    titleGenerationStatus: 'pending',
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

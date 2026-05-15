import type { AgentMemory } from '../memory/types.js'
import type { AgentMessage } from '../state/types.js'

const DEFAULT_MAX_PROMPT_HISTORY_MESSAGES = 6
const MAX_SUMMARY_ITEM_CHARS = 180

const RUNTIME_FAILURE_PATTERNS = [
  /^运行失败：/,
  /^模型这次没有完成回复。/,
  /^模型调用未完成：/,
  /^警告：运行失败/,
  /^警告：模型调用未完成/,
  /backend model gateway HTTP \d+/i,
  /backend model gateway returned/i,
  /no model config found/i,
]

export function filterPromptHistory(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => !isRuntimeFailureAssistantMessage(message))
}

export interface CompactedPromptHistory {
  messages: AgentMessage[]
  summary?: string
  compactedCount: number
}

export function compactPromptHistory(messages: AgentMessage[], maxMessages = DEFAULT_MAX_PROMPT_HISTORY_MESSAGES): CompactedPromptHistory {
  const filtered = filterPromptHistory(messages)
  const normalizedMax = Number.isFinite(maxMessages) ? Math.max(0, Math.floor(maxMessages)) : DEFAULT_MAX_PROMPT_HISTORY_MESSAGES
  if (filtered.length <= normalizedMax) {
    return { messages: filtered, compactedCount: 0 }
  }
  const compacted = filtered.slice(0, filtered.length - normalizedMax)
  const recent = filtered.slice(-normalizedMax)
  return {
    messages: recent,
    summary: renderThreadContinuitySummary(compacted),
    compactedCount: compacted.length,
  }
}

export function filterPromptMemories(memories: AgentMemory[]): AgentMemory[] {
  return memories.filter((memory) => !isRuntimeFailureText(`${memory.title}\n${memory.content}`))
}

export function buildPromptMemoryIndex(memories: AgentMemory[]): AgentMemory[] {
  return filterPromptMemories(memories).map((memory) => ({
    ...memory,
    content: '',
  }))
}

export function isRuntimeFailureText(text: string): boolean {
  const normalized = text.trim()
  return RUNTIME_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isRuntimeFailureAssistantMessage(message: AgentMessage): boolean {
  return message.role === 'assistant' && isRuntimeFailureText(message.content)
}

function renderThreadContinuitySummary(messages: AgentMessage[]): string {
  const lines = [
    'Earlier thread continuity summary:',
    `- ${messages.length} older message(s) were compacted and are not included verbatim.`,
    ...messages.slice(-6).map((message) => `- ${message.role}: ${truncateForSummary(message.content)}`),
    '- Treat this summary as conversation continuity, not a source of current project facts.',
  ]
  return lines.join('\n')
}

function truncateForSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= MAX_SUMMARY_ITEM_CHARS ? normalized : `${normalized.slice(0, MAX_SUMMARY_ITEM_CHARS - 1)}…`
}

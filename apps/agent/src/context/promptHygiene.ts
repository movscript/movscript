import type { AgentMemory } from '../memory/types.js'
import type { AgentMessage } from '../state/types.js'

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

export function filterPromptMemories(memories: AgentMemory[]): AgentMemory[] {
  return memories.filter((memory) => !isRuntimeFailureText(`${memory.title}\n${memory.content}`))
}

export function isRuntimeFailureText(text: string): boolean {
  const normalized = text.trim()
  return RUNTIME_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isRuntimeFailureAssistantMessage(message: AgentMessage): boolean {
  return message.role === 'assistant' && isRuntimeFailureText(message.content)
}

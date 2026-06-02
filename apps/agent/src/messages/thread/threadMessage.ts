import { cloneJSONValue, isJSONRecord } from '../../shared/json/jsonValue.js'
import {
  buildRuntimeUserMessage,
  normalizeClientInput,
  type NormalizedClientInput,
} from '../../context/input/client/normalizeClientInput.js'
import type {
  AgentMessage,
  AgentMessageRole,
  AgentThread,
  CreateMessageInput,
  CreateThreadInput,
  JSONValue,
} from '../../state/shared/types.js'

export function isMessageRole(value: unknown): value is AgentMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

export function validInitialThreadMessageInputs(input: CreateThreadInput): CreateMessageInput[] {
  return (input.messages ?? [])
    .filter((message) => isMessageRole(message.role) && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content }))
}

export function buildAgentMessage(input: {
  id: string
  threadId: string
  messageInput: CreateMessageInput
  now: string
}): { message: AgentMessage; clientInput?: NormalizedClientInput } {
  const role = isMessageRole(input.messageInput.role) ? input.messageInput.role : 'user'
  const clientInput = normalizeClientInput(input.messageInput.clientInput)
  const content = role === 'user' && clientInput
    ? buildRuntimeUserMessage(clientInput)
    : typeof input.messageInput.content === 'string' ? input.messageInput.content.trim() : ''
  if (!content) throw new Error('message content is required')
  return {
    message: {
      id: input.id,
      threadId: input.threadId,
      role,
      content,
      ...(clientInput ? { clientInput: cloneJSONValue(clientInput as unknown as JSONValue) } : {}),
      ...(typeof input.messageInput.runId === 'string' && input.messageInput.runId.trim() ? { runId: input.messageInput.runId.trim() } : {}),
      ...(isJSONRecord(input.messageInput.metadata) ? { metadata: cloneJSONValue(input.messageInput.metadata) } : {}),
      createdAt: input.now,
    },
    ...(clientInput ? { clientInput } : {}),
  }
}

export function buildThreadMessage(input: {
  id: string
  threadId: string
  role: AgentMessage['role']
  content: string
  now: string
  runId?: string
  metadata?: Record<string, JSONValue>
}): AgentMessage {
  return {
    id: input.id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    runId: input.runId,
    ...(input.metadata ? { metadata: cloneJSONValue(input.metadata) } : {}),
    createdAt: input.now,
  }
}

export function appendThreadMessage(input: {
  thread: AgentThread
  message: AgentMessage
  clientInput?: NormalizedClientInput
}): AgentThread {
  const { thread, message, clientInput } = input
  thread.messages.push(message)
  if (clientInput) recordThreadClientInput(thread, clientInput)
  thread.updatedAt = message.createdAt
  return thread
}

export function recordThreadClientInput(thread: AgentThread, clientInput: NormalizedClientInput): AgentThread {
  thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: cloneJSONValue(clientInput as unknown as JSONValue) }
  return thread
}

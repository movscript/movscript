import { cloneJSONValue, isJSONRecord } from '../jsonValue.js'
import { buildRuntimeUserMessage, normalizeClientInput, type NormalizedClientInput } from '../context/normalizeClientInput.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'
import type { AgentMessage, AgentThread, CreateMessageInput, CreateThreadInput, JSONValue, UpdateThreadInput } from '../state/types.js'
import { isMessageRole } from './assistantMessage.js'

export function buildAgentThread(input: {
  id: string
  now: string
  threadInput?: CreateThreadInput
}): AgentThread {
  const threadInput = input.threadInput ?? {}
  return {
    id: input.id,
    ...(typeof threadInput.title === 'string' && threadInput.title.trim() ? { title: threadInput.title.trim() } : {}),
    ...(isValidAgentProjectId(threadInput.projectId) ? { projectId: threadInput.projectId } : {}),
    ...(isJSONRecord(threadInput.metadata) ? { metadata: cloneJSONValue(threadInput.metadata) } : {}),
    archived: threadInput.archived === true,
    status: 'idle',
    createdAt: input.now,
    updatedAt: input.now,
    messages: [],
  }
}

export function validInitialThreadMessageInputs(input: CreateThreadInput): CreateMessageInput[] {
  return (input.messages ?? [])
    .filter((message) => isMessageRole(message.role) && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content }))
}

export function applyThreadUpdate(input: {
  thread: AgentThread
  update: UpdateThreadInput
  now: string
}): AgentThread {
  const { thread, update, now } = input
  if (typeof update.title === 'string') {
    const title = update.title.trim()
    if (title) thread.title = title
    else delete thread.title
  }
  if (typeof update.archived === 'boolean') thread.archived = update.archived
  if (isJSONRecord(update.metadata)) {
    thread.metadata = { ...(thread.metadata ?? {}), ...cloneJSONValue(update.metadata) }
  }
  thread.updatedAt = now
  return thread
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
}): AgentMessage {
  return {
    id: input.id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    runId: input.runId,
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

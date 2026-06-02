import { cloneJSONValue, isJSONRecord } from '../../../../shared/json/jsonValue.js'
import { isValidAgentProjectId } from '../../../../context/runtime/runtimeContext.js'
import type { AgentSession, AgentThread, AgentThreadRole, CreateThreadInput, UpdateThreadInput } from '../../../../state/shared/types.js'
export {
  appendThreadMessage,
  buildAgentMessage,
  buildThreadMessage,
  isMessageRole,
  recordThreadClientInput,
  validInitialThreadMessageInputs,
} from '../../../../messages/thread/threadMessage.js'

export function buildAgentSession(input: {
  id: string
  now: string
  threadInput?: CreateThreadInput
}): AgentSession {
  const threadInput = input.threadInput ?? {}
  return {
    id: input.id,
    ...(typeof threadInput.title === 'string' && threadInput.title.trim() ? { title: threadInput.title.trim() } : {}),
    ...(isValidAgentProjectId(threadInput.projectId) ? { projectId: threadInput.projectId } : {}),
    ...(isJSONRecord(threadInput.metadata) ? { metadata: cloneJSONValue(threadInput.metadata) } : {}),
    status: 'idle',
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function buildAgentThread(input: {
  id: string
  sessionId?: string
  now: string
  threadInput?: CreateThreadInput
}): AgentThread {
  const threadInput = input.threadInput ?? {}
  const agentRole = normalizeAgentThreadRole(threadInput.agentRole)
    ?? (typeof threadInput.parentThreadId === 'string' && threadInput.parentThreadId.trim() ? 'worker' : 'root')
  return {
    id: input.id,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(typeof threadInput.title === 'string' && threadInput.title.trim() ? { title: threadInput.title.trim() } : {}),
    ...(typeof threadInput.agentName === 'string' && threadInput.agentName.trim() ? { agentName: threadInput.agentName.trim() } : {}),
    agentRole,
    ...(typeof threadInput.parentThreadId === 'string' && threadInput.parentThreadId.trim() ? { parentThreadId: threadInput.parentThreadId.trim() } : {}),
    ...(typeof threadInput.parentRunId === 'string' && threadInput.parentRunId.trim() ? { parentRunId: threadInput.parentRunId.trim() } : {}),
    ...(isValidAgentProjectId(threadInput.projectId) ? { projectId: threadInput.projectId } : {}),
    ...(isJSONRecord(threadInput.metadata) ? { metadata: cloneJSONValue(threadInput.metadata) } : {}),
    archived: threadInput.archived === true,
    status: 'idle',
    createdAt: input.now,
    updatedAt: input.now,
    messages: [],
  }
}

function normalizeAgentThreadRole(value: unknown): AgentThreadRole | undefined {
  return value === 'root' || value === 'planner' || value === 'worker' ? value : undefined
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

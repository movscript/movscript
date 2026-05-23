import type { AgentStore, AgentThreadClearResult, AgentThreadDeletionResult } from '../state/store.js'
import type {
  AgentMessage,
  AgentSession,
  AgentThread,
  CreateMessageInput,
  CreateThreadInput,
  UpdateThreadInput,
} from '../state/types.js'
import {
  appendThreadMessage,
  applyThreadUpdate,
  buildAgentSession,
  buildAgentMessage,
  buildAgentThread,
  validInitialThreadMessageInputs,
} from './threadLifecycle.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'

export interface RuntimeThreadCreationResult {
  thread: AgentThread
  messages: AgentMessage[]
}

export function createRuntimeThread(input: {
  store: Pick<AgentStore, 'createSession' | 'getSession' | 'updateSession' | 'createThread' | 'getThread' | 'updateThread'>
  threadId: string
  sessionId?: string
  messageId: () => string
  now: () => string
  threadInput?: CreateThreadInput
}): RuntimeThreadCreationResult {
  const now = input.now()
  const requestedSessionId = typeof input.threadInput?.sessionId === 'string' && input.threadInput.sessionId.trim()
    ? input.threadInput.sessionId.trim()
    : undefined
  const session = requestedSessionId
    ? requireRuntimeSession(input.store, requestedSessionId)
    : buildAgentSession({
      id: input.sessionId ?? `session_${input.threadId}`,
      now,
      threadInput: input.threadInput,
    })
  if (!requestedSessionId) input.store.createSession(session)
  const thread = buildAgentThread({
    id: input.threadId,
    sessionId: session.id,
    now,
    threadInput: input.threadInput,
  })
  input.store.createThread(thread)
  projectThreadOntoSession({
    store: input.store,
    session,
    thread,
    now,
  })

  const messages: AgentMessage[] = []
  for (const messageInput of validInitialThreadMessageInputs(input.threadInput ?? {})) {
    messages.push(addRuntimeThreadMessage({
      store: input.store,
      threadId: thread.id,
      messageId: input.messageId(),
      now: input.now(),
      messageInput,
    }))
  }

  return { thread: requireRuntimeThread(input.store, thread.id), messages }
}

function requireRuntimeSession(store: Pick<AgentStore, 'getSession'>, id: string): AgentSession {
  const session = store.getSession(id)
  if (!session) throw new Error(`session not found: ${id}`)
  return session
}

function projectThreadOntoSession(input: {
  store: Pick<AgentStore, 'updateSession'>
  session: AgentSession
  thread: AgentThread
  now: string
}): void {
  const session = input.session
  if (!session.rootThreadId || input.thread.agentRole === 'root') {
    session.rootThreadId = input.thread.id
    session.interactiveThreadId = input.thread.id
  } else if (!session.interactiveThreadId) {
    session.interactiveThreadId = session.rootThreadId
  }
  session.activeThreadId = input.thread.id
  session.status = input.thread.status
  session.updatedAt = input.now
  input.store.updateSession(session)
}

export function updateRuntimeThread(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  threadId: string
  update: UpdateThreadInput
  now: string
}): AgentThread {
  const thread = requireRuntimeThread(input.store, input.threadId)
  applyThreadUpdate({ thread, update: input.update, now: input.now })
  input.store.updateThread(thread)
  return thread
}

export function deleteRuntimeThread(input: {
  store: Pick<AgentStore, 'deleteThread'>
  threadId: string
}): AgentThreadDeletionResult {
  return input.store.deleteThread(input.threadId)
}

export function deleteAllRuntimeThreads(input: {
  store: Pick<AgentStore, 'deleteAllThreads'>
}): AgentThreadClearResult {
  return input.store.deleteAllThreads()
}

export function addRuntimeThreadMessage(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  threadId: string
  messageId: string
  messageInput: CreateMessageInput
  now: string
}): AgentMessage {
  const thread = requireRuntimeThread(input.store, input.threadId)
  const { message, clientInput } = buildAgentMessage({
    id: input.messageId,
    threadId: input.threadId,
    messageInput: input.messageInput,
    now: input.now,
  })
  appendThreadMessage({ thread, message, clientInput })
  input.store.updateThread(thread)
  return message
}

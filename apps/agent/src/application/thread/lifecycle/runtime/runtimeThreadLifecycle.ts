import type { AgentStore, AgentThreadClearResult, AgentThreadDeletionResult } from '../../../../state/store/core/store.js'
import type {
  AgentMessage,
  AgentSession,
  AgentThread,
  CreateMessageInput,
  CreateThreadInput,
  UpdateThreadInput,
} from '../../../../state/shared/types.js'
import {
  applyThreadUpdate,
  buildAgentSession,
  buildAgentThread,
} from '../core/threadLifecycle.js'
import {
  appendThreadMessage,
  buildAgentMessage,
  validInitialThreadMessageInputs,
} from '../../../../messages/thread/threadMessage.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'

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
  const existingRequestedSession = requestedSessionId ? input.store.getSession(requestedSessionId) : undefined
  const session = existingRequestedSession ?? buildAgentSession({
    id: requestedSessionId ?? input.sessionId ?? `session_${input.threadId}`,
    now,
    threadInput: input.threadInput,
  })
  if (!existingRequestedSession) input.store.createSession(session)
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
  if (input.thread.title?.trim() && (input.thread.id === session.interactiveThreadId || input.thread.id === session.rootThreadId)) {
    session.title = input.thread.title.trim()
  }
  if (typeof input.thread.projectId === 'number') session.projectId = input.thread.projectId
  session.activeThreadId = input.thread.id
  session.status = input.thread.status
  session.updatedAt = input.now
  input.store.updateSession(session)
}

export function updateRuntimeThread(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'> & Partial<Pick<AgentStore, 'getSession' | 'updateSession'>>
  threadId: string
  update: UpdateThreadInput
  now: string
}): AgentThread {
  const thread = requireRuntimeThread(input.store, input.threadId)
  applyThreadUpdate({ thread, update: input.update, now: input.now })
  input.store.updateThread(thread)
  syncThreadMetadataToSession({
    store: input.store,
    thread,
    now: input.now,
  })
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
  store: Pick<AgentStore, 'getThread' | 'updateThread'> & Partial<Pick<AgentStore, 'getSession' | 'updateSession'>>
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
  activateProvisionalThreadSession({
    store: input.store,
    thread,
    now: input.now,
  })
  input.store.updateThread(thread)
  return message
}

function activateProvisionalThreadSession(input: {
  store: Pick<AgentStore, 'updateThread'> & Partial<Pick<AgentStore, 'getSession' | 'updateSession'>>
  thread: AgentThread
  now: string
}): void {
  if (input.thread.lifecycle !== 'provisional') return
  input.thread.lifecycle = 'active'
  delete input.thread.expiresAt
  input.thread.updatedAt = input.now
  if (!input.thread.sessionId || !input.store.getSession || !input.store.updateSession) return
  const session = input.store.getSession(input.thread.sessionId)
  if (!session || session.lifecycle !== 'provisional') return
  session.lifecycle = 'active'
  delete session.expiresAt
  session.updatedAt = input.now
  input.store.updateSession(session)
}

function syncThreadMetadataToSession(input: {
  store: Pick<AgentStore, 'updateThread'> & Partial<Pick<AgentStore, 'getSession' | 'updateSession'>>
  thread: AgentThread
  now: string
}): void {
  if (!input.thread.sessionId || !input.store.getSession || !input.store.updateSession) return
  const session = input.store.getSession(input.thread.sessionId)
  if (!session) return
  const threadIsDisplayThread = input.thread.id === session.interactiveThreadId || input.thread.id === session.rootThreadId
  let changed = false
  if (threadIsDisplayThread && input.thread.title?.trim() && session.title !== input.thread.title.trim()) {
    session.title = input.thread.title.trim()
    changed = true
  }
  if (typeof input.thread.projectId === 'number' && session.projectId !== input.thread.projectId) {
    session.projectId = input.thread.projectId
    changed = true
  }
  if (!changed) return
  session.updatedAt = input.now
  input.store.updateSession(session)
}

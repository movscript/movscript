import type { AgentStore, AgentThreadClearResult, AgentThreadDeletionResult } from '../state/store.js'
import { isExecutingRunStatus } from '../state/runStatus.js'
import type {
  AgentMessage,
  AgentSession,
  AgentSessionSummary,
  AgentThread,
  AgentThreadSummary,
  CreateMessageInput,
  CreateThreadInput,
  UpdateThreadInput,
} from '../state/types.js'
import {
  addRuntimeThreadMessage,
  createRuntimeThread,
  deleteAllRuntimeThreads,
  deleteRuntimeThread,
  updateRuntimeThread,
} from './runtimeThreadLifecycle.js'
import {
  getRuntimeThread,
  listRuntimeThreads,
  listRuntimeThreadSummaries,
} from './runtimeThreadRead.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export interface RuntimeThreadOperationsBridge {
  listSessions: () => AgentSession[]
  listSessionSummaries: () => AgentSessionSummary[]
  getSession: (id: string) => AgentSession | undefined
  createThread: (input?: CreateThreadInput) => AgentThread
  listThreads: () => AgentThread[]
  listThreadSummaries: () => AgentThreadSummary[]
  getThread: (id: string) => AgentThread | undefined
  updateThread: (id: string, input: UpdateThreadInput) => AgentThread
  deleteThread: (id: string) => AgentThreadDeletionResult
  deleteAllThreads: () => AgentThreadClearResult
  addMessage: (threadId: string, input: CreateMessageInput) => AgentMessage
}

export function createRuntimeThreadOperationsBridge(input: {
  store: AgentStore
  sessionId?: () => string
  threadId?: () => string
  messageId?: () => string
  now?: () => string
}): RuntimeThreadOperationsBridge {
  const sessionId = input.sessionId ?? (() => makeId('session'))
  const threadId = input.threadId ?? (() => makeId('thread'))
  const messageId = input.messageId ?? (() => makeId('msg'))
  const now = input.now ?? isoNow
  return {
    listSessions: () => input.store.listSessions(),
    listSessionSummaries: () => input.store.listSessionSummaries(),
    getSession: (id) => input.store.getSession(id),
    createThread: (threadInput = {}) => createRuntimeThread({
      store: input.store,
      threadId: threadId(),
      sessionId: sessionId(),
      messageId,
      now,
      threadInput,
    }).thread,
    listThreads: () => listRuntimeThreads({ store: input.store }),
    listThreadSummaries: () => listRuntimeThreadSummaries({ store: input.store }),
    getThread: (id) => getRuntimeThread({ store: input.store, threadId: id }),
    updateThread: (id, update) => updateRuntimeThread({
      store: input.store,
      threadId: id,
      update,
      now: now(),
    }),
    deleteThread: (id) => {
      assertThreadHasNoActiveRuns(input.store, id)
      return deleteRuntimeThread({
        store: input.store,
        threadId: id,
      })
    },
    deleteAllThreads: () => {
      assertNoActiveRuns(input.store)
      return deleteAllRuntimeThreads({
        store: input.store,
      })
    },
    addMessage: (id, messageInput) => addRuntimeThreadMessage({
      store: input.store,
      threadId: id,
      messageId: messageInputId(messageInput) ?? messageId(),
      now: now(),
      messageInput,
    }),
  }
}

function assertThreadHasNoActiveRuns(store: AgentStore, threadId: string): void {
  const activeRun = store.listRuns({ threadId }).find((run) => isExecutingRunStatus(run.status))
  if (activeRun) throw new Error(`thread has active run: ${activeRun.id}`)
}

function assertNoActiveRuns(store: AgentStore): void {
  const activeRun = store.listRuns().find((run) => isExecutingRunStatus(run.status))
  if (activeRun) throw new Error(`thread has active run: ${activeRun.id}`)
}

function messageInputId(input: CreateMessageInput): string | undefined {
  if (typeof input.id !== 'string') return undefined
  const id = input.id.trim()
  return id.length > 0 ? id : undefined
}

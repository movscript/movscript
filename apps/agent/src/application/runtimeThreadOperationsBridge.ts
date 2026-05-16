import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentThread,
  AgentThreadSummary,
  CreateMessageInput,
  CreateThreadInput,
  UpdateThreadInput,
} from '../state/types.js'
import {
  addRuntimeThreadMessage,
  createRuntimeThread,
  updateRuntimeThread,
} from './runtimeThreadLifecycle.js'
import {
  getRuntimeThread,
  listRuntimeThreads,
  listRuntimeThreadSummaries,
} from './runtimeThreadRead.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export interface RuntimeThreadOperationsBridge {
  createThread: (input?: CreateThreadInput) => AgentThread
  listThreads: () => AgentThread[]
  listThreadSummaries: () => AgentThreadSummary[]
  getThread: (id: string) => AgentThread | undefined
  updateThread: (id: string, input: UpdateThreadInput) => AgentThread
  addMessage: (threadId: string, input: CreateMessageInput) => AgentMessage
}

export function createRuntimeThreadOperationsBridge(input: {
  store: AgentStore
  threadId?: () => string
  messageId?: () => string
  now?: () => string
}): RuntimeThreadOperationsBridge {
  const threadId = input.threadId ?? (() => makeId('thread'))
  const messageId = input.messageId ?? (() => makeId('msg'))
  const now = input.now ?? isoNow
  return {
    createThread: (threadInput = {}) => createRuntimeThread({
      store: input.store,
      threadId: threadId(),
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
    addMessage: (id, messageInput) => addRuntimeThreadMessage({
      store: input.store,
      threadId: id,
      messageId: messageId(),
      now: now(),
      messageInput,
    }),
  }
}

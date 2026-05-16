import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentThread,
  CreateMessageInput,
  CreateThreadInput,
  UpdateThreadInput,
} from '../state/types.js'
import {
  appendThreadMessage,
  applyThreadUpdate,
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
  store: Pick<AgentStore, 'createThread' | 'getThread' | 'updateThread'>
  threadId: string
  messageId: () => string
  now: () => string
  threadInput?: CreateThreadInput
}): RuntimeThreadCreationResult {
  const thread = buildAgentThread({
    id: input.threadId,
    now: input.now(),
    threadInput: input.threadInput,
  })
  input.store.createThread(thread)

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

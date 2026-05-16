import {
  normalizeClientInput,
  type NormalizedClientInput,
} from '../context/normalizeClientInput.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentThread,
  CreateThreadInput,
  CreateToolRunInput,
  ToolCall,
} from '../state/types.js'
import { normalizeToolCall } from '../tools/toolCallInput.js'
import {
  resolveToolRunThreadTitle,
  resolveToolRunUserMessage,
} from './runExecutionInput.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'
import { appendThreadMessage } from './threadLifecycle.js'

export interface RuntimeToolRunThreadPreparation {
  thread: AgentThread
  userMessage: AgentMessage
  toolCall: ToolCall
  clientInput?: NormalizedClientInput
}

export function prepareRuntimeToolRunThread(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  toolRunInput: Pick<CreateToolRunInput, 'threadId' | 'title' | 'message' | 'clientInput' | 'toolCall'>
  createThread: (threadInput: CreateThreadInput) => AgentThread
}): RuntimeToolRunThreadPreparation {
  const toolCall = normalizeToolCall(input.toolRunInput.toolCall)
  if (!toolCall) throw new Error('toolCall is required')
  const thread = typeof input.toolRunInput.threadId === 'string' && input.toolRunInput.threadId
    ? requireRuntimeThread(input.store, input.toolRunInput.threadId)
    : input.createThread({
      title: resolveToolRunThreadTitle({
        title: input.toolRunInput.title,
        toolName: toolCall.name,
      }),
    })
  const clientInput = normalizeClientInput(input.toolRunInput.clientInput)
  const message = resolveToolRunUserMessage({
    clientInput,
    message: input.toolRunInput.message,
    toolName: toolCall.name,
  })
  const userMessage = createRuntimeMessage({
    threadId: thread.id,
    role: 'user',
    content: message,
  })
  appendThreadMessage({ thread, message: userMessage, clientInput })
  input.store.updateThread(thread)
  return {
    thread,
    userMessage,
    toolCall,
    ...(clientInput ? { clientInput } : {}),
  }
}

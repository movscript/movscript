import {
  normalizeClientInput,
  type NormalizedClientInput,
} from '../../../../context/input/client/normalizeClientInput.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentMessage,
  AgentThread,
  CreateThreadInput,
  CreateToolRunInput,
  ToolCall,
} from '../../../../state/shared/types.js'
import { normalizeToolCall } from '../../../../tools/calls/input/toolCallInput.js'
import {
  resolveToolRunThreadTitle,
  resolveToolRunUserMessage,
} from '../../input/execution/runExecutionInput.js'
import { createRuntimeMessage } from '../../../shared/message/runtimeMessageFactory.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'
import { appendThreadMessage } from '../../../../messages/thread/threadMessage.js'

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

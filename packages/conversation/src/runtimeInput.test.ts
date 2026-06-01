import assert from 'node:assert/strict'
import test from 'node:test'

import { sendRuntimeInputMessage } from './index'
import type { AgentChatMessage } from '@movscript/protocol'

test('sendRuntimeInputMessage creates a pending local message and binds the accepted runtime input by id', async () => {
  const messages: AgentChatMessage[] = []
  const createInputs: Array<{ threadId: string; sourceMessageId?: string; clientInput?: unknown }> = []

  await sendRuntimeInputMessage({
    content: 'Add this constraint',
    clientInput: {
      message: 'Add this constraint',
      attachments: [{ id: 'att_1', type: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
    },
    deps: {
      userId: 'user_1',
      conversationId: 'conv_1',
      threadId: 'thread_1',
      run: { id: 'run_1' },
      messageStore: messageStore(messages),
      createMessageRun: async (threadId, input) => {
        createInputs.push({ threadId, sourceMessageId: input.sourceMessageId, clientInput: input.clientInput })
        return {
          run: { id: 'run_1' },
          message: { id: input.sourceMessageId ?? 'msg_runtime_input', threadId, role: 'user', content: input.message, createdAt: NOW },
          runtimeInput: {
            accepted: true,
            runId: 'run_1',
            messageId: input.sourceMessageId ?? 'msg_runtime_input',
            status: 'accepted',
          },
        }
      },
      setConversationRun: () => {},
      setConversationRuntime: () => {},
    },
  })

  assert.equal(createInputs[0]?.threadId, 'thread_1')
  assert.equal(createInputs[0]?.sourceMessageId, 'local_1')
  assert.deepEqual(createInputs[0]?.clientInput, {
    message: 'Add this constraint',
    attachments: [{ id: 'att_1', type: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
  })
  assert.deepEqual(messages[0]?.meta?.runtimeInput, {
    threadId: 'thread_1',
    runId: 'run_1',
    messageId: 'local_1',
    status: 'accepted',
  })
  assert.deepEqual(messages[0]?.meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'local_1',
    runId: 'run_1',
  })
})

test('sendRuntimeInputMessage treats a fallback created run message as accepted by the agent', async () => {
  const messages: AgentChatMessage[] = []

  await sendRuntimeInputMessage({
    content: 'Continue separately',
    deps: {
      userId: 'user_1',
      conversationId: 'conv_1',
      threadId: 'thread_1',
      run: { id: 'stale_run' },
      messageStore: messageStore(messages),
      createMessageRun: async (threadId, input) => ({
        run: { id: 'run_new' },
        message: { id: input.sourceMessageId ?? 'msg_new', threadId, role: 'user', content: input.message, createdAt: NOW },
      }),
      setConversationRun: () => {},
      setConversationRuntime: () => {},
    },
  })

  assert.deepEqual(messages[0]?.meta?.runtimeInput, {
    threadId: 'thread_1',
    runId: 'run_new',
    messageId: 'local_1',
    status: 'accepted',
  })
})

const NOW = '2026-05-19T00:00:00.000Z'

function messageStore(messages: AgentChatMessage[]) {
  return {
    addMessage: (_userId: string, _conversationId: string, message: Omit<AgentChatMessage, 'id' | 'timestamp'>) => {
      const id = `local_${messages.length + 1}`
      messages.push({ id, timestamp: messages.length + 1, ...message })
      return id
    },
    updateMessageMeta: (_userId: string, _conversationId: string, messageId: string, meta: NonNullable<AgentChatMessage['meta']>) => {
      const index = messages.findIndex((message) => message.id === messageId)
      if (index < 0) return
      messages[index] = {
        ...messages[index],
        meta: {
          ...messages[index]?.meta,
          ...meta,
        },
      } as AgentChatMessage
    },
  }
}

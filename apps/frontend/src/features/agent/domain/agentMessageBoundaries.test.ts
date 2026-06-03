import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTranscriptAssistantChatMessage,
  latestTranscriptChatMessage,
  transcriptAssistantRelatedRunId,
  transcriptAssistantRuntimeMessageRunId,
  transcriptMessageCount,
} from '@/features/agent/domain/agentMessageBoundaries'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('transcript helpers read projected chat messages directly', () => {
  const user = message({ id: 'user_message', role: 'user', content: '开始生成' })
  const final = message({ id: 'final_message', content: '生成完成。' })

  assert.equal(transcriptMessageCount({ transcriptMessages: [user, final] }), 2)
  assert.equal(latestTranscriptChatMessage({ transcriptMessages: [user, final] })?.id, 'final_message')
})

test('transcript assistant run helpers read runtime message ids only', () => {
  const runtimeMessage = message({
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: ' run_runtime ' },
    },
  })
  const messageWithoutRuntime = message()
  assert.equal(isTranscriptAssistantChatMessage(runtimeMessage), true)
  assert.equal(transcriptAssistantRuntimeMessageRunId(runtimeMessage), 'run_runtime')
  assert.equal(transcriptAssistantRelatedRunId(runtimeMessage), 'run_runtime')
  assert.equal(transcriptAssistantRuntimeMessageRunId(messageWithoutRuntime), undefined)
  assert.equal(transcriptAssistantRelatedRunId(messageWithoutRuntime), undefined)
})

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

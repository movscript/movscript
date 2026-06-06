import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assistantMessageCompletesStreamingRun,
  isTranscriptAssistantChatMessage,
  latestTranscriptChatMessage,
  streamingAssistantRunIdFromMessageId,
  transcriptAssistantRelatedRunId,
  transcriptAssistantProviderSessionRunId,
  transcriptMessageCount,
  transcriptMessageItemRelatedRunId,
  transcriptMessageItemThreadRunId,
  transcriptUserRelatedRunId,
  visibleStreamingAssistantTextForTranscript,
} from '@/features/agent/domain/agentMessageBoundaries'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('transcript helpers read projected chat messages directly', () => {
  const user = message({ id: 'user_message', role: 'user', content: '开始生成' })
  const final = message({ id: 'final_message', content: '生成完成。' })

  assert.equal(transcriptMessageCount({ transcriptMessages: [user, final] }), 2)
  assert.equal(latestTranscriptChatMessage({ transcriptMessages: [user, final] })?.id, 'final_message')
})

test('transcript assistant run helpers read provider-session message ids only', () => {
  const providerSessionMessage = message({
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: ' run_provider_session ' },
    },
  })
  const messageWithoutProviderSession = message()
  assert.equal(isTranscriptAssistantChatMessage(providerSessionMessage), true)
  assert.equal(transcriptAssistantProviderSessionRunId(providerSessionMessage), 'run_provider_session')
  assert.equal(transcriptAssistantRelatedRunId(providerSessionMessage), 'run_provider_session')
  assert.equal(transcriptAssistantProviderSessionRunId(messageWithoutProviderSession), undefined)
  assert.equal(transcriptAssistantRelatedRunId(messageWithoutProviderSession), undefined)
})

test('transcript assistant run helpers accept compatibility message refs through the provider-session helper', () => {
  assert.equal(transcriptAssistantProviderSessionRunId(message({
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_compat' },
    },
  })), 'run_compat')
})

test('assistantMessageCompletesStreamingRun only accepts final assistant messages for the matching run', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      providerSessionMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: ' run_1 ',
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_2'), false)
  assert.equal(assistantMessageCompletesStreamingRun({ ...finalAssistantMessage, role: 'user' }, 'run_1'), false)
})

test('assistantMessageCompletesStreamingRun ignores timeline activity and reads provider-session message ids', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      providerSessionMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: 'run_1',
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
})

test('streamingAssistantRunIdFromMessageId resolves stream message ids only', () => {
  assert.equal(streamingAssistantRunIdFromMessageId('stream-run_1'), 'run_1')
  assert.equal(streamingAssistantRunIdFromMessageId('stream- run_1 '), 'run_1')
  assert.equal(streamingAssistantRunIdFromMessageId('assistant_run_1'), undefined)
  assert.equal(streamingAssistantRunIdFromMessageId('stream-   '), undefined)
})

test('visibleStreamingAssistantTextForTranscript hides streaming text after final assistant message lands', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: 'run_1',
      },
    },
  })

  assert.equal(visibleStreamingAssistantTextForTranscript({
    transcriptMessages: [],
    streamingAssistantMessageId: 'stream-run_1',
    streamingAssistantText: '正在回答',
  }), '正在回答')
  assert.equal(visibleStreamingAssistantTextForTranscript({
    transcriptMessages: [finalAssistantMessage],
    streamingAssistantMessageId: 'stream-run_1',
    streamingAssistantText: '正在回答',
  }), '')
  assert.equal(visibleStreamingAssistantTextForTranscript({
    transcriptMessages: [finalAssistantMessage],
    streamingAssistantMessageId: 'stream-run_2',
    streamingAssistantText: '正在回答',
  }), '正在回答')
  assert.equal(visibleStreamingAssistantTextForTranscript({
    transcriptMessages: [finalAssistantMessage],
    streamingAssistantMessageId: 'assistant_run_1',
    streamingAssistantText: '正在回答',
  }), '正在回答')
})

test('transcript user run helpers prefer active run input ids before provider-session message ids', () => {
  const runtimeInputMessage = message({
    role: 'user',
    meta: {
      runtimeInput: { threadId: 'thread_1', runId: ' run_input ', deliveryStatus: 'accepted' },
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_runtime' },
    },
  })
  const runtimeMessageOnly = message({
    role: 'user',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: ' run_runtime ' },
    },
  })

  assert.equal(transcriptUserRelatedRunId(runtimeInputMessage), 'run_input')
  assert.equal(transcriptUserRelatedRunId(runtimeMessageOnly), 'run_runtime')
  assert.equal(transcriptUserRelatedRunId(message()), undefined)
})

test('transcriptMessageItemRelatedRunId prefers assistant runtime ids and falls back to activity ids', () => {
  const runtimeMessage = message({
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: ' run_runtime ' },
    },
  })
  const userActivityMessage = message({
    role: 'user',
  })

  assert.equal(transcriptMessageItemRelatedRunId({
    message: runtimeMessage,
    timelineActivity: {
      runId: 'run_activity',
    },
  }), 'run_runtime')
  assert.equal(transcriptMessageItemRelatedRunId({
    message: userActivityMessage,
    timelineActivity: {
      runId: ' run_activity ',
    },
  }), 'run_activity')
  assert.equal(transcriptMessageItemRelatedRunId({ message: message() }), undefined)
})

test('transcriptMessageItemThreadRunId resolves user and assistant grouping run ids', () => {
  assert.equal(transcriptMessageItemThreadRunId({
    message: message({
      role: 'user',
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_user', deliveryStatus: 'accepted' },
      },
    }),
  }), 'run_user')
  assert.equal(transcriptMessageItemThreadRunId({
    message: message({
      meta: {
        runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_assistant' },
      },
    }),
  }), 'run_assistant')
  assert.equal(transcriptMessageItemThreadRunId({
    message: message({ role: 'assistant' }),
    timelineActivity: {
      runId: 'run_activity',
    },
  }), 'run_activity')
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

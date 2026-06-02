import assert from 'node:assert/strict'
import test from 'node:test'

import { appendAssistantRunResultMessage, completeRuntimeSendRunResult, type CompleteRuntimeSendDeps } from './index'
import type { AgentChatMessage, AgentChatMessageMeta, AgentMessage, AgentRun, AgentRunActivityEvent, AgentThread } from '@movscript/protocol'

interface Artifact {
  id: string
}

interface ThreadResolution {
  threadId: string
  createdNewThread?: boolean
}

test('completeRuntimeSendRunResult binds runtime refs, merges projection, and reports settled status', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  let localUserMessage = chatMessage({ id: 'local_user', role: 'user', content: 'Hello' })
  deps.messageStore.updateMessageMeta = (_userId, _conversationId, messageId, meta) => {
    calls.push(`messageMeta:${messageId}:${meta.runtimeMessage?.messageId}:${meta.runtimeMessage?.runId}`)
    localUserMessage = {
      ...localUserMessage,
      meta: {
        ...localUserMessage.meta,
        ...meta,
      },
    }
  }
  deps.getExistingMessages = () => [localUserMessage]

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: { localRuntime: { requestId: 'request_1' } },
    runResult: {
      run: makeRun({ status: 'completed' }),
      thread: makeThread(),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
      sourceMessage: makeMessage({ id: 'msg_user', role: 'user' }),
    },
    deps,
  })

  assert.equal(calls.includes('setLocalThread:thread_1'), true)
  assert.equal(calls.includes('runtimeThread:thread_1'), true)
  assert.equal(calls.includes('messageMeta:local_user:msg_user:run_1'), true)
  assert.equal(calls.includes('title:Thread title'), true)
  assert.equal(calls.includes('task:request_1:run_1:thread_1:1'), true)
  assert.equal(calls.includes('append:run_1:2'), true)
  assert.equal(calls.includes('projectionSink:thread_1:none:2'), true)
  assert.equal(calls.includes('settled:request_1:completed:run_1:thread_1:1'), true)
})

test('completeRuntimeSendRunResult binds runtime session anchors', async () => {
  const calls: string[] = []

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: {},
    runResult: {
      run: makeRun({ sessionId: 'session_1', status: 'completed' }),
      thread: makeThread({ sessionId: 'session_1' }),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
    },
    deps: depsFixture(calls),
  })

  assert.equal(calls.includes('session:session_1'), true)
  assert.equal(calls.includes('runtimeSession:session_1'), true)
  assert.equal(calls.includes('runtimeThread:thread_1'), true)
})

test('completeRuntimeSendRunResult passes the runtime session anchor to projection', async () => {
  const calls: string[] = []

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: {},
    runResult: {
      run: makeRun({ sessionId: 'session_1', status: 'completed' }),
      thread: makeThread({ sessionId: 'session_1' }),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
    },
    deps: depsFixture(calls),
  })

  assert.equal(calls.includes('projection:thread_1:session_1'), true)
})

test('completeRuntimeSendRunResult skips thread projection for diagnostic commands', async () => {
  const calls: string[] = []

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: { localRuntime: { diagnosticCommand: true } },
    runResult: {
      run: makeRun({ status: 'completed' }),
      thread: makeThread(),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
      sourceMessage: makeMessage({ id: 'msg_user', role: 'user' }),
    },
    deps: depsFixture(calls),
  })

  assert.equal(calls.some((call) => call.startsWith('setLocalThread')), false)
  assert.equal(calls.some((call) => call.startsWith('projectionSink:')), false)
  assert.equal(calls.includes('append:run_1:2'), true)
})

test('completeRuntimeSendRunResult resolves stream partial runs before final writes', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ id: 'run_final', status: 'completed' })
  }

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: {},
    runResult: {
      run: makeRun({ id: 'run_partial', status: 'in_progress', streamPartial: true }),
      thread: makeThread(),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
    },
    deps,
  })

  assert.equal(calls.includes('getRun'), true)
  assert.equal(calls.includes('setRun:run_final:completed:false'), true)
  assert.equal(calls.includes('settled:undefined:completed:run_final:thread_1:1'), true)
})

test('completeRuntimeSendRunResult leaves requires_action runs to runtime projection', async () => {
  const calls: string[] = []

  await completeRuntimeSendRunResult<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution>({
    draft: {},
    runResult: {
      run: makeRun({ status: 'requires_action' }),
      thread: makeThread(),
      threadResolution: { threadId: 'thread_1', createdNewThread: true },
    },
    deps: depsFixture(calls),
  })

  assert.equal(calls.some((call) => call.startsWith('append:')), false)
  assert.equal(calls.includes('projectionSink:thread_1:none:2'), true)
})

test('appendAssistantRunResultMessage owns assistant result ids and message upserts', async () => {
  const calls: string[] = []

  const result = await appendAssistantRunResultMessage<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, AgentRunActivityEvent, Artifact>({
    run: makeRun({ assistantMessageId: 'msg_assistant' }),
    thread: makeThread(),
    liveEvents: [activityEvent({ id: 'event_1' })],
    deps: {
      userId: 'user_1',
      conversationId: 'conv_1',
      messageStore: {
        upsertMessage: (_userId, _conversationId, messageId, message) => {
          calls.push(`upsert:${messageId}:${message.content}:${message.meta?.runtimeMessage?.messageId}`)
        },
      },
      getStreamingAssistantMessageId: () => null,
      resetStreamingAssistant: () => calls.push('resetStreaming'),
      formatAssistantContent: () => 'Done',
      assistantResultPayloadForRun: async () => ({
        meta: {
          runtimeMessage: { threadId: 'thread_1', runId: 'run_1', messageId: 'msg_assistant' },
          draftArtifacts: [{ id: 'artifact_1' }],
        },
      }),
    },
  })

  assert.deepEqual(calls, ['resetStreaming', 'upsert:runtime-run:run_1:assistant:Done:msg_assistant'])
  assert.deepEqual(result, {
    messageId: 'runtime-run:run_1:assistant',
    content: 'Done',
    artifacts: [{ id: 'artifact_1' }],
  })
})

function depsFixture(calls: string[]): CompleteRuntimeSendDeps<AgentChatMessage, AgentChatMessageMeta, AgentRun, AgentThread, Artifact, AgentRunActivityEvent, ThreadResolution> {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    localUserMessageId: 'local_user',
    liveEvents: () => [activityEvent({ id: 'http-request-local-create-thread' })],
    setLiveEventsRef: (events) => {
      calls.push(`liveRef:${events.length}`)
    },
    getRun: async (runId) => {
      calls.push('getRun')
      return makeRun({ id: runId, status: 'completed' })
    },
    extractArtifacts: () => [{ id: 'artifact_1' }],
    setLocalThreadId: (_conversationId, threadId) => {
      calls.push(`setLocalThread:${threadId}`)
    },
    setConversationSessionId: (_conversationId, sessionId) => {
      calls.push(`session:${sessionId}`)
    },
    setConversationRuntimeSessionId: (_userId, _conversationId, sessionId) => {
      calls.push(`runtimeSession:${sessionId}`)
    },
    setConversationRuntimeThreadId: (_userId, _conversationId, threadId) => {
      calls.push(`runtimeThread:${threadId}`)
    },
    messageStore: {
      updateMessageMeta: (_userId, _conversationId, messageId, meta) => {
        calls.push(`messageMeta:${messageId}:${meta.runtimeMessage?.messageId}:${meta.runtimeMessage?.runId}`)
      },
    },
    updateConversationTitle: (_userId, _conversationId, title) => {
      calls.push(`title:${title}`)
    },
    setPageTaskRunning: (requestId, patch) => {
      calls.push(`task:${requestId}:${patch.run?.id}:${patch.threadId}:${patch.artifacts?.length ?? 0}`)
    },
    setConversationRun: (_conversationId, run, patch) => {
      calls.push(`setRun:${run.id}:${run.status}:${patch.loading === true}`)
    },
    setPendingHttpEvents: (events) => {
      calls.push(`pendingHttp:${events.length}`)
    },
    setPendingAssistantState: (state) => {
      calls.push(`pending:${state === null ? 'null' : 'set'}`)
    },
    appendAssistantRunResult: async (run, _thread, liveEvents) => {
      calls.push(`append:${run.id}:${liveEvents.length}`)
    },
    getExistingMessages: () => [chatMessage({ id: 'local_user', role: 'user', content: 'Hello' })],
    setRuntimeThreadProjection: (input) => {
      calls.push(`projectionSink:${input.threadId}:${input.sessionId ?? 'none'}:${input.messages.length}`)
    },
    setLiveTraceEvents: (events) => {
      calls.push(`liveState:${events.length}`)
    },
    threadResolutionActivityEvent: (resolution) => resolution?.createdNewThread
      ? activityEvent({ id: `local-thread-resolution-${resolution.threadId}` })
      : null,
    upsertActivityEvent: (events, event) => [...events, event],
    loadRuntimeThreadProjection: async (input) => {
      calls.push(`projection:${input.threadId}:${input.sessionId ?? 'none'}`)
      return {
        thread: { id: input.threadId },
        messages: [
          ...input.existingMessages,
          chatMessage({
            id: 'runtime:msg_assistant',
            role: 'assistant',
            content: 'Done',
            meta: { runtimeMessage: { threadId: input.threadId, messageId: 'msg_assistant', runId: input.ensureRuns[0]?.id } },
            timestamp: 2,
          }),
        ],
      }
    },
    runTouchesAgentCatalog: () => false,
    refreshAgentCatalogContext: () => {
      calls.push('refreshCatalog')
    },
    notifyRunSettled: (input) => {
      calls.push(`settled:${input.requestId}:${input.status}:${input.run.id}:${input.thread.id}:${input.artifacts.length}`)
    },
  }
}

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread title',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Hello' }),
      makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'Done', runId: 'run_1' }),
    ],
    ...overrides,
  }
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'assistant',
    content: 'Message',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function chatMessage(overrides: Partial<AgentChatMessage> = {}): AgentChatMessage {
  return {
    id: 'chat_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function activityEvent(overrides: Partial<AgentRunActivityEvent> = {}): AgentRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'runtime',
    title: 'Event',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'

import { completeSendRunResult, type CompleteSendRunResultDeps } from './agentSendCompletion'
import type { AgentSendDraft } from './agentSendDraft'
import type { AgentMessage, AgentRun, AgentThread, RunMessageResult } from './localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

test('completeSendRunResult binds runtime thread, source message, assistant result, projection, and settled notification', async () => {
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

  await completeSendRunResult({
    draft: draft({ requestId: 'request_1' }),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.includes('setLocalThread:thread_1'), true)
  assert.equal(calls.includes('runtimeThread:thread_1'), true)
  assert.equal(calls.includes('messageMeta:local_user:msg_user:run_1'), true)
  assert.equal(calls.includes('title:Thread title'), true)
  assert.equal(calls.includes('task:request_1:run_1:thread_1:0'), true)
  assert.equal(calls.includes('setRun:run_1:completed:false'), true)
  assert.equal(calls.includes('pendingHttp:0'), true)
  assert.equal(calls.includes('pending:null'), true)
  assert.equal(calls.includes('append:run_1:2'), true)
  assert.equal(calls.includes('messages:2'), true)
  assert.equal(calls.includes('liveRef:0'), true)
  assert.equal(calls.includes('liveState:0'), true)
  assert.equal(calls.includes('settled:request_1:completed:run_1:thread_1:0'), true)
})

test('completeSendRunResult skips thread binding and projection for diagnostic commands', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await completeSendRunResult({
    draft: draft({ diagnosticCommand: true }),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.some((call) => call.startsWith('setLocalThread')), false)
  assert.equal(calls.some((call) => call.startsWith('runtimeThread')), false)
  assert.equal(calls.some((call) => call.startsWith('messages:')), false)
  assert.equal(calls.includes('append:run_1:2'), true)
})

test('completeSendRunResult resolves stream partial runs before projecting', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ id: 'run_final', status: 'completed' })
  }

  await completeSendRunResult({
    draft: draft(),
    runResult: runResult({ run: makeRun({ id: 'run_partial', streamPartial: true, status: 'in_progress' }) }),
    deps,
  })

  assert.equal(calls.includes('getRun'), true)
  assert.equal(calls.includes('setRun:run_final:completed:false'), true)
  assert.equal(calls.includes('settled:undefined:completed:run_final:thread_1:0'), true)
})

function depsFixture(calls: string[]): CompleteSendRunResultDeps {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    localUserMessageId: 'local_user',
    conversationMessages: [chatMessage({ id: 'local_user', role: 'user', content: 'Hello' })],
    liveEvents: () => [activityEvent({ id: 'http-request-local-create-thread' })],
    setLiveEventsRef: (events) => {
      calls.push(`liveRef:${events.length}`)
    },
    getRun: async (runId) => {
      calls.push('getRun')
      return makeRun({ id: runId, status: 'completed' })
    },
    setLocalThreadId: (_conversationId, threadId) => {
      calls.push(`setLocalThread:${threadId}`)
    },
    setConversationRuntimeThreadId: (_userId, _conversationId, threadId) => {
      calls.push(`runtimeThread:${threadId}`)
    },
    messageStore: {
      updateMessageMeta: (_userId, _conversationId, messageId, meta) => {
        calls.push(`messageMeta:${messageId}:${meta.runtimeMessage?.messageId}:${meta.runtimeMessage?.runId}`)
      },
      setConversationMessages: (_userId, _conversationId, messages) => {
        calls.push(`messages:${messages.length}`)
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
      calls.push(`pending:${state?.status ?? 'null'}`)
    },
    appendAssistantRunResult: async (run, _thread, liveEvents) => {
      calls.push(`append:${run.id}:${liveEvents.length}`)
    },
    getExistingMessages: () => [chatMessage({ id: 'local_user', role: 'user', content: 'Hello' })],
    setLiveTraceEvents: (events) => {
      calls.push(`liveState:${events.length}`)
    },
    fetchResourceById: async () => undefined,
    runTouchesAgentCatalog: () => false,
    refreshAgentCatalogContext: () => {
      calls.push('refreshCatalog')
    },
    notifyRunSettled: (input) => {
      calls.push(`settled:${input.requestId}:${input.status}:${input.run.id}:${input.thread.id}:${input.artifacts.length}`)
    },
  }
}

function draft(localRuntime: NonNullable<AgentSendDraft['localRuntime']> = {}): AgentSendDraft {
  return {
    id: 'draft_1',
    createdAt: 1,
    route: 'local-runtime',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1 },
    agent: { id: null },
    settings: {
      permissionMode: 'ask',
      includeProjectContext: true,
      includeRecentResources: false,
      autoPlan: false,
    },
    contextLabels: [],
    context: { recentResources: [] },
    outbound: {
      systemPrompt: '',
      agentContext: '',
      enrichedUserContent: 'Hello',
      messages: [],
    },
    httpRequests: [],
    localRuntime,
    warnings: [],
  }
}

function runResult(overrides: Partial<RunMessageResult> = {}): RunMessageResult {
  return {
    run: makeRun({ status: 'completed' }),
    thread: makeThread(),
    threadResolution: {
      threadId: 'thread_1',
      requestedThreadId: 'missing_thread',
      reusedExistingThread: false,
      createdNewThread: true,
      missingRequestedThread: true,
    },
    sourceMessage: makeMessage({ id: 'msg_user', role: 'user' }),
    ...overrides,
  }
}

function makeThread(): AgentThread {
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

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'chat_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function activityEvent(overrides: Partial<ChatRunActivityEvent> = {}): ChatRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'runtime',
    title: 'Event',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

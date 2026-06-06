import assert from 'node:assert/strict'
import test from 'node:test'

import { completeSendRunResult, type CompleteSendRunResultDeps } from '@/features/agent/application/agentSendCompletion'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentMessage, AgentRun, AgentThread, RunMessageResult } from '@/shared/infrastructure/providerSessionClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('completeSendRunResult binds provider-session thread, run state, and settled notification', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await completeSendRunResult({
    workspace: workspace({ requestId: 'request_1' }),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.includes('setProviderThread:thread_1'), true)
  assert.equal(calls.includes('providerThread:thread_1'), true)
  assert.equal(calls.includes('title:Thread title'), true)
  assert.equal(calls.includes('task:request_1:run_1:thread_1:0'), true)
  assert.equal(calls.includes('setRun:run_1:completed:false'), true)
  assert.equal(calls.includes('pendingHttp:0'), true)
  assert.equal(calls.includes('pending:null'), true)
  assert.equal(calls.includes('liveRef:0'), true)
  assert.equal(calls.includes('liveState:0'), true)
  assert.equal(calls.includes('settled:request_1:completed:run_1:thread_1:0'), true)
})

test('completeSendRunResult binds diagnostic command threads so local diagnostics are visible', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  await completeSendRunResult({
    workspace: workspace({ diagnosticCommand: true }),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.includes('setProviderThread:thread_1'), true)
  assert.equal(calls.includes('providerThread:thread_1'), true)
  assert.equal(calls.includes('title:Thread title'), true)
})

test('completeSendRunResult resolves stream partial runs before completing state', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ id: 'run_final', status: 'completed' })
  }

  await completeSendRunResult({
    workspace: workspace(),
    runResult: runResult({ run: makeRun({ id: 'run_partial', streamPartial: true, status: 'in_progress' }) }),
    deps,
  })

  assert.equal(calls.includes('getRun'), true)
  assert.equal(calls.includes('setRun:run_final:completed:false'), true)
  assert.equal(calls.includes('settled:undefined:completed:run_final:thread_1:0'), true)
})

test('completeSendRunResult keeps settled generation activity for pinned status', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.liveEvents = () => [
    activityEvent({ id: 'http-request-provider-session-message-run' }),
    activityEvent({
      id: 'trace_generation_completed',
      kind: 'tool_call',
      title: 'Generation completed: Job #31',
      status: 'completed',
      data: {
        generation: {
          jobId: 31,
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 310,
        },
      },
    }),
  ]

  await completeSendRunResult({
    workspace: workspace(),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.includes('pendingHttp:1'), true)
  assert.equal(calls.includes('liveState:0'), true)
})

test('completeSendRunResult keeps model telemetry activity until timeline history catches up', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.liveEvents = () => [
    activityEvent({ id: 'runtime_status_local' }),
    activityEvent({
      id: 'model_req_1',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      status: 'started',
      roundIndex: 1,
    }),
    activityEvent({
      id: 'model_res_1',
      kind: 'model_call',
      title: 'Model HTTP response received',
      status: 'completed',
      roundIndex: 1,
      durationMs: 1234,
      data: {
        usage: {
          input_tokens: 100,
          output_tokens: 10,
        },
      },
    }),
  ]

  await completeSendRunResult({
    workspace: workspace(),
    runResult: runResult(),
    deps,
  })

  assert.equal(calls.includes('pendingHttp:2'), true)
  assert.equal(calls.includes('pendingHttpIds:model_req_1,model_res_1'), true)
  assert.equal(calls.includes('liveState:0'), true)
})

test('completeSendRunResult leaves requires_action messages to the message item', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  const approvalRun = makeRun({
    status: 'requires_action',
    input: {
      schema: 'movscript.agent.run-input.v1',
      sourceMessageId: 'msg_user',
      userMessage: 'Create video',
      executionMode: 'chat',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'generation_job_create',
      reason: 'generation_job_create 需要用户确认后才能执行',
      risk: 'generate',
      permission: 'generation.create',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
  })

  await completeSendRunResult({
    workspace: workspace({ requestId: 'request_1' }),
    runResult: runResult({
      run: approvalRun,
      thread: makeThread({
        status: 'requires_action',
        messages: [makeMessage({ id: 'msg_user', role: 'user', content: 'Create video' })],
      }),
    }),
    deps,
  })

  assert.equal(calls.some((call) => call.startsWith('append:')), false)
  assert.equal(calls.some((call) => call.startsWith('projectionSink:')), false)
  assert.equal(calls.includes('setRun:run_1:requires_action:false'), true)
})

function depsFixture(calls: string[]): CompleteSendRunResultDeps {
  return {
    userId: 'user_1',
    conversationId: 'conv_1',
    liveEvents: () => [activityEvent({ id: 'http-request-provider-session-message-run' })],
    setLiveEventsRef: (events) => {
      calls.push(`liveRef:${events.length}`)
    },
    getRun: async (runId) => {
      calls.push('getRun')
      return makeRun({ id: runId, status: 'completed' })
    },
    setProviderThreadId: (_conversationId, threadId) => {
      calls.push(`setProviderThread:${threadId}`)
    },
    setConversationProviderThreadId: (_userId, _conversationId, threadId) => {
      calls.push(`providerThread:${threadId}`)
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
      calls.push(`pendingHttpIds:${events.map((event) => event.id).join(',')}`)
    },
    setPendingAssistantState: (state) => {
      calls.push(`pending:${state?.status ?? 'null'}`)
    },
    setLiveTraceEvents: (events) => {
      calls.push(`liveState:${events.length}`)
    },
    runTouchesProviderCatalog: () => false,
    refreshProviderCatalogContext: () => {
      calls.push('refreshCatalog')
    },
    notifyRunSettled: (input) => {
      calls.push(`settled:${input.requestId}:${input.status}:${input.run.id}:${input.thread.id}:${input.artifacts.length}`)
    },
  }
}

function workspace(providerSession: NonNullable<AgentSendWorkspace['providerSession']> = {}): AgentSendWorkspace {
  return {
    id: 'workspace_1',
    createdAt: 1,
    route: 'provider-session',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1 },
    agent: { id: null },
    settings: {
      includeProjectContext: true,
      includeRecentResources: false,
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
    providerSession,
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
    providerSessionLimits: { approvalMode: 'interactive',
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

function activityEvent(overrides: Partial<ChatRunActivityEvent> = {}): ChatRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'provider_session',
    title: 'Event',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

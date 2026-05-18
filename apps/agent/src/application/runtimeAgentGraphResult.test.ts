import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentGraphResult } from '../orchestration/agentGraph.js'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
} from '../state/types.js'
import { applyRuntimeAgentGraphResult } from './runtimeAgentGraphResult.js'

test('applyRuntimeAgentGraphResult pauses runs that require action', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  const traces: string[] = []
  const snapshots: string[] = []

  const result = applyRuntimeAgentGraphResult({
    ...baseInput(store, run, thread, { status: 'requires_action', pendingApprovals: [approval()], pendingInputRequests: [], messages: [], toolOutcomes: [], warnings: ['needs approval'] }),
    recordTrace: (_run, trace) => traces.push(`${trace.kind}:${trace.title}`),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  assert.equal((result as AgentRun).status, 'requires_action')
  assert.deepEqual(traces, ['approval:Approval required'])
  assert.deepEqual(snapshots, ['requires_action:true'])
  assert.equal(store.getThread('thread_1')?.status, 'requires_action')
})

test('applyRuntimeAgentGraphResult does not duplicate graph input pause traces', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  const traces: string[] = []

  const result = applyRuntimeAgentGraphResult({
    ...baseInput(store, run, thread, {
      status: 'requires_action',
      pendingApprovals: [],
      pendingInputRequests: [inputRequest()],
      messages: [],
      toolOutcomes: [],
      warnings: [],
    }),
    recordTrace: (_run, trace) => traces.push(`${trace.kind}:${trace.title}`),
  })

  assert.equal((result as AgentRun).status, 'requires_action')
  assert.deepEqual(traces, [])
  assert.equal(store.getRun('run_1')?.pendingInputRequests?.[0]?.status, 'pending')
})

test('applyRuntimeAgentGraphResult delegates cancelled graph results', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  let cancelledReason: string | undefined

  const result = applyRuntimeAgentGraphResult({
    ...baseInput(store, run, thread, { status: 'cancelled', reason: 'user stopped' }),
    markRunCancelled: (targetRun, reason) => {
      cancelledReason = reason
      targetRun.status = 'cancelled'
      return targetRun
    },
  })

  assert.equal((result as AgentRun).status, 'cancelled')
  assert.equal(cancelledReason, 'user stopped')
})

test('applyRuntimeAgentGraphResult throws failed graph errors for failure finalizer', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()

  assert.throws(
    () => applyRuntimeAgentGraphResult({
      ...baseInput(store, run, thread, { status: 'failed', error: 'model failed' }),
    }),
    /model failed/,
  )
})

test('applyRuntimeAgentGraphResult completes successful graph results', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread({ messages: [message('msg_user', 'thread_1', 'user', 'hello')] })
  store.createThread(thread)
  store.createRun(run)
  const assistantMessages: AgentMessage[] = []
  const deferred: string[] = []

  const result = applyRuntimeAgentGraphResult({
    ...baseInput(store, run, thread, {
      status: 'completed',
      finalContent: 'done',
      assistantContents: ['done'],
      toolOutcomes: [],
      warnings: [],
    }),
    emitAssistantMessage: (_run, assistant) => assistantMessages.push(assistant),
    deferPostRunRecords: (runId, input) => deferred.push(`${runId}:${input.userMessage.id}`),
  })

  assert.equal((result as AgentMessage).role, 'assistant')
  assert.equal(run.status, 'completed')
  assert.equal(run.assistantMessageId, 'msg_assistant')
  assert.equal(thread.messages.at(-1)?.id, 'msg_assistant')
  assert.equal(assistantMessages[0]?.id, 'msg_assistant')
  assert.deepEqual(deferred, ['run_1:msg_user'])
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
  result: AgentGraphResult,
): Parameters<typeof applyRuntimeAgentGraphResult>[0] {
  return {
    store,
    result,
    run,
    thread,
    userMessage: 'hello',
    memories: [],
    postRunUserMessage: message('msg_user', thread.id, 'user', 'hello'),
    messageId: 'msg_assistant',
    now: '2026-01-01T00:00:01.000Z',
    projectionNow: '2026-01-01T00:00:01.000Z',
    stepCompletedAt: '2026-01-01T00:00:01.000Z',
    summaryNow: '2026-01-01T00:00:01.000Z',
    markRunCancelled: (targetRun, reason) => {
      targetRun.status = 'cancelled'
      targetRun.cancelledAt = '2026-01-01T00:00:01.000Z'
      if (reason) targetRun.error = reason
      return targetRun
    },
    recordTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: `step_${targetRun.steps.length + 1}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
    deferPostRunRecords: () => {},
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function message(
  id: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
): AgentMessage {
  return {
    id,
    threadId,
    role,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function approval() {
  return {
    id: 'approval_1',
    runId: 'run_1',
    toolName: 'tool_a',
    args: {},
    reason: 'Needs approval',
    status: 'pending' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function inputRequest() {
  return {
    id: 'input_1',
    runId: 'run_1',
    title: '选择目标内容',
    question: '请选择目标',
    inputType: 'choice' as const,
    choices: [{ id: 'script', label: '剧本' }],
    allowCustomAnswer: false,
    status: 'pending' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

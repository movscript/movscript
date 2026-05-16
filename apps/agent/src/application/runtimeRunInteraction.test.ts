import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRun, AgentRunStep, AgentThread } from '../state/types.js'
import {
  answerRuntimeRunInputRequest,
  applyRuntimeRunApprovalFlow,
  applyRuntimeRunInputAnswerFlow,
  applyRuntimeRunRejectionFlow,
  approveRuntimeRunInteraction,
  rejectRuntimeRunInteraction,
  type RuntimeRunInteractionTraceInput,
} from './runtimeRunInteraction.js'

const now = '2026-01-01T00:00:01.000Z'

test('approveRuntimeRunInteraction applies approval state and projects the queued run to the thread', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingApprovals: [approval('approval_1', 'tool_a')],
  }))
  let callbackObservedStatus: AgentRun['status'] | undefined

  const result = approveRuntimeRunInteraction({
    store,
    runId: 'run_1',
    approvalInput: { approvalIds: ['approval_1'] },
    now,
    beforePersist: (run, approvalResult) => {
      callbackObservedStatus = run.status
      assert.deepEqual(approvalResult.approvedToolNames, ['tool_a'])
    },
  })

  assert.equal(callbackObservedStatus, 'queued')
  assert.equal(result.run.status, 'queued')
  assert.equal(store.getRun('run_1')?.pendingApprovals?.[0]?.status, 'approved')
  assert.deepEqual(store.getRun('run_1')?.metadata?.approvedToolNames, ['tool_a'])
  assert.equal(store.getThread('thread_1')?.status, 'running')
  assert.equal(store.getThread('thread_1')?.activeRunId, 'run_1')
})

test('answerRuntimeRunInputRequest records the answer and appends an intentional user-visible message', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingInputRequests: [inputRequest('input_1')],
  }))

  const result = answerRuntimeRunInputRequest({
    store,
    runId: 'run_1',
    answerInput: {
      requestId: 'input_1',
      choiceIds: ['script'],
      text: '补充说明',
    },
    messageId: 'msg_answer',
    now,
  })

  const run = store.getRun('run_1')
  const thread = store.getThread('thread_1')
  assert.equal(result.run.status, 'queued')
  assert.equal(run?.pendingInputRequests?.[0]?.status, 'answered')
  assert.deepEqual(run?.pendingInputRequests?.[0]?.answer, { choiceIds: ['script'], text: '补充说明' })
  assert.equal(result.message.id, 'msg_answer')
  assert.equal(thread?.messages[0]?.role, 'user')
  assert.match(thread?.messages[0]?.content ?? '', /选择目标内容/)
  assert.match(thread?.messages[0]?.content ?? '', /补充说明/)
  assert.equal(thread?.status, 'running')
})

test('rejectRuntimeRunInteraction completes the run with a warning and assistant message', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingApprovals: [approval('approval_1', 'tool_a')],
  }))
  const callbacks: string[] = []

  const result = rejectRuntimeRunInteraction({
    store,
    runId: 'run_1',
    messageId: 'msg_rejected',
    now,
    beforeMessage: (_run, rejection, warning) => {
      callbacks.push('beforeMessage')
      assert.deepEqual(rejection.rejectedToolNames, ['tool_a'])
      assert.match(warning, /tool_a/)
    },
    beforePersist: (run, _rejection, message) => {
      callbacks.push('beforePersist')
      assert.equal(run.status, 'completed_with_warnings')
      assert.equal(message.id, 'msg_rejected')
    },
  })

  const run = store.getRun('run_1')
  const thread = store.getThread('thread_1')
  assert.deepEqual(callbacks, ['beforeMessage', 'beforePersist'])
  assert.equal(result.run.status, 'completed_with_warnings')
  assert.equal(run?.pendingApprovals?.[0]?.status, 'rejected')
  assert.equal(run?.assistantMessageId, 'msg_rejected')
  assert.match(run?.warnings?.[0] ?? '', /tool_a/)
  assert.equal(thread?.messages[0]?.role, 'assistant')
  assert.match(thread?.messages[0]?.content ?? '', /已取消需要确认的工具调用/)
  assert.equal(thread?.status, 'completed')
  assert.equal(thread?.activeRunId, undefined)
})

test('applyRuntimeRunApprovalFlow records trace, emits snapshot, remembers auth, and restarts execution', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingApprovals: [approval('approval_1', 'tool_a')],
  }))
  const traces: RuntimeRunInteractionTraceInput[] = []
  const events: string[] = []

  const run = applyRuntimeRunApprovalFlow({
    store,
    runId: 'run_1',
    approvalInput: { approvalIds: ['approval_1'], backendAuthToken: 'token' },
    now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitRunSnapshot: (targetRun) => events.push(`snapshot:${targetRun.status}`),
    rememberRunAuth: (targetRunId, value) => events.push(`auth:${targetRunId}:${typeof value === 'object'}`),
    startRunExecution: (targetRunId) => events.push(`start:${targetRunId}`),
  })

  assert.equal(run.status, 'queued')
  assert.equal(traces[0]?.kind, 'approval')
  assert.equal(traces[0]?.status, 'completed')
  assert.deepEqual(events, ['snapshot:queued', 'auth:run_1:true', 'start:run_1'])
})

test('applyRuntimeRunInputAnswerFlow records input trace, emits snapshot, remembers auth, and restarts execution', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingInputRequests: [inputRequest('input_1')],
  }))
  const traces: RuntimeRunInteractionTraceInput[] = []
  const events: string[] = []

  const run = applyRuntimeRunInputAnswerFlow({
    store,
    runId: 'run_1',
    answerInput: { requestId: 'input_1', text: '继续' },
    messageId: 'msg_answer',
    now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitRunSnapshot: (targetRun) => events.push(`snapshot:${targetRun.status}`),
    rememberRunAuth: (targetRunId, value) => events.push(`auth:${targetRunId}:${typeof value === 'object'}`),
    startRunExecution: (targetRunId) => events.push(`start:${targetRunId}`),
  })

  assert.equal(run.status, 'queued')
  assert.equal(traces[0]?.kind, 'input')
  assert.deepEqual((traces[0]?.data as Record<string, unknown>).choiceIds, [])
  assert.deepEqual(events, ['snapshot:queued', 'auth:run_1:true', 'start:run_1'])
})

test('applyRuntimeRunRejectionFlow records trace, completes rejection message step, and emits done snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'requires_action', activeRunId: 'run_1' }))
  store.createRun(makeRun({
    status: 'requires_action',
    pendingApprovals: [approval('approval_1', 'tool_a')],
  }))
  const traces: RuntimeRunInteractionTraceInput[] = []
  const events: string[] = []
  let completedStep: AgentRunStep | undefined

  const run = applyRuntimeRunRejectionFlow({
    store,
    runId: 'run_1',
    messageId: 'msg_rejected',
    now,
    recordTrace: (_run, trace) => traces.push(trace),
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitRunSnapshot: (targetRun, options) => events.push(`snapshot:${targetRun.status}:${options.done === true}`),
  })

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(traces[0]?.kind, 'approval')
  assert.equal(traces[0]?.status, 'blocked')
  assert.equal(completedStep?.status, 'completed')
  assert.deepEqual(completedStep?.result, { messageId: 'msg_rejected', rejectedToolNames: ['tool_a'] })
  assert.deepEqual(events, ['snapshot:completed_with_warnings:true'])
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'idle',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
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

function approval(id: string, toolName: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName,
    reason: 'Needs approval',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function inputRequest(id: string): AgentInputRequest {
  return {
    id,
    runId: 'run_1',
    title: '选择目标内容',
    summary: '需要用户补充选择',
    question: '请选择目标内容类型',
    inputType: 'choice',
    choices: [{ id: 'script', label: '剧本' }],
    allowCustomAnswer: true,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

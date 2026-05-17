import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentInputRequest, AgentRun } from './types.js'
import {
  applyAnsweredRunInputInteraction,
  applyApprovedRunInteraction,
  applyRejectedRunInteraction,
  applyRequiredRunAction,
  answerRunInputInteraction,
  approveRunInteraction,
  cancelPendingRunInteractions,
  formatInputAnswerMessage,
  mergePendingApprovals,
  mergePendingInputRequests,
  rejectedRunInteractionWarning,
  rejectRunInteraction,
} from './runInteractionState.js'

const now = '2026-05-16T12:00:00.000Z'

test('approveRunInteraction approves selected approvals and accumulates approved tool names', () => {
  const run = buildRun({
    metadata: { approvedToolNames: ['existing_tool'] },
    pendingApprovals: [
      approval('approval_1', 'tool_a'),
      approval('approval_2', 'tool_b'),
    ],
  })

  const result = approveRunInteraction(run, { approvalIds: ['approval_1'] }, now)

  assert.equal(result.approvingAll, false)
  assert.deepEqual(result.selectedApprovalIds, ['approval_1'])
  assert.deepEqual(result.approvedToolNames.sort(), ['existing_tool', 'tool_a'])
  assert.equal(result.pendingApprovals[0]?.status, 'approved')
  assert.equal(result.pendingApprovals[0]?.approvedAt, now)
  assert.equal(result.pendingApprovals[1]?.status, 'pending')
})

test('applyApprovedRunInteraction queues the run with approved tool metadata', () => {
  const run = buildRun({ pendingApprovals: [approval('approval_1', 'tool_a')] })
  const approved = approveRunInteraction(run, {}, now)

  applyApprovedRunInteraction(run, approved, now)

  assert.equal(run.status, 'queued')
  assert.equal(run.updatedAt, now)
  assert.deepEqual(run.pendingApprovals?.map((item) => item.status), ['approved'])
  assert.deepEqual(run.metadata?.approvedToolNames, ['tool_a'])
})

test('applyApprovedRunInteraction stores an independent approved tool snapshot', () => {
  const run = buildRun({ pendingApprovals: [approval('approval_1', 'tool_a')] })
  const approved = approveRunInteraction(run, {}, now)

  applyApprovedRunInteraction(run, approved, now)
  approved.approvedToolNames[0] = 'changed'

  assert.deepEqual(run.metadata?.approvedToolNames, ['tool_a'])
})

test('approveRunInteraction approves all pending approvals when no selector is provided', () => {
  const result = approveRunInteraction(buildRun({
    pendingApprovals: [
      approval('approval_1', 'tool_a'),
      approval('approval_2', 'tool_b'),
    ],
  }), {}, now)

  assert.equal(result.approvingAll, true)
  assert.deepEqual(result.approvedToolNames.sort(), ['tool_a', 'tool_b'])
  assert.deepEqual(result.pendingApprovals.map((item) => item.status), ['approved', 'approved'])
})

test('rejectRunInteraction rejects selected pending approvals only', () => {
  const result = rejectRunInteraction(buildRun({
    pendingApprovals: [
      approval('approval_1', 'tool_a'),
      approval('approval_2', 'tool_b', 'approved'),
      approval('approval_3', 'tool_c'),
    ],
  }), { approvalIds: ['approval_1', 'approval_2'] }, now)

  assert.equal(result.rejectingAll, false)
  assert.deepEqual(result.rejectedToolNames, ['tool_a'])
  assert.equal(result.pendingApprovals[0]?.status, 'rejected')
  assert.equal(result.pendingApprovals[1]?.status, 'approved')
  assert.equal(result.pendingApprovals[2]?.status, 'pending')
})

test('applyRejectedRunInteraction completes the run with a warning and assistant message', () => {
  const run = buildRun({
    warnings: ['existing warning'],
    pendingApprovals: [approval('approval_1', 'tool_a')],
  })
  const rejected = rejectRunInteraction(run, {}, now)
  const warning = rejectedRunInteractionWarning(rejected)

  applyRejectedRunInteraction(run, rejected, {
    now,
    assistantMessageId: 'msg_1',
    warning,
  })

  assert.equal(warning, '用户拒绝执行工具：tool_a')
  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(run.completedAt, now)
  assert.equal(run.updatedAt, now)
  assert.equal(run.assistantMessageId, 'msg_1')
  assert.deepEqual(run.warnings, ['existing warning', '用户拒绝执行工具：tool_a'])
  assert.equal(run.pendingApprovals?.[0]?.status, 'rejected')
})

test('answerRunInputInteraction answers a selected request with valid choices and text', () => {
  const request = inputRequest('input_1')
  const result = answerRunInputInteraction(buildRun({ pendingInputRequests: [request] }), {
    requestId: 'input_1',
    choiceIds: ['script', 'missing'],
    text: '补充说明',
  }, now)

  assert.equal(result.request.id, 'input_1')
  assert.deepEqual(result.choiceIds, ['script'])
  assert.equal(result.text, '补充说明')
  assert.equal(result.pendingInputRequests[0]?.status, 'answered')
  assert.deepEqual(result.pendingInputRequests[0]?.answer, { choiceIds: ['script'], text: '补充说明' })
})

test('applyAnsweredRunInputInteraction queues the run with answered input requests', () => {
  const run = buildRun({ pendingInputRequests: [inputRequest('input_1')] })
  const answered = answerRunInputInteraction(run, { requestId: 'input_1', text: '继续' }, now)

  applyAnsweredRunInputInteraction(run, answered, now)

  assert.equal(run.status, 'queued')
  assert.equal(run.updatedAt, now)
  assert.equal(run.pendingInputRequests?.[0]?.status, 'answered')
  assert.deepEqual(run.pendingInputRequests?.[0]?.answer, { text: '继续' })
})

test('answerRunInputInteraction rejects empty answers', () => {
  assert.throws(
    () => answerRunInputInteraction(buildRun({ pendingInputRequests: [inputRequest('input_1')] }), { choiceIds: ['missing'] }, now),
    /input answer requires choiceIds or text/,
  )
})

test('cancelPendingRunInteractions rejects pending approvals and cancels pending input requests', () => {
  const result = cancelPendingRunInteractions(buildRun({
    pendingApprovals: [approval('approval_1', 'tool_a'), approval('approval_2', 'tool_b', 'approved')],
    pendingInputRequests: [inputRequest('input_1'), { ...inputRequest('input_2'), status: 'answered' }],
  }), now)

  assert.deepEqual(result.pendingApprovals.map((item) => item.status), ['rejected', 'approved'])
  assert.deepEqual(result.pendingInputRequests.map((item) => item.status), ['cancelled', 'answered'])
})

test('mergePendingApprovals updates pending approvals by tool and drops resolved history', () => {
  const merged = mergePendingApprovals([
    approval('approval_old', 'tool_a'),
    approval('approval_resolved', 'tool_b', 'approved'),
  ], [
    { ...approval('approval_next', 'tool_a'), args: { value: 'next' }, reason: 'Updated reason' },
    approval('approval_new', 'tool_c'),
  ], now)

  assert.deepEqual(merged.map((item) => item.id), ['approval_old', 'approval_new'])
  assert.deepEqual(merged[0]?.args, { value: 'next' })
  assert.equal(merged[0]?.reason, 'Updated reason')
  assert.equal(merged[0]?.updatedAt, now)
})

test('mergePendingInputRequests updates matching pending requests and preserves resolved history', () => {
  const merged = mergePendingInputRequests([
    { ...inputRequest('answered'), status: 'answered', title: 'Old', question: 'Old?' },
    { ...inputRequest('pending'), title: 'Target', question: 'Choose?' },
  ], [
    {
      ...inputRequest('next'),
      title: 'Target',
      question: 'Choose?',
      summary: 'Updated summary',
      choices: [{ id: 'b', label: 'B' }],
    },
  ], now)

  assert.equal(merged.length, 2)
  assert.equal(merged[0]?.id, 'answered')
  assert.equal(merged[1]?.id, 'pending')
  assert.equal(merged[1]?.summary, 'Updated summary')
  assert.deepEqual(merged[1]?.choices, [{ id: 'b', label: 'B' }])
  assert.equal(merged[1]?.updatedAt, now)
})

test('applyRequiredRunAction merges pending interactions and blocks the run', () => {
  const run = buildRun({
    pendingApprovals: [approval('approval_old', 'tool_a')],
    pendingInputRequests: [{ ...inputRequest('answered'), status: 'answered' }],
  })

  const result = applyRequiredRunAction(run, {
    pendingApprovals: [{ ...approval('approval_new', 'tool_a'), reason: 'Updated reason' }, approval('approval_2', 'tool_b')],
    pendingInputRequests: [inputRequest('input_1')],
    warnings: ['watch out'],
    now,
  })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.updatedAt, now)
  assert.deepEqual(run.warnings, ['watch out'])
  assert.deepEqual(run.pendingApprovals?.map((item) => item.id), ['approval_old', 'approval_2'])
  assert.equal(run.pendingApprovals?.[0]?.reason, 'Updated reason')
  assert.deepEqual(run.pendingInputRequests?.map((item) => item.id), ['answered', 'input_1'])
  assert.equal(result.pendingInputCount, 1)
})

test('formatInputAnswerMessage renders selected labels and free text', () => {
  assert.equal(formatInputAnswerMessage(inputRequest('input_1'), ['script'], '补充说明'), [
    '[用户补充信息]',
    '标题：选择目标内容',
    '简介：选择一个上下文目标',
    '问题：请选择',
    '选择：',
    '- 剧本：当前剧本',
    '输入：补充说明',
  ].join('\n'))
})

function buildRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-16T11:00:00.000Z',
    updatedAt: '2026-05-16T11:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function approval(id: string, toolName: string, status: 'pending' | 'approved' | 'rejected' = 'pending') {
  return {
    id,
    runId: 'run_1',
    toolName,
    reason: 'Needs approval',
    status,
    createdAt: '2026-05-16T11:00:00.000Z',
    updatedAt: '2026-05-16T11:00:00.000Z',
  }
}

function inputRequest(id: string): AgentInputRequest {
  return {
    id,
    runId: 'run_1',
    title: '选择目标内容',
    summary: '选择一个上下文目标',
    question: '请选择',
    inputType: 'choice',
    choices: [{ id: 'script', label: '剧本', description: '当前剧本' }],
    allowCustomAnswer: true,
    status: 'pending',
    createdAt: '2026-05-16T11:00:00.000Z',
    updatedAt: '2026-05-16T11:00:00.000Z',
  }
}

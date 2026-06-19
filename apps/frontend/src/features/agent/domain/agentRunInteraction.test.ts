import assert from 'node:assert/strict'
import test from 'node:test'

import {
  firstPendingInputRequest,
  formatInputAnswerForChat,
  isRunInteractionAnswerEchoMessage,
  optimisticApprovalRun,
  optimisticInputAnswerRun,
  runHasRunInteraction,
  upsertInteractionRunSnapshot,
  runInteractionAnswerEchoesForMessages,
  interactionRunsForChat,
  runInteractionFromActivity,
} from '@/features/agent/domain/agentRunInteraction'
import type { AgentRun } from '@movscript/core/agent/protocol'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

test('optimisticApprovalRun updates targeted pending approvals only', () => {
  const run = makeRun({
    pendingApprovals: [
      approval('approval_1', 'pending'),
      approval('approval_2', 'pending'),
    ],
  })

  const next = optimisticApprovalRun(run, ['approval_2'], 'approved')

  assert.equal(next.pendingApprovals?.[0]?.status, 'pending')
  assert.equal(next.pendingApprovals?.[1]?.status, 'approved')
  assert.ok(next.pendingApprovals?.[1]?.approvedAt)
})

test('optimisticInputAnswerRun answers only the requested pending input', () => {
  const run = makeRun({
    pendingInputRequests: [
      inputRequest('input_1', 'pending'),
      inputRequest('input_2', 'pending'),
    ],
  })

  const next = optimisticInputAnswerRun(run, 'input_1', { choiceIds: ['a'], text: 'More' })

  assert.equal(next.pendingInputRequests?.[0]?.status, 'answered')
  assert.deepEqual(next.pendingInputRequests?.[0]?.answer, { choiceIds: ['a'], text: 'More' })
  assert.equal(next.pendingInputRequests?.[1]?.status, 'pending')
})

test('run interaction echo helpers hide user answer echoes restored from run activity', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '[用户补充信息]\n标题：选择方向\n问题：Pick\n选择：\n- A',
    timestamp: 1,
  }
  const echoes = runInteractionAnswerEchoesForMessages([], [], [answeredInputActivity()])

  assert.equal(isRunInteractionAnswerEchoMessage(message, echoes), true)
})

test('run interaction echo helpers hide accepted active run input answer echoes', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好',
    timestamp: 1,
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: 'msg_echo', runId: 'run_1' },
      providerSessionInput: { threadId: 'thread_1', messageId: 'msg_echo', runId: 'run_1', deliveryStatus: 'accepted' },
    },
  }
  const echoes = new Set([message.content.trim()])

  assert.equal(isRunInteractionAnswerEchoMessage(message, echoes), true)
})

test('run interaction echo helpers hide local input answer workspaces before echoes hydrate', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好',
    timestamp: 1,
    meta: {
      providerSessionInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
    },
  }

  assert.equal(isRunInteractionAnswerEchoMessage(message, new Set()), true)
})

test('run interaction echo helpers keep hiding provider answer echoes', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '回答：选择方向\n选择：A',
    timestamp: 1,
  }
  const echoes = runInteractionAnswerEchoesForMessages([], [], [answeredInputActivity()])

  assert.equal(isRunInteractionAnswerEchoMessage(message, echoes), true)
})

test('runInteractionFromActivity rebuilds actionable input and approval state', () => {
  const run = runInteractionFromActivity({
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    approvals: [approval('approval_1', 'pending')],
    inputs: [inputRequest('input_1', 'pending')],
    steps: [],
    events: [],
  })

  assert.equal(run?.status, 'requires_action')
  assert.equal(run?.pendingApprovals?.[0]?.id, 'approval_1')
  assert.equal(firstPendingInputRequest(run)?.id, 'input_1')
})

test('upsertInteractionRunSnapshot keeps distinct run snapshots without dropping history', () => {
  const current = Array.from({ length: 8 }, (_, index) => makeRun({ id: `run_${index + 1}` }))
  const next = upsertInteractionRunSnapshot(current, makeRun({ id: 'run_9' }))

  assert.deepEqual(next.map((run) => run.id), ['run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7', 'run_8', 'run_9'])
})

test('runHasRunInteraction recognizes pending and resolved user interactions only', () => {
  assert.equal(runHasRunInteraction(makeRun()), false)
  assert.equal(runHasRunInteraction(makeRun({ pendingApprovals: [approval('approval_1', 'approved')] })), true)
  assert.equal(runHasRunInteraction(makeRun({ pendingInputRequests: [inputRequest('input_1', 'answered')] })), true)
})

test('interactionRunsForChat appends all actionable runs without duplicating submitted snapshots', () => {
  const submitted = [makeRun({ id: 'run_1' })]
  const next = interactionRunsForChat(submitted, [
    makeRun({ id: 'run_1' }),
    makeRun({ id: 'run_2' }),
    makeRun({ id: 'run_3' }),
  ])

  assert.deepEqual(next.map((run) => run.id), ['run_1', 'run_2', 'run_3'])
})

test('formatInputAnswerForChat renders selected choices and custom text', () => {
  assert.equal(
    formatInputAnswerForChat(inputRequest('input_1', 'pending'), { choiceIds: ['a'], text: '补充说明' }),
    '[用户补充信息]\n标题：选择方向\n问题：Pick\n选择：\n- A\n输入：补充说明',
  )
})

function answeredInputActivity(): ChatRunActivity {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    inputs: [{
      id: 'input_1',
      runId: 'run_1',
      title: '选择方向',
      question: 'Pick',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'answered',
      answer: { choiceIds: ['a'] },
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    }],
    steps: [],
    events: [],
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
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

function approval(id: string, status: 'pending' | 'approved' | 'rejected') {
  return {
    id,
    runId: 'run_1',
    toolName: 'movscript_test_tool',
    reason: 'Needs confirmation',
    status,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}

function inputRequest(id: string, status: 'pending' | 'answered' | 'cancelled') {
  return {
    id,
    runId: 'run_1',
    title: '选择方向',
    question: 'Pick',
    inputType: 'choice' as const,
    choices: [{ id: 'a', label: 'A' }],
    allowCustomAnswer: false,
    status,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}

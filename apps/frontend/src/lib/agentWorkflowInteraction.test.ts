import assert from 'node:assert/strict'
import test from 'node:test'

import {
  firstPendingInputRequest,
  formatInputAnswerForChat,
  isWorkflowAnswerEchoMessage,
  optimisticApprovalRun,
  optimisticInputAnswerRun,
  upsertWorkflowRunSnapshot,
  workflowAnswerEchoesForMessages,
  workflowRunFromActivity,
} from './agentWorkflowInteraction'
import type { AgentRun } from './localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

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

test('workflow echo helpers hide user answer echoes restored from run activity', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '[用户补充信息]\n标题：选择方向\n问题：Pick\n选择：\n- A',
    timestamp: 1,
  }
  const messages: ChatMessage[] = [{
    id: 'assistant_result',
    role: 'assistant',
    content: 'done',
    timestamp: 2,
    meta: {
      localRunActivity: {
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
      },
    },
  }]

  const echoes = workflowAnswerEchoesForMessages(messages, [])

  assert.equal(isWorkflowAnswerEchoMessage(message, echoes), true)
})

test('workflow echo helpers keep hiding legacy user answer echoes', () => {
  const message: ChatMessage = {
    id: 'msg_echo',
    role: 'user',
    content: '回答：选择方向\n选择：A',
    timestamp: 1,
  }
  const messages: ChatMessage[] = [messageWithAnsweredInput()]

  const echoes = workflowAnswerEchoesForMessages(messages, [])

  assert.equal(isWorkflowAnswerEchoMessage(message, echoes), true)
})

test('workflowRunFromActivity rebuilds actionable input and approval state', () => {
  const run = workflowRunFromActivity({
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

test('upsertWorkflowRunSnapshot keeps the latest eight distinct run snapshots', () => {
  const current = Array.from({ length: 8 }, (_, index) => makeRun({ id: `run_${index + 1}` }))
  const next = upsertWorkflowRunSnapshot(current, makeRun({ id: 'run_9' }))

  assert.deepEqual(next.map((run) => run.id), ['run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7', 'run_8', 'run_9'])
})

test('formatInputAnswerForChat renders selected choices and custom text', () => {
  assert.equal(
    formatInputAnswerForChat(inputRequest('input_1', 'pending'), { choiceIds: ['a'], text: '补充说明' }),
    '[用户补充信息]\n标题：选择方向\n问题：Pick\n选择：\n- A\n输入：补充说明',
  )
})

function messageWithAnsweredInput(): ChatMessage {
  return {
    id: 'assistant_result',
    role: 'assistant',
    content: 'done',
    timestamp: 2,
    meta: {
      localRunActivity: {
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
      },
    },
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
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

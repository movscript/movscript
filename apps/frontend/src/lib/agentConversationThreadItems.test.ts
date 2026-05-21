import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentConversationMessageItems } from './agentConversationThreadItems'
import type { AgentRun } from './localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

test('buildAgentConversationMessageItems filters workflow answer echoes', () => {
  const items = buildAgentConversationMessageItems({
    messages: [
      message({ id: 'echo', role: 'user', content: '回答：选择方向\n选择：A' }),
      message({ id: 'assistant', role: 'assistant', content: 'done' }),
    ],
    workflowAnswerEchoes: new Set(['回答：选择方向\n选择：A']),
    workflowRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.map((item) => item.message.id), ['assistant'])
})

test('buildAgentConversationMessageItems prefers live workflow runs before result messages', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentConversationMessageItems({
    messages: [message({ id: 'assistant', role: 'assistant', content: 'done' })],
    workflowAnswerEchoes: new Set(),
    workflowRunsByResultMessageId: new Map([['assistant', [liveRun]]]),
  })

  assert.equal(items[0]?.liveWorkflowRuns?.[0]?.id, 'run_live')
  assert.equal(items[0]?.beforeMessageWorkflowRuns[0]?.id, 'run_live')
})

test('buildAgentConversationMessageItems hides historical requires-action assistant summaries', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        localRunActivity: {
          runId: 'run_history',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_history',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    workflowAnswerEchoes: new Set(),
    workflowRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.liveWorkflowRuns, null)
  assert.equal(items[0]?.beforeMessageWorkflowRuns[0]?.id, 'run_history')
  assert.equal(items[0]?.showMessage, false)
})

test('buildAgentConversationMessageItems hides synthetic requires-action assistant placeholders', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action' },
        localRunActivity: {
          runId: 'run_requires_action',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_requires_action',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    workflowAnswerEchoes: new Set(),
    workflowRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.beforeMessageWorkflowRuns[0]?.id, 'run_requires_action')
  assert.equal(items[0]?.showMessage, false)
})

test('buildAgentConversationMessageItems keeps substantive assistant content for requires-action runs', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '我已经整理好生成参数，确认后会继续。',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action', messageId: 'msg_assistant' },
        localRunActivity: {
          runId: 'run_requires_action',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_requires_action',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    workflowAnswerEchoes: new Set(),
    workflowRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.showMessage, true)
})

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
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

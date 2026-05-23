import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWorkflowRunsByResultMessageId } from './useAgentChatWorkflowState'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

test('buildWorkflowRunsByResultMessageId maps active non-terminal runs so they do not fall through as orphan workflow cards', () => {
  const activeRun = run({ id: 'run_active', status: 'requires_action' })
  const result = buildWorkflowRunsByResultMessageId({
    messages: [messageWithRun('assistant_active', 'run_active')],
    workflowRuns: [activeRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_active'])
  assert.equal(result.get('assistant_active')?.[0]?.id, 'run_active')
})

test('buildWorkflowRunsByResultMessageId keeps terminal active runs as historical workflow cards', () => {
  const activeRun = run({ id: 'run_done', status: 'completed' })
  const result = buildWorkflowRunsByResultMessageId({
    messages: [messageWithRun('assistant_done', 'run_done')],
    workflowRuns: [activeRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_done'])
  assert.equal(result.get('assistant_done')?.[0]?.id, 'run_done')
})

test('buildWorkflowRunsByResultMessageId keeps non-active workflow runs before result messages', () => {
  const activeRun = run({ id: 'run_active', status: 'requires_action' })
  const otherRun = run({ id: 'run_other', status: 'requires_action' })
  const result = buildWorkflowRunsByResultMessageId({
    messages: [messageWithRun('assistant_other', 'run_other')],
    workflowRuns: [activeRun, otherRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_other'])
  assert.equal(result.get('assistant_other')?.[0]?.id, 'run_other')
})

function messageWithRun(id: string, runId: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'Waiting for input',
    timestamp: 1,
    meta: {
      localRunActivity: {
        runId,
        threadId: 'thread_1',
        status: 'requires_action',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        inputs: [{
          id: 'input_1',
          runId,
          title: '需要补充信息',
          question: '请补充约束',
          inputType: 'text',
          choices: [],
          allowCustomAnswer: true,
          status: 'pending',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        }],
        steps: [],
        events: [],
      },
    },
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
    pendingInputRequests: [{
      id: 'input_1',
      runId: overrides.id ?? 'run_1',
      title: '需要补充信息',
      question: '请补充约束',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
    ...overrides,
  }
}

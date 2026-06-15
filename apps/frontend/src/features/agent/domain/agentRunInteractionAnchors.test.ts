import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildInteractionRunsByResultMessageId,
  runInteractionDisplayAnchorPlacementForMessage,
  runInteractionPlacementForMessage,
} from './agentRunInteractionAnchors'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildInteractionRunsByResultMessageId maps active non-terminal runs so they do not fall through as orphan run interaction cards', () => {
  const activeRun = run({ id: 'run_active', status: 'requires_action' })
  const result = buildInteractionRunsByResultMessageId({
    messages: [messageWithRun('assistant_active', 'run_active')],
    interactionRuns: [activeRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_active'])
  assert.equal(result.get('assistant_active')?.[0]?.id, 'run_active')
})

test('buildInteractionRunsByResultMessageId keeps terminal active runs as historical run interaction cards', () => {
  const activeRun = run({ id: 'run_done', status: 'completed' })
  const result = buildInteractionRunsByResultMessageId({
    messages: [messageWithRun('assistant_done', 'run_done')],
    interactionRuns: [activeRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_done'])
  assert.equal(result.get('assistant_done')?.[0]?.id, 'run_done')
})

test('buildInteractionRunsByResultMessageId keeps non-active run interaction runs before result messages', () => {
  const activeRun = run({ id: 'run_active', status: 'requires_action' })
  const otherRun = run({ id: 'run_other', status: 'requires_action' })
  const result = buildInteractionRunsByResultMessageId({
    messages: [messageWithRun('assistant_other', 'run_other')],
    interactionRuns: [activeRun, otherRun],
  })

  assert.deepEqual([...result.keys()], ['assistant_other'])
  assert.equal(result.get('assistant_other')?.[0]?.id, 'run_other')
})

test('buildInteractionRunsByResultMessageId falls back to the source user message when a run has no assistant anchor', () => {
  const approvalRun = run({
    id: 'run_needs_action',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Start work',
      sourceMessageId: 'trigger',
      executionMode: 'chat',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
  })
  const result = buildInteractionRunsByResultMessageId({
    messages: [{
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      timestamp: 1,
      meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_needs_action' } },
    }],
    interactionRuns: [approvalRun],
  })

  assert.deepEqual([...result.keys()], ['trigger'])
  assert.equal(result.get('trigger')?.[0]?.id, 'run_needs_action')
})

test('buildInteractionRunsByResultMessageId resolves provider-session message ids for source fallback', () => {
  const approvalRun = run({
    id: 'run_needs_action',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Start work',
      sourceMessageId: 'runtime_msg_user',
      executionMode: 'chat',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
  })
  const result = buildInteractionRunsByResultMessageId({
    messages: [{
      id: 'runtime:runtime_msg_user',
      role: 'user',
      content: 'Start work',
      timestamp: 1,
      meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'runtime_msg_user', runId: 'run_needs_action' } },
    }],
    interactionRuns: [approvalRun],
  })

  assert.deepEqual([...result.keys()], ['runtime:runtime_msg_user'])
  assert.equal(result.get('runtime:runtime_msg_user')?.[0]?.id, 'run_needs_action')
})

test('buildInteractionRunsByResultMessageId prefers approval display anchors over run source message fallback', () => {
  const approvalRun = run({
    id: 'run_worker',
    threadId: 'thread_worker',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Worker task',
      sourceMessageId: 'worker_source',
      executionMode: 'worker',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_worker',
      displayThreadId: 'thread_root',
      displayAnchor: {
        threadId: 'thread_root',
        messageId: 'root_user',
        runId: 'run_worker',
        placement: 'after',
        reason: 'run_source_message',
      },
      toolName: 'generation_job_create',
      reason: 'Needs approval',
      status: 'pending',
      createdAt: '2026-05-19T00:00:01.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    }],
  })
  const result = buildInteractionRunsByResultMessageId({
    messages: [
      { id: 'root_user', role: 'user', content: 'Start', timestamp: 1 },
      { id: 'worker_source', role: 'user', content: 'Worker source', timestamp: 2 },
    ],
    interactionRuns: [approvalRun],
  })

  assert.deepEqual([...result.keys()], ['root_user'])
  assert.equal(result.get('root_user')?.[0]?.id, 'run_worker')
})

test('buildInteractionRunsByResultMessageId uses input request display anchors', () => {
  const inputRun = run({
    id: 'run_input',
    threadId: 'thread_worker',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Worker task',
      sourceMessageId: 'worker_source',
      executionMode: 'worker',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
    pendingApprovals: [],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_input',
      displayThreadId: 'thread_root',
      displayAnchor: {
        threadId: 'thread_root',
        messageId: 'root_user',
        runId: 'run_input',
        placement: 'after',
        reason: 'run_source_message',
      },
      title: 'Need input',
      question: 'Continue?',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-19T00:00:01.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    }],
  })
  const result = buildInteractionRunsByResultMessageId({
    messages: [
      { id: 'root_user', role: 'user', content: 'Start', timestamp: 1 },
      { id: 'worker_source', role: 'user', content: 'Worker source', timestamp: 2 },
    ],
    interactionRuns: [inputRun],
  })

  assert.deepEqual([...result.keys()], ['root_user'])
  assert.equal(result.get('root_user')?.[0]?.id, 'run_input')
})

test('runInteractionDisplayAnchorPlacementForMessage resolves local and provider-session message anchors', () => {
  const approvalRun = run({
    id: 'run_approval',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_approval',
      displayAnchor: {
        threadId: 'thread_1',
        messageId: 'runtime_msg',
        runId: 'run_approval',
        placement: 'after',
        reason: 'run_source_message',
      },
      toolName: 'generation_job_create',
      reason: 'Needs approval',
      status: 'pending',
      createdAt: '2026-05-19T00:00:01.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    }],
  })
  const inputRun = run({
    id: 'run_input',
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_input',
      displayAnchor: {
        threadId: 'thread_1',
        messageId: 'local_msg',
        runId: 'run_input',
        placement: 'before',
        reason: 'run_source_message',
      },
      title: 'Need input',
      question: 'Continue?',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-19T00:00:01.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
    }],
  })
  const anchoredMessage: ChatMessage = {
    id: 'local_msg',
    role: 'assistant',
    content: 'Ready',
    timestamp: 1,
    meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'runtime_msg', runId: 'run_approval' } },
  }

  assert.equal(runInteractionDisplayAnchorPlacementForMessage(approvalRun, anchoredMessage), 'after')
  assert.equal(runInteractionDisplayAnchorPlacementForMessage(inputRun, anchoredMessage), 'before')
  assert.equal(runInteractionDisplayAnchorPlacementForMessage(inputRun, messageWithRun('other', 'run_input')), undefined)
})

test('runInteractionPlacementForMessage defaults user anchors after and assistant anchors before', () => {
  const interactionRun = run({ id: 'run_needs_action' })

  assert.equal(runInteractionPlacementForMessage(interactionRun, {
    id: 'user_message',
    role: 'user',
    content: 'Start',
    timestamp: 1,
  }), 'after')
  assert.equal(runInteractionPlacementForMessage(interactionRun, {
    id: 'assistant_message',
    role: 'assistant',
    content: 'Ready',
    timestamp: 2,
  }), 'before')
})

function messageWithRun(id: string, runId: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'Waiting for input',
    timestamp: 1,
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: id, runId },
    },
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
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

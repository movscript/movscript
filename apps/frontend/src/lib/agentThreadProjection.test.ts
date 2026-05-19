import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeProjectedRuntimeMessages, projectRuntimeThreadMessages } from './agentThreadProjection'
import type { AgentMessage, AgentRun, AgentThread } from './localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

const NOW = '2026-05-19T00:00:00.000Z'

test('projectRuntimeThreadMessages binds runtime user and assistant messages to their source run', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Create a draft', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'Draft created', runId: 'run_1', createdAt: '2026-05-19T00:00:03.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_1',
    input: { sourceMessageId: 'msg_user', userMessage: 'Create a draft' },
    assistantMessageId: 'msg_assistant',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: { fetchRunTraceEvents: async () => [] },
  })

  assert.deepEqual(messages.map((message) => message.id), ['runtime:msg_user', 'runtime:msg_assistant'])
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
    runId: 'run_1',
  })
  assert.deepEqual(messages[1].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_assistant',
    runId: 'run_1',
  })
})

test('projectRuntimeThreadMessages preserves existing local message ids for runtime-backed messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Continue', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const existing: ChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Continue',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_user' } },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: { fetchRunTraceEvents: async () => [] },
  })

  assert.equal(messages[0].id, 'local_user_message')
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
  })
})

test('projectRuntimeThreadMessages restores user attachments from runtime client input', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_user',
        role: 'user',
        content: 'Use this reference',
        createdAt: '2026-05-19T00:00:01.000Z',
        clientInput: {
          visibleMessage: 'Use this reference',
          attachments: [{
            id: 'att_1',
            name: 'reference.png',
            mimeType: 'image/png',
            size: 128,
            resourceId: 42,
          }],
        },
      }),
    ],
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    deps: { fetchRunTraceEvents: async () => [] },
  })

  assert.deepEqual(messages[0].attachments, [{
    id: 'att_1',
    name: 'reference.png',
    type: 'image',
    mimeType: 'image/png',
    size: 128,
    resourceId: 42,
  }])
})

test('projectRuntimeThreadMessages creates synthetic assistant messages for top-level runs without persisted assistant messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Use the tool', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_requires_action',
      toolName: 'movscript_test_tool',
      reason: 'needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  })
  const workerRun = makeRun({
    id: 'run_worker',
    role: 'worker',
    parentRunId: 'run_requires_action',
    status: 'completed',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [workerRun, run],
    deps: { fetchRunTraceEvents: async () => [] },
  })

  assert.deepEqual(messages.map((message) => message.id), [
    'runtime:msg_user',
    'runtime-run:run_requires_action:assistant',
  ])
  assert.equal(messages[1].role, 'assistant')
  assert.match(messages[1].content, /movscript_test_tool/)
  assert.deepEqual(messages[1].meta?.runtimeMessage, {
    threadId: 'thread_1',
    runId: 'run_requires_action',
  })
})

test('projectRuntimeThreadMessages preserves existing synthetic assistant ids by runtime run id', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Use the tool', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_requires_action',
      toolName: 'movscript_test_tool',
      reason: 'needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  })
  const existing: ChatMessage = {
    id: 'local_assistant_result',
    role: 'assistant',
    content: 'old synthetic content',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action' } },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    existingMessages: [existing],
    liveEventsByRunId: {
      run_requires_action: [{
        id: 'live_event_1',
        kind: 'runtime',
        title: 'Runtime',
        status: 'completed',
        createdAt: '2026-05-19T00:00:02.000Z',
      }],
    },
    deps: { fetchRunTraceEvents: async () => [] },
  })

  assert.equal(messages[1].id, 'local_assistant_result')
  assert.equal(messages[1].meta?.localRunActivity?.events.some((event) => event.id === 'live_event_1'), true)
})

test('mergeProjectedRuntimeMessages replaces only messages from the projected runtime thread', () => {
  const localMessage: ChatMessage = {
    id: 'local_error',
    role: 'assistant',
    content: 'local error',
    timestamp: 1,
  }
  const oldRuntimeMessage: ChatMessage = {
    id: 'old_runtime',
    role: 'assistant',
    content: 'old',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_old' } },
    timestamp: 2,
  }
  const otherRuntimeMessage: ChatMessage = {
    id: 'other_runtime',
    role: 'assistant',
    content: 'other',
    meta: { runtimeMessage: { threadId: 'thread_other', runId: 'run_other' } },
    timestamp: 3,
  }
  const projectedMessage: ChatMessage = {
    id: 'projected_runtime',
    role: 'assistant',
    content: 'projected',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_new' } },
    timestamp: 4,
  }

  const merged = mergeProjectedRuntimeMessages(
    [localMessage, oldRuntimeMessage, otherRuntimeMessage],
    [projectedMessage],
    'thread_1',
  )

  assert.deepEqual(merged.map((message) => message.id), ['local_error', 'other_runtime', 'projected_runtime'])
})

function makeThread(input: { messages: AgentMessage[] }): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    messages: input.messages,
  }
}

function makeMessage(input: Pick<AgentMessage, 'id' | 'role' | 'content' | 'createdAt'> & { runId?: string; clientInput?: unknown }): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    createdAt: input.createdAt,
  }
}

function makeRun(input: Partial<AgentRun> & { id: string }): AgentRun {
  return {
    ...input,
    id: input.id,
    threadId: 'thread_1',
    status: input.status ?? 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:02.000Z',
    updatedAt: '2026-05-19T00:00:03.000Z',
    steps: [],
  }
}

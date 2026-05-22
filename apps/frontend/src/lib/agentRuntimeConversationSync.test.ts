import assert from 'node:assert/strict'
import test from 'node:test'

import { markRuntimeMessagesRestored, mergeRuntimeThreadProjectionMessages, runtimeThreadHydrationKey } from './agentRuntimeConversationSync'
import type { ChatMessage } from '@/store/agentStore'

test('runtimeThreadHydrationKey scopes hydration by conversation and runtime thread', () => {
  assert.equal(runtimeThreadHydrationKey('conv_1', 'thread_1'), 'conv_1:thread_1')
})

test('mergeRuntimeThreadProjectionMessages replaces only messages from the projected runtime thread', () => {
  const localMessage: ChatMessage = {
    id: 'local_message',
    role: 'assistant',
    content: 'local status',
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

  const merged = mergeRuntimeThreadProjectionMessages([localMessage, oldRuntimeMessage, otherRuntimeMessage], {
    thread: { id: 'thread_1' },
    messages: [projectedMessage],
  })

  assert.deepEqual(merged.map((message) => message.id), ['local_message', 'other_runtime', 'projected_runtime'])
})

test('mergeRuntimeThreadProjectionMessages collapses duplicate projected assistant results for the same run', () => {
  const projectedMessage: ChatMessage = {
    id: 'runtime:msg_1',
    role: 'assistant',
    content: 'done',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_1' } },
    timestamp: 10,
  }
  const duplicateRunResult: ChatMessage = {
    id: 'runtime-run:run_1:assistant',
    role: 'assistant',
    content: 'done',
    meta: {
      runtimeMessage: { threadId: 'thread_1', runId: 'run_1' },
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
    timestamp: 11,
  }
  const planRevisionMessage: ChatMessage = {
    id: 'runtime:plan_1',
    role: 'assistant',
    content: 'Plan updated',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'plan_1', runId: 'run_1' },
      planRevision: {
        schema: 'movscript.agent.plan-revision.v1',
        id: 'plan_revision_1',
        planId: 'plan_1',
        threadId: 'thread_1',
        runId: 'run_1',
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          runId: 'run_1',
          items: [{ step: 'Read', status: 'completed' }],
          completedCount: 1,
          totalCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    timestamp: 9,
  }

  const merged = mergeRuntimeThreadProjectionMessages([], {
    thread: { id: 'thread_1' },
    messages: [planRevisionMessage, projectedMessage, duplicateRunResult],
  })

  assert.deepEqual(merged.map((message) => message.id), ['runtime:plan_1', 'runtime:msg_1'])
  assert.equal(merged[1].meta?.localRunActivity?.runId, 'run_1')
})

test('mergeRuntimeThreadProjectionMessages keeps separate plan revisions for the same run', () => {
  const revision = (id: string): ChatMessage => ({
    id: `runtime:${id}`,
    role: 'assistant',
    content: 'Plan updated',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: id, runId: 'run_1' },
      planRevision: {
        schema: 'movscript.agent.plan-revision.v1',
        id,
        planId: 'plan_1',
        threadId: 'thread_1',
        runId: 'run_1',
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          runId: 'run_1',
          items: [{ step: id, status: 'completed' }],
          completedCount: 1,
          totalCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    timestamp: id === 'plan_revision_1' ? 1 : 2,
  })

  const merged = mergeRuntimeThreadProjectionMessages([], {
    thread: { id: 'thread_1' },
    messages: [revision('plan_revision_1'), revision('plan_revision_2')],
  })

  assert.deepEqual(merged.map((message) => message.id), ['runtime:plan_revision_1', 'runtime:plan_revision_2'])
})

test('markRuntimeMessagesRestored prepends restore context without dropping existing metadata', () => {
  const messages: ChatMessage[] = [{
    id: 'runtime_user',
    role: 'user',
    content: 'Continue',
    timestamp: 1,
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1' },
      contextLabels: ['Existing'],
    },
  }]

  const restored = markRuntimeMessagesRestored(messages, 'Restored')

  assert.deepEqual(restored[0].meta?.contextLabels, ['Restored', 'Existing'])
  assert.deepEqual(restored[0].meta?.runtimeMessage, { threadId: 'thread_1', messageId: 'msg_1' })
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { runtimeThreadSummaryFromThread } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import type { AgentThread } from '@/shared/infrastructure/localAgentClient'

test('runtime thread cache summaries count only visible transcript messages', () => {
  const summary = runtimeThreadSummaryFromThread({
    id: 'thread_1',
    archived: false,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:04.000Z',
    messages: [
      {
        id: 'user_1',
        threadId: 'thread_1',
        role: 'user',
        content: 'Start',
        createdAt: '2026-05-19T00:00:01.000Z',
      },
      {
        id: 'status_1',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Generating image',
        metadata: { kind: 'runtime_status', promptHistory: 'exclude' },
        createdAt: '2026-05-19T00:00:02.000Z',
      },
      {
        id: 'assistant_1',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Done',
        createdAt: '2026-05-19T00:00:03.000Z',
      },
      {
        id: 'plan_1',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Plan updated',
        metadata: { kind: 'plan_revision', promptHistory: 'exclude' },
        createdAt: '2026-05-19T00:00:04.000Z',
      },
    ],
  } as AgentThread)

  assert.equal(summary.messageCount, 2)
  assert.equal(summary.lastMessageAt, '2026-05-19T00:00:03.000Z')
})

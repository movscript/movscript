import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeVisibleActivityEvents } from '@/features/agent/presentation/agentLiveRunActivity'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('mergeVisibleActivityEvents keeps pending http events before live provider-session events without duplicates', () => {
  const http: ChatRunActivityEvent = {
    id: 'http-request-1',
    kind: 'provider_session',
    title: 'HTTP',
    status: 'started',
    createdAt: '2026-05-19T00:00:00.000Z',
  }
  const live: ChatRunActivityEvent = {
    ...http,
    status: 'completed',
    completedAt: '2026-05-19T00:00:01.000Z',
  }
  const providerSession: ChatRunActivityEvent = {
    id: 'trace_1',
    kind: 'tool_call',
    title: 'Tool',
    status: 'started',
    createdAt: '2026-05-19T00:00:02.000Z',
  }

  const merged = mergeVisibleActivityEvents([live, providerSession], [http])

  assert.deepEqual(merged.map((event) => `${event.id}:${event.status}`), ['http-request-1:completed', 'trace_1:started'])
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  contextDiagnosticFromTimelineItem,
  latestContextDiagnosticTimelineItem,
} from '@/features/agent/components/ContextDiagnosticDialog'
import type { AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

test('context diagnostic dialog accepts only debug-panel diagnostic timeline items', () => {
  assert.equal(contextDiagnosticFromTimelineItem(item()), diagnostic)
  assert.equal(contextDiagnosticFromTimelineItem(item({ purpose: 'status', surface: 'status_strip' })), undefined)
  assert.equal(contextDiagnosticFromTimelineItem(item({ contentPromptEligibility: 'include' })), undefined)
  assert.equal(contextDiagnosticFromTimelineItem(item({ origin: 'agent', purpose: 'transcript', surface: 'message_stream' })), undefined)
})

test('context diagnostic dialog opens the latest diagnostic item', () => {
  const latest = latestContextDiagnosticTimelineItem([
    item({ id: 'older', revision: 10 }),
    item({ id: 'status', purpose: 'status', surface: 'status_strip', revision: 30 }),
    item({ id: 'newer', revision: 20 }),
  ])

  assert.equal(latest?.id, 'newer')
})

const diagnostic = {
  schema: 'movscript.local_context_diagnostic.v1',
  modelGatewayCalled: false,
  messages: [],
  debugParts: [],
  tools: {
    available: [],
    blocked: [],
    discoveredCount: 0,
    modelTools: [],
  },
  skills: [],
  warnings: [],
} satisfies NonNullable<AgentTimelineItem['meta']>['contextDiagnostic']

function item(patch: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
  const id = patch.id ?? 'diagnostic_1'
  const createdAt = patch.createdAt ?? '2026-05-19T00:00:01.000Z'
  return {
    id,
    threadId: 'thread_1',
    origin: 'provider_session',
    purpose: 'diagnostic',
    surface: 'debug_panel',
    contentPromptEligibility: 'exclude',
    sortRank: 90,
    content: '',
    meta: { contextDiagnostic: diagnostic },
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    cursor: `1:${encodeURIComponent(id)}`,
    providerSessionRefs: { threadId: 'thread_1' },
    ...patch,
  }
}

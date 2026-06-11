import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_PROTOCOL_VERSION,
  PROVIDER_SESSION_EVENT_COMPAT_SCHEMA,
  PROVIDER_SESSION_EVENT_V2_SCHEMA,
} from '@movscript/core/agent/protocol'
import { parseProviderSessionEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEvent'

function eventPayload(schema: string): string {
  return JSON.stringify({
    schema,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_1',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-06-06T00:00:00.000Z',
    kind: 'scope.done',
  })
}

test('parseProviderSessionEvent accepts provider-session schema and runtime compatibility schema only', () => {
  assert.equal(parseProviderSessionEvent(eventPayload(PROVIDER_SESSION_EVENT_V2_SCHEMA))?.schema, PROVIDER_SESSION_EVENT_V2_SCHEMA)
  assert.equal(parseProviderSessionEvent(eventPayload(PROVIDER_SESSION_EVENT_COMPAT_SCHEMA))?.schema, PROVIDER_SESSION_EVENT_COMPAT_SCHEMA)
  assert.equal(parseProviderSessionEvent(eventPayload('movscript.agent.unknown-event.v2')), undefined)
})

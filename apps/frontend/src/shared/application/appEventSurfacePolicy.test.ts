import test from 'node:test'
import assert from 'node:assert/strict'

import { appEventMatchesSurfacePolicy } from './appEventSurfacePolicy'
import type { AppEvent } from './appEvents'

test('surface policies ignore self events and undeclared topics', () => {
  const policy = {
    surfaceId: 'agent-content:42',
    topics: ['semantic-entity.mutation', 'script.mutation'] as const,
    scopes: [{ kind: 'project' as const, id: '42' }],
    origins: ['agent-mcp', 'system'],
  }

  assert.equal(appEventMatchesSurfacePolicy(event({
    topic: 'semantic-entity.mutation',
    scope: { kind: 'project', id: '42' },
    surfaceId: 'agent-content:42',
    payload: { origin: 'agent-mcp' },
  }), policy), false)

  assert.equal(appEventMatchesSurfacePolicy(event({
    topic: 'canvas.mutation',
    scope: { kind: 'project', id: '42' },
    surfaceId: 'canvas-page:12',
    payload: { origin: 'agent-mcp' },
  }), policy), false)

  assert.equal(appEventMatchesSurfacePolicy(event({
    topic: 'semantic-entity.mutation',
    scope: { kind: 'project', id: '42' },
    surfaceId: 'mcp:writer',
    payload: { origin: 'user' },
  }), policy), false)

  assert.equal(appEventMatchesSurfacePolicy(event({
    topic: 'semantic-entity.mutation',
    scope: { kind: 'project', id: '42' },
    surfaceId: 'mcp:writer',
    payload: { origin: 'agent-mcp' },
  }), policy), true)
})

function event(patch: Partial<AppEvent>): AppEvent {
  return {
    id: 'event-test',
    topic: 'project.session.changed',
    scope: { kind: 'global' },
    source: 'test',
    emittedAt: '2026-06-18T00:00:00.000Z',
    payload: {},
    ...patch,
  } as AppEvent
}

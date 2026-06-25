import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appEventMatchesScope,
  appEventIsExternalToSurface,
  projectAppEventScope,
  publishAppEvent,
  recentAppEventSnapshots,
  resetAppEventDedupeForTests,
  subscribeAppEvents,
  type AppEvent,
} from './appEvents'

test('app events publish typed envelopes with scope filtering', () => {
  resetAppEventDedupeForTests()
  const events: AppEvent[] = []
  const unsubscribe = subscribeAppEvents((event) => events.push(event), (event) => appEventMatchesScope(event, { kind: 'project', id: '42' }))

  assert.equal(publishAppEvent({
    id: 'project-session-test',
    topic: 'project.session.changed',
    scope: projectAppEventScope(42),
    source: 'test',
    emittedAt: '2026-06-18T00:00:00.000Z',
    payload: { currentProjectId: 42 },
  }), true)
  assert.equal(publishAppEvent({
    id: 'project-session-test',
    topic: 'project.session.changed',
    scope: projectAppEventScope(42),
    source: 'test',
    emittedAt: '2026-06-18T00:00:00.000Z',
    payload: { currentProjectId: 42 },
  }), false)
  assert.equal(publishAppEvent({
    id: 'project-session-other-test',
    topic: 'project.session.changed',
    scope: projectAppEventScope(43),
    source: 'test',
    payload: { currentProjectId: 43 },
  }), true)

  unsubscribe()

  assert.equal(events.length, 1)
  assert.equal(events[0]?.topic, 'project.session.changed')
  assert.equal(events[0]?.scope.id, '42')
  assert.deepEqual(recentAppEventSnapshots().map((event) => event.id), [
    'project-session-test',
    'project-session-other-test',
  ])
})

test('app event surface identity distinguishes self-originated events', () => {
  const event: AppEvent = {
    id: 'surface-event',
    topic: 'project.session.changed',
    scope: { kind: 'project', id: '42' },
    source: 'test',
    surfaceId: 'agent-content:42',
    emittedAt: '2026-06-18T00:00:00.000Z',
    payload: {},
  }

  assert.equal(appEventIsExternalToSurface(event, 'agent-content:42'), false)
  assert.equal(appEventIsExternalToSurface(event, 'project-page:42'), true)
})

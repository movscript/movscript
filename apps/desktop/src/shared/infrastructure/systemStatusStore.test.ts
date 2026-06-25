import test from 'node:test'
import assert from 'node:assert/strict'

import { resetAppEventDedupeForTests, subscribeAppEvents, type AppEvent } from '@/shared/application/appEvents'
import { useSystemStatusStore } from './systemStatusStore'

test('system status store projects backend, websocket, auth, and workspace status', () => {
  resetAppEventDedupeForTests()
  useSystemStatusStore.getState().resetSystemStatus()
  const events: AppEvent[] = []
  const unsubscribe = subscribeAppEvents((event) => {
    if (event.topic === 'system.status.changed') events.push(event)
  })

  useSystemStatusStore.getState().setBackendStatus({ state: 'ready', baseURL: 'http://localhost:8765', pid: 123 })
  useSystemStatusStore.getState().setSystemMessagesStatus({ status: 'connecting', url: 'ws://localhost/messages' })
  useSystemStatusStore.getState().markSystemMessageReceived('2026-06-18T00:00:00.000Z')
  useSystemStatusStore.getState().markAuthSessionExpired('2026-06-18T00:01:00.000Z')
  useSystemStatusStore.getState().markWorkspaceUpdated(42, '2026-06-18T00:02:00.000Z')

  unsubscribe()

  const state = useSystemStatusStore.getState()
  assert.equal(state.backend?.state, 'ready')
  assert.equal(state.backend?.pid, 123)
  assert.equal(state.systemMessages.status, 'connected')
  assert.equal(state.systemMessages.lastMessageAt, '2026-06-18T00:00:00.000Z')
  assert.equal(state.auth.sessionExpired, true)
  assert.equal(state.auth.expiredAt, '2026-06-18T00:01:00.000Z')
  assert.equal(state.workspace.projectId, 42)
  assert.equal(state.workspace.lastUpdatedAt, '2026-06-18T00:02:00.000Z')
  assert.ok(events.length >= 5)
})

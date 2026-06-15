import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeAppServerLogText } from './AgentConsoleRealtimeLogPanel'

test('app-server realtime logs strip ANSI color sequences for console display', () => {
  const raw = '\u001B[2m2026-06-07T13:15:53Z\u001B[0m \u001B[32m INFO\u001B[0m \u001B[1mapp_server.request\u001B[0m'

  assert.equal(
    sanitizeAppServerLogText(raw),
    '2026-06-07T13:15:53Z  INFO app_server.request',
  )
})

test('app-server realtime logs strip visible SGR fragments left by terminal color output', () => {
  const raw = '[3mapp_server.client_name[0m[2m=[0m"movscript-frontend" [32m INFO[0m'

  assert.equal(
    sanitizeAppServerLogText(raw),
    'app_server.client_name="movscript-frontend"  INFO',
  )
})

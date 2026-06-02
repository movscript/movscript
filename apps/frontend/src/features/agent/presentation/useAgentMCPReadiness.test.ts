import assert from 'node:assert/strict'
import test from 'node:test'

import { assertMCPStatusReady } from './useAgentMCPReadiness'

test('assertMCPStatusReady returns when MCP status is ok', async () => {
  await assertMCPStatusReady(async () => ({
    ok: true,
    listening: true,
    endpoint: 'http://127.0.0.1:18765/mcp',
  }))
})

test('assertMCPStatusReady times out instead of waiting forever', async () => {
  await assert.rejects(
    () => assertMCPStatusReady(
      () => new Promise(() => undefined),
      1,
    ),
    /MCP status check timed out after 1ms/,
  )
})

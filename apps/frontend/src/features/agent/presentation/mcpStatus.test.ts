import assert from 'node:assert/strict'
import test from 'node:test'

import { isLikelyMCPError } from './mcpStatus'

test('isLikelyMCPError recognizes MCP connection reset failures', () => {
  assert.equal(
    isLikelyMCPError('MCP request failed (initialize http://127.0.0.1:18765/mcp): fetch failed; name=TypeError, cause=read ECONNRESET code=ECONNRESET'),
    true,
  )
})

test('isLikelyMCPError ignores unrelated errors', () => {
  assert.equal(isLikelyMCPError('local agent returned 500: backend unavailable'), false)
})

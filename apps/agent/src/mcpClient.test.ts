import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPClient } from './mcpClient.js'

test('MCPClient request error includes fetch cause details', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      const error = new Error('fetch failed') as Error & { cause?: unknown }
      error.cause = {
        code: 'ECONNREFUSED',
        errno: -61,
        syscall: 'connect',
        address: '127.0.0.1',
        port: 18765,
      }
      throw error
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(
      client.initialize(),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /MCP request failed \(initialize http:\/\/127\.0\.0\.1:18765\/mcp\): fetch failed/)
        assert.match(error.message, /name=Error/)
        assert.match(error.message, /cause=code=ECONNREFUSED/)
        assert.match(error.message, /address=127\.0\.0\.1/)
        assert.match(error.message, /port=18765/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

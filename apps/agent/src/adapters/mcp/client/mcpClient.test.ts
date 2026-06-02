import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPClient } from './mcpClient.js'

function makeFetchError(code: string, message = 'fetch failed'): Error {
  const error = new Error(message) as Error & { cause?: unknown }
  error.cause = {
    code,
    errno: -54,
    syscall: 'read',
    address: '127.0.0.1',
    port: 18765,
  }
  return error
}

function makeJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('MCPClient request error includes fetch cause details after retries are exhausted', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      throw makeFetchError('ECONNREFUSED')
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(
      client.initialize(),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /MCP request failed \(initialize http:\/\/127\.0\.0\.1:18765\/mcp requestId=1 elapsedMs=\d+\): fetch failed/)
        assert.match(error.message, /name=Error/)
        assert.match(error.message, /cause=code=ECONNREFUSED/)
        assert.match(error.message, /address=127\.0\.0\.1/)
        assert.match(error.message, /port=18765/)
        return true
      },
    )
    assert.equal(calls, 3, 'transient ECONNREFUSED should be retried twice before surfacing')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient error formatting does not trust non-plain fetch cause objects', async () => {
  class RuntimeCause {
    code = 'ECONNREFUSED'
    address = '127.0.0.1'
    port = 18765
  }

  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      const error = new Error('fetch failed') as Error & { cause?: unknown }
      error.cause = new RuntimeCause()
      throw error
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(
      client.initialize(),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /fetch failed/)
        assert.doesNotMatch(error.message, /cause=code=ECONNREFUSED/)
        assert.doesNotMatch(error.message, /address=127\.0\.0\.1/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient does not retry transient-looking non-plain fetch causes', async () => {
  class RuntimeCause {
    code = 'ECONNRESET'
  }

  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      const error = new Error('fetch failed') as Error & { cause?: unknown }
      error.cause = new RuntimeCause()
      throw error
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(client.initialize())
    assert.equal(calls, 1, 'non-plain causes must not trigger transient retry handling')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient retries transient ECONNRESET and returns the recovered response', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) throw makeFetchError('ECONNRESET')
      return makeJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'movscript-frontend-mcp', version: '0.1.0' },
          capabilities: {},
        },
      })
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    const result = await client.initialize() as { serverInfo: { name: string } }
    assert.equal(calls, 2)
    assert.equal(result.serverInfo.name, 'movscript-frontend-mcp')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient does not retry non-transient fetch errors', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      const error = new Error('unsupported protocol') as Error & { cause?: unknown }
      error.cause = { code: 'ERR_INVALID_URL' }
      throw error
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(client.initialize())
    assert.equal(calls, 1, 'non-transient fetch errors must fail fast without retries')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient does not retry after the server returns an HTTP response', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response('boom', { status: 500 })
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    await assert.rejects(
      client.initialize(),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /MCP HTTP 500 \(initialize/)
        return true
      },
    )
    assert.equal(calls, 1, 'HTTP-level failures must not be retried because the server may have produced side effects')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCPClient retries socket hang up errors recognised by message', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        const error = new Error('fetch failed') as Error & { cause?: unknown }
        error.cause = new Error('socket hang up')
        throw error
      }
      return makeJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { tools: [] },
      })
    }) as typeof fetch

    const client = new MCPClient({ endpoint: 'http://127.0.0.1:18765/mcp' })
    const tools = await client.listTools()
    assert.equal(calls, 2)
    assert.deepEqual(tools, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

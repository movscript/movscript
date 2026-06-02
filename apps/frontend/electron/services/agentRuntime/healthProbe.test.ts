import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import { getAgentRuntimeHealth } from './healthProbe'
import { createUnixSocketAgentRuntimeControlTransport } from './transport'

test('agent runtime health probe uses liveness before compatibility handshake', async () => {
  const calls: string[] = []
  const originalMcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
  const restore = mockFetch(async (url) => {
    calls.push(url)
    if (url.endsWith('/livez')) return jsonResponse({ ok: true })
    if (url.endsWith('/runtime/compat')) {
      return jsonResponse({
        ok: true,
        runtime: {
          apiVersion: 1,
          features: ['model-config', 'runtime-capabilities'],
        },
        mcpEndpoint: 'http://127.0.0.1:18765/mcp',
      })
    }
    return jsonResponse({ error: 'unexpected' }, 500)
  })

  try {
    const health = await getAgentRuntimeHealth('http://127.0.0.1:28765')

    assert.deepEqual(calls, [
      'http://127.0.0.1:28765/livez',
      'http://127.0.0.1:28765/runtime/compat',
    ])
    assert.deepEqual(health, {
      ok: true,
      compatible: true,
      apiVersion: 1,
      mcpEndpoint: 'http://127.0.0.1:18765/mcp',
    })
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', originalMcpEndpoint)
    restore()
  }
})

test('agent runtime health probe can run over a Unix socket transport', async (t) => {
  const originalMcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
  const dir = mkdtempSync(join('/private/tmp', 'movscript-agent-socket-test-'))
  const socketPath = join(dir, 'agent.sock')
  const calls: string[] = []
  const server = createServer((req, res) => {
    calls.push(req.url ?? '')
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/livez') {
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.url === '/runtime/compat') {
      res.end(JSON.stringify({
        ok: true,
        runtime: {
          apiVersion: 1,
          features: ['model-config', 'runtime-capabilities'],
        },
        mcpEndpoint: 'http://127.0.0.1:18765/mcp',
      }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('Unix socket listen is not permitted in this sandbox')
      restoreEnv('MOVSCRIPT_MCP_ENDPOINT', originalMcpEndpoint)
      rmSync(dir, { recursive: true, force: true })
      return
    }
    throw error
  }

  try {
    const health = await getAgentRuntimeHealth(createUnixSocketAgentRuntimeControlTransport(socketPath))

    assert.deepEqual(calls, ['/livez', '/runtime/compat'])
    assert.equal(health.ok, true)
    assert.equal(health.compatible, true)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', originalMcpEndpoint)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('agent runtime health probe falls back to legacy health for older runtimes', async () => {
  const calls: string[] = []
  const originalMcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
  const restore = mockFetch(async (url) => {
    calls.push(url)
    if (url.endsWith('/livez')) return jsonResponse({ error: 'missing' }, 404)
    if (url.endsWith('/health')) {
      return jsonResponse({
        ok: true,
        runtime: {
          apiVersion: 1,
          features: ['model-config', 'runtime-capabilities'],
        },
        mcpEndpoint: 'http://127.0.0.1:18765/mcp',
      })
    }
    return jsonResponse({ error: 'unexpected' }, 500)
  })

  try {
    const health = await getAgentRuntimeHealth('http://127.0.0.1:28765')

    assert.deepEqual(calls, [
      'http://127.0.0.1:28765/livez',
      'http://127.0.0.1:28765/health',
    ])
    assert.equal(health.ok, true)
    assert.equal(health.compatible, true)
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', originalMcpEndpoint)
    restore()
  }
})

function mockFetch(handler: (url: string) => Promise<Response>): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return handler(url)
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

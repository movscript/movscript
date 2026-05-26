import assert from 'node:assert/strict'
import test from 'node:test'

import { syncRuntimeModelConfig } from './runtimeChat'

test('syncRuntimeModelConfig skips saving when runtime config already matches', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/model-config' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'model-ready',
        useForChat: true,
        useForPlanner: true,
      })
    }
    if (url.pathname === '/model-config' && init?.method === 'POST') {
      return jsonResponse({ configured: true, provider: 'backend-model-config', model: 'model-ready' })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncRuntimeModelConfig('model-ready')

    assert.deepEqual(requests, ['GET /model-config'])
  })
})

test('syncRuntimeModelConfig saves when runtime config differs', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/model-config' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'other-model',
        useForChat: true,
        useForPlanner: true,
      })
    }
    if (url.pathname === '/model-config' && init?.method === 'POST') {
      return jsonResponse({ configured: true, provider: 'backend-model-config', model: 'model-different' })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncRuntimeModelConfig('model-different')

    assert.deepEqual(requests, ['GET /model-config', 'POST /model-config'])
  })
})

test('syncRuntimeModelConfig uses local cache after a successful sync', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/model-config' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'model-cache',
        useForChat: true,
        useForPlanner: true,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncRuntimeModelConfig('model-cache')
    await syncRuntimeModelConfig('model-cache')

    assert.deepEqual(requests, ['GET /model-config'])
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function withFetch(fetchImpl: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchImpl,
  })
  try {
    await fn()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    })
  }
}

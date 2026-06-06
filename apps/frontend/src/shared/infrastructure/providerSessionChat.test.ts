import assert from 'node:assert/strict'
import test from 'node:test'

import { syncProviderSessionModelConfig } from './providerSessionChat'

test('syncProviderSessionModelConfig skips saving when provider session config already matches', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(modelConfigRequest(url, init))
    if (url.pathname.endsWith('/model-config') && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'model-ready',
        useForChat: true,
        useForPlanner: true,
      })
    }
    if (url.pathname.endsWith('/model-config') && init?.method === 'POST') {
      return jsonResponse({ configured: true, provider: 'backend-model-config', model: 'model-ready' })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncProviderSessionModelConfig('model-ready')

    assert.deepEqual(requests, ['GET /model-config'])
  })
})

test('syncProviderSessionModelConfig saves when provider session config differs', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(modelConfigRequest(url, init))
    if (url.pathname.endsWith('/model-config') && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'other-model',
        useForChat: true,
        useForPlanner: true,
      })
    }
    if (url.pathname.endsWith('/model-config') && init?.method === 'POST') {
      return jsonResponse({ configured: true, provider: 'backend-model-config', model: 'model-different' })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncProviderSessionModelConfig('model-different')

    assert.deepEqual(requests, ['GET /model-config', 'POST /model-config'])
  })
})

test('syncProviderSessionModelConfig preserves saved direct provider connection mode when updating model', async () => {
  const requests: string[] = []
  let postedBody: Record<string, unknown> | undefined
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(modelConfigRequest(url, init))
    if (url.pathname.endsWith('/model-config') && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'direct-old-model',
        apiKind: 'openai_responses',
        baseURL: 'https://api.openai.com/v1',
        apiKeyConfigured: true,
        useForChat: true,
        useForPlanner: true,
      })
    }
    if (url.pathname.endsWith('/model-config') && init?.method === 'POST') {
      postedBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return jsonResponse({
        configured: true,
        provider: 'backend-model-config',
        model: 'direct-new-model',
        apiKind: 'openai_responses',
        baseURL: 'https://api.openai.com/v1',
        apiKeyConfigured: true,
        useForChat: true,
        useForPlanner: true,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await syncProviderSessionModelConfig('direct-new-model')

    assert.deepEqual(requests, ['GET /model-config', 'POST /model-config'])
    assert.deepEqual(postedBody, {
      model: 'direct-new-model',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      useForChat: true,
      useForPlanner: true,
      backendAPIBaseURL: 'http://localhost:8765/api/v1',
    })
  })
})

test('syncProviderSessionModelConfig skips duplicate saves after a successful sync', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(modelConfigRequest(url, init))
    if (url.pathname.endsWith('/model-config') && (init?.method ?? 'GET') === 'GET') {
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
    await syncProviderSessionModelConfig('model-cache')
    await syncProviderSessionModelConfig('model-cache')

    assert.deepEqual(requests, ['GET /model-config', 'GET /model-config'])
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function modelConfigRequest(url: URL, init?: RequestInit): string {
  const endpoint = url.pathname.endsWith('/model-config') ? '/model-config' : url.pathname
  return `${init?.method ?? 'GET'} ${endpoint}`
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

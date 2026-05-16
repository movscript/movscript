import assert from 'node:assert/strict'
import test from 'node:test'
import { callModel } from './modelClient.js'
import type { ConfiguredRuntimeModelConfig, RuntimeModelTraceCallback } from './modelConfig.js'

const CONFIG: ConfiguredRuntimeModelConfig = {
  provider: 'backend-model-config',
  modelConfigId: 21,
  model: 'model_config:21',
  useForChat: true,
  useForPlanner: true,
  updatedAt: new Date(0).toISOString(),
}

test('callModel retries empty assistant gateway responses with exponential backoff', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls < 3) {
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 3, initialDelayMs: 0 },
    })

    assert.equal(calls, 3)
    assert.equal(result.content, 'recovered')
    assert.equal(result.finish_reason, 'stop')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel stops retrying empty assistant responses after the configured attempts', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    await assert.rejects(
      callModel({
        config: CONFIG,
        messages: [{ role: 'user', content: 'hello' }],
        retry: { maxAttempts: 2, initialDelayMs: 0 },
      }),
      /backend model gateway returned no assistant content and no tool calls/,
    )

    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries direct HTTP 429 gateway responses with exponential backoff', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'user requests-per-minute limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }), { status: 429 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'after retry' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'after retry')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel keeps failed HTTP response bodies in trace events before retrying', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const traceEvents: Parameters<RuntimeModelTraceCallback>[0][] = []
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'user requests-per-minute limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }), {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'content-type': 'application/json', 'x-request-id': 'rate-limit-1' },
        })
      }
      return new Response(JSON.stringify({
        id: 'chatcmpl_recovered',
        choices: [{
          message: { role: 'assistant', content: 'after retry' },
          finish_reason: 'stop',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'secret-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
      onTrace: (event) => traceEvents.push(event),
    })

    const failedResponse = traceEvents.find((event) => event.phase === 'response' && event.trace.response?.status === 429)
    const failedError = traceEvents.find((event) => event.phase === 'error' && event.trace.response?.status === 429)
    const retry = traceEvents.find((event) => event.phase === 'retry')

    assert.equal(calls, 2)
    assert.equal(result.content, 'after retry')
    assert.equal(traceEvents[0]?.phase, 'request')
    assert.equal(failedResponse?.trace.request.headers.Authorization, undefined)
    assert.equal(failedResponse?.trace.response?.status, 429)
    assert.equal(failedResponse?.trace.response?.headers['x-request-id'], 'rate-limit-1')
    assert.match(failedResponse?.trace.response?.bodyText ?? '', /requests-per-minute/)
    assert.match(JSON.stringify(failedResponse?.trace.response?.parsedBody ?? {}), /rate_limit_exceeded/)
    assert.match(failedError?.error ?? '', /HTTP 429/)
    assert.match(failedError?.trace.response?.bodyText ?? '', /requests-per-minute/)
    assert.equal(retry?.retry?.nextAttempt, 2)
    assert.match(retry?.retry?.reason ?? '', /HTTP 429/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries backend 502 responses that wrap provider rate limits', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const retryEvents: Array<{ retry?: { attempt: number; nextAttempt: number; maxAttempts: number; delayMs: number; reason: string } }> = []
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'openai chat stream HTTP 429: {"error":{"message":"user requests-per-minute limit exceeded","type":"rate_limit_exceeded"}}',
            type: 'server_error',
            param: 'stream',
            code: 'provider_error',
          },
        }), { status: 502 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'provider recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
      onTrace: (event) => {
        if (event.phase === 'retry') retryEvents.push({ retry: event.retry })
      },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'provider recovered')
    assert.deepEqual(retryEvents.map((event) => event.retry?.nextAttempt), [2])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries backend 502 responses that wrap upstream rate_limit_error', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'openai chat stream HTTP 429: {"error":{"message":"Upstream rate limit exceeded, please retry later","type":"rate_limit_error","param":"","code":null}}',
            type: 'server_error',
            param: 'stream',
            code: 'provider_error',
          },
        }), { status: 502 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'upstream recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'upstream recovered')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel stops retrying rate limited gateway responses after the configured attempts', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({
        error: {
          message: 'user requests-per-minute limit exceeded',
          type: 'rate_limit_exceeded',
        },
      }), { status: 429 })
    }) as typeof fetch

    await assert.rejects(
      callModel({
        config: CONFIG,
        messages: [{ role: 'user', content: 'hello' }],
        retry: { maxAttempts: 3, initialDelayMs: 0 },
      }),
      /backend model gateway HTTP 429/,
    )

    assert.equal(calls, 3)
  } finally {
    globalThis.fetch = originalFetch
  }
})

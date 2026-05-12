import assert from 'node:assert/strict'
import test from 'node:test'
import { callModel } from './modelClient.js'
import type { ConfiguredRuntimeModelConfig } from './modelConfig.js'

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

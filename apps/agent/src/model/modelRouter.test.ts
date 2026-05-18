import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultRuntimeModelRouter, describeRuntimeModelCapabilities } from './modelRouter.js'
import type { ConfiguredRuntimeModelConfig } from './modelConfig.js'

const CONFIG: ConfiguredRuntimeModelConfig = {
  provider: 'backend-model-config',
  modelConfigId: 21,
  model: 'model_config:21',
  useForChat: true,
  useForPlanner: true,
  updatedAt: new Date(0).toISOString(),
}

test('default model router exposes reasoning, text, planning, and multimodal routes with scope-aware sources', () => {
  const routes = describeRuntimeModelCapabilities(CONFIG)

  assert.deepEqual(routes.map((route) => route.capability), ['reasoning', 'text', 'planning', 'multimodal'])
  for (const route of routes.filter((route) => route.capability !== 'planning')) {
    assert.equal(route.configured, true)
    assert.equal(route.provider, 'backend-model-config')
    assert.equal(route.modelConfigId, 21)
    assert.equal(route.model, 'model_config:21')
    assert.equal(route.source, 'chat-config-fallback')
  }
  assert.equal(routes.find((route) => route.capability === 'planning')?.configured, true)
  assert.equal(routes.find((route) => route.capability === 'planning')?.source, 'planner-config')
})

test('default model router marks all capabilities unconfigured when no backend model config exists', () => {
  const routes = describeRuntimeModelCapabilities()

  assert.deepEqual(routes.map((route) => route.capability), ['reasoning', 'text', 'planning', 'multimodal'])
  for (const route of routes) {
    assert.equal(route.configured, false)
    assert.equal(route.provider, undefined)
    assert.equal(route.modelConfigId, undefined)
    assert.equal(route.source, 'unconfigured')
  }
})

test('default model router reports disabled routes when a config is scoped away from chat or planning', () => {
  const routes = describeRuntimeModelCapabilities({
    ...CONFIG,
    useForChat: false,
    useForPlanner: true,
  })

  const reasoning = routes.find((route) => route.capability === 'reasoning')
  const planning = routes.find((route) => route.capability === 'planning')

  assert.equal(reasoning?.configured, false)
  assert.equal(reasoning?.source, 'disabled')
  assert.equal(reasoning?.modelConfigId, 21)
  assert.equal(planning?.configured, true)
  assert.equal(planning?.source, 'planner-config')
})

test('default model router calls the configured backend route for a capability', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, 'http://localhost:8765/api/v1/model-gateway/chat/completions')
      assert.equal(init?.method, 'POST')
      assert.equal(typeof init?.body, 'string')
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      assert.equal(body.model, 'model_config:21')
      assert.equal(body.stream, true)
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'reasoning ok' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const router = createDefaultRuntimeModelRouter(CONFIG)
    const result = await router.call({
      capability: 'reasoning',
      messages: [{ role: 'user', content: 'hello' }],
    })

    assert.equal(result.content, 'reasoning ok')
    assert.equal(result.finish_reason, 'stop')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('default model router rejects calls for unconfigured capabilities', async () => {
  const router = createDefaultRuntimeModelRouter()

  await assert.rejects(
    router.call({
      capability: 'text',
      messages: [{ role: 'user', content: 'hello' }],
    }),
    /no text model route configured/,
  )
})

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { buildBackendGatewayChatRequest, RuntimeModelConfigStore } from './modelConfig.js'

test('runtime model config saves only backend model config routing fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    const publicConfig = store.save({
      modelConfigId: 42,
      model: 'model_config:42',
      useForChat: true,
      useForPlanner: false,
    })
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>

    assert.equal(publicConfig.configured, true)
    assert.equal(publicConfig.provider, 'backend-model-config')
    assert.equal(publicConfig.modelConfigId, 42)
    assert.equal(publicConfig.model, 'model_config:42')
    assert.equal(publicConfig.source, 'file')
    assert.equal(raw.modelConfigId, 42)
    assert.equal(raw.model, 'model_config:42')
    assert.equal(raw.useForPlanner, false)
    assert.equal('apiKey' in raw, false)
    assert.equal('baseURL' in raw, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config keeps an existing backend model config id when saving usage changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    store.save({ modelConfigId: 7, model: 'model_config:7', useForChat: true })
    const updated = store.save({ useForPlanner: false })
    const effective = store.getEffectiveConfig()

    assert.equal(updated.configured, true)
    assert.equal(updated.modelConfigId, 7)
    assert.equal(updated.model, 'model_config:7')
    assert.equal(updated.useForPlanner, false)
    assert.equal(effective?.modelConfigId, 7)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config ignores corrupt or non-object config files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    writeFileSync(filePath, '{not-json', 'utf8')
    assert.equal(store.getEffectiveConfig(), undefined)
    assert.deepEqual(store.getPublicConfig(), {
      configured: false,
      provider: 'backend-model-config',
      model: 'movscript-default-chat',
      apiKind: 'backend_chat_completions',
      useForChat: true,
      useForPlanner: true,
      source: 'none',
    })

    writeFileSync(filePath, '["model_config:7"]', 'utf8')
    assert.equal(store.getEffectiveConfig(), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config test uses backend gateway and hides auth from the public request snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  const originalFetch = globalThis.fetch
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))
    store.save({
      modelConfigId: 9,
      model: 'model_config:9',
    })

    globalThis.fetch = (async (url, init) => {
      assert.equal(url, 'http://localhost:8765/api/v1/model-gateway/chat/completions')
      assert.equal(init?.method, 'POST')
      assert.deepEqual(init?.headers, {
        Accept: 'text/event-stream',
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/json',
      })
      assert.equal(typeof init?.body, 'string')
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      assert.equal(body.model, 'model_config:9')
      assert.equal(body.stream, true)
      assert.ok(Array.isArray(body.messages))
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'connection ok' } }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await store.test({ message: 'hello' }, { backendAuthToken: 'user-token' })

    assert.equal(result.ok, true)
    assert.equal(result.content, 'connection ok')
    assert.equal(result.modelConfigId, 9)
    assert.equal(result.request.url, 'http://localhost:8765/api/v1/model-gateway/chat/completions')
    assert.equal(result.request.method, 'POST')
    assert.equal(result.request.headers.Authorization, undefined)
    assert.equal(result.request.body.model, 'model_config:9')
    assert.equal(result.request.body.messages[1]?.content, 'hello')
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('backend gateway JSON mode request includes ASCII JSON instruction when missing', () => {
  const request = buildBackendGatewayChatRequest(
    {
      provider: 'backend-model-config',
      modelConfigId: 12,
      model: 'model_config:12',
      useForChat: true,
      useForPlanner: true,
      updatedAt: new Date(0).toISOString(),
    },
    [
      {
        role: 'system',
        content: '输出结构化对象，不要使用 markdown。',
      },
      {
        role: 'user',
        content: '分析这个剧本。',
      },
    ],
    {},
    { jsonMode: true },
  )

  assert.equal(request.body.response_format?.type, 'json_object')
  assert.equal(request.body.messages[0]?.role, 'system')
  assert.match(request.body.messages[0]?.content ?? '', /\bJSON\b/)
  assert.equal(request.body.messages[1]?.content, '输出结构化对象，不要使用 markdown。')
})

test('backend gateway JSON mode request does not duplicate an existing JSON instruction', () => {
  const request = buildBackendGatewayChatRequest(
    {
      provider: 'backend-model-config',
      modelConfigId: 12,
      model: 'model_config:12',
      useForChat: true,
      useForPlanner: true,
      updatedAt: new Date(0).toISOString(),
    },
    [
      {
        role: 'system',
        content: 'Return only valid JSON.',
      },
      {
        role: 'user',
        content: 'Analyze this script.',
      },
    ],
    {},
    { jsonMode: true },
  )

  assert.equal(request.body.messages.length, 2)
  assert.equal(request.body.messages[0]?.content, 'Return only valid JSON.')
})

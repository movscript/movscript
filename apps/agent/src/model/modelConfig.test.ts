import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { ensureJSONModeMessages, RuntimeModelConfigStore } from './modelConfig.js'

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

test('runtime model config can be saved with only public model_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    const publicConfig = store.save({
      model: 'gpt-5.5',
      useForChat: true,
      useForPlanner: true,
    })
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const effective = store.getEffectiveConfig()

    assert.equal(publicConfig.configured, true)
    assert.equal(publicConfig.modelConfigId, undefined)
    assert.equal(publicConfig.model, 'gpt-5.5')
    assert.equal(raw.modelConfigId, undefined)
    assert.equal(raw.model, 'gpt-5.5')
    assert.equal(effective?.model, 'gpt-5.5')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config can be cleared back to unconfigured state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    store.save({ model: 'gpt-5.5', useForChat: true, useForPlanner: true })
    const cleared = store.clear()

    assert.equal(cleared.configured, false)
    assert.equal(cleared.source, 'none')
    assert.equal(store.getEffectiveConfig(), undefined)
    assert.throws(() => readFileSync(filePath, 'utf8'), /ENOENT/)
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

test('runtime model config rejects configs with all routes disabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    assert.throws(
      () => store.save({
        model: 'gpt-5.5',
        useForChat: false,
        useForPlanner: false,
      }),
      /must enable at least one route/,
    )

    store.save({ model: 'gpt-5.5', useForChat: false, useForPlanner: true })
    assert.throws(
      () => store.save({ useForPlanner: false }),
      /must enable at least one route/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config rejects invalid save input field types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    assert.throws(
      () => store.save({ modelConfigId: '7' }),
      /modelConfigId must be a positive integer/,
    )
    assert.throws(
      () => store.save({ model: '' }),
      /model must be a non-empty string/,
    )
    assert.throws(
      () => store.save({ model: 'gpt-5.5', apiKind: 'responses' }),
      /apiKind is invalid/,
    )
    assert.throws(
      () => store.save({ model: 'gpt-5.5', baseURL: '' }),
      /baseURL must be a non-empty string/,
    )
    assert.throws(
      () => store.save({ model: 'gpt-5.5', useForChat: 'true' }),
      /useForChat must be boolean/,
    )
    assert.throws(
      () => store.save({ model: 'gpt-5.5', useForPlanner: 1 }),
      /useForPlanner must be boolean/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config rejects direct provider model ids with embedded secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    assert.throws(
      () => store.save({
        model: 'sk-proj-exampleSecretValue123456789',
        apiKind: 'openai_responses',
      }),
      /model must not include API keys/,
    )
    assert.throws(
      () => store.save({
        model: 'authorization: Bearer direct-secret-token',
        apiKind: 'anthropic_messages',
      }),
      /model must not include API keys/,
    )
    assert.equal(store.getEffectiveConfig(), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config rejects model base URLs with secret URL credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    assert.throws(
      () => store.save({
        model: 'gpt-5.5',
        apiKind: 'openai_responses',
        baseURL: 'https://user:pass@api.openai.com/v1',
      }),
      /baseURL must not include secret URL credentials/,
    )
    assert.throws(
      () => store.save({
        model: 'gpt-5.5',
        apiKind: 'openai_responses',
        baseURL: 'https://api.openai.com/v1?api_key=secret',
      }),
      /baseURL must not include secret URL credentials/,
    )
    assert.equal(store.getEffectiveConfig(), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config clears base URL when saving a full config without one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
    })
    const clearedByOmission = store.save({
      model: 'gpt-5.5-mini',
      apiKind: 'openai_responses',
    })

    assert.equal(clearedByOmission.baseURL, undefined)

    store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
    })
    const clearedByNull = store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: null,
    })

    assert.equal(clearedByNull.baseURL, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config preserves base URL when only route flags change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
    })
    const updated = store.save({ useForPlanner: false })

    assert.equal(updated.baseURL, 'https://api.openai.com/v1')
    assert.equal(updated.useForPlanner, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config clears backend model config id when switching to a direct model id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    store.save({ modelConfigId: 7, model: 'model_config:7', useForChat: true })
    const updated = store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'direct-provider-key',
      useForChat: true,
      useForPlanner: true,
    })
    const raw = JSON.parse(readFileSync(join(dir, 'model-config.json'), 'utf8')) as Record<string, unknown>

    assert.equal(updated.configured, true)
    assert.equal(updated.modelConfigId, undefined)
    assert.equal(updated.model, 'gpt-5.5')
    assert.equal(updated.apiKind, 'openai_responses')
    assert.equal(updated.baseURL, 'https://api.openai.com/v1')
    assert.equal(updated.apiKeyConfigured, true)
    assert.equal(updated.credentialStatus.required, true)
    assert.equal(updated.credentialStatus.configured, true)
    assert.deepEqual(updated.credentialStatus.acceptedEnv, ['model settings API key'])
    assert.equal(raw.modelConfigId, undefined)
    assert.equal(raw.apiKey, 'direct-provider-key')
    const publicConfig = store.getPublicConfig()
    assert.equal(publicConfig.credentialStatus.configured, true)
    assert.deepEqual(publicConfig.credentialStatus.sourceEnv, ['model settings API key'])
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
      apiKind: 'openai_chat_completions',
      apiKeyConfigured: false,
      useForChat: true,
      useForPlanner: true,
      source: 'none',
      credentialStatus: {
        required: false,
        configured: false,
        sourceEnv: [],
        acceptedEnv: ['model settings API key'],
      },
    })

    writeFileSync(filePath, '["model_config:7"]', 'utf8')
    assert.equal(store.getEffectiveConfig(), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config ignores persisted configs with all routes disabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    writeFileSync(filePath, JSON.stringify({
      provider: 'backend-model-config',
      model: 'gpt-5.5',
      useForChat: false,
      useForPlanner: false,
    }), 'utf8')

    assert.equal(store.getEffectiveConfig(), undefined)
    assert.equal(store.getPublicConfig().configured, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config ignores persisted direct configs with embedded secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    writeFileSync(filePath, JSON.stringify({
      provider: 'backend-model-config',
      model: 'sk-proj-exampleSecretValue123456789',
      apiKind: 'openai_responses',
      useForChat: true,
      useForPlanner: true,
    }), 'utf8')

    assert.equal(store.getEffectiveConfig(), undefined)
    assert.equal(store.getPublicConfig().configured, false)

    writeFileSync(filePath, JSON.stringify({
      provider: 'backend-model-config',
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1?token=secret',
      useForChat: true,
      useForPlanner: true,
    }), 'utf8')

    assert.equal(store.getEffectiveConfig(), undefined)
    assert.equal(store.getPublicConfig().configured, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config test uses backend OpenAI-compatible gateway and hides auth from the public request snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  const originalFetch = globalThis.fetch
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))
    store.save({
      modelConfigId: 9,
      model: 'model_config:9',
    })

    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'http://localhost:8765/v1/chat/completions')
      assert.equal(init?.method, 'POST')
      assert.equal(headerValue(init?.headers, 'authorization'), 'Bearer user-token')
      assert.equal(typeof init?.body, 'string')
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      assert.equal(body.model, 'model_config:9')
      assert.ok(Array.isArray(body.messages))
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'connection ok' } }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await store.test({ message: 'hello' }, { backendAuthToken: 'user-token' })

    assert.equal(result.ok, true)
    assert.equal(result.content, 'connection ok')
    assert.equal(result.modelConfigId, 9)
    assert.equal(result.request.url, 'http://localhost:8765/v1/chat/completions')
    assert.equal(result.request.method, 'POST')
    assert.equal(result.request.headers.Authorization, undefined)
    assert.equal(result.request.body.model, 'model_config:9')
    assert.equal(result.request.body.messages[1]?.content, 'hello')
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config normalizes explicit backend /api/v1 base URL to OpenAI-compatible /v1', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  const originalFetch = globalThis.fetch
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))
    const saved = store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_chat_completions',
      baseURL: 'http://localhost:8765/api/v1',
    })
    assert.equal(saved.credentialStatus.required, false)

    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'http://localhost:8765/v1/chat/completions')
      assert.equal(headerValue(init?.headers, 'authorization'), 'Bearer user-token')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'connection ok' } }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await store.test({ message: 'hello' }, {
      backendAuthToken: 'user-token',
      backendAPIBaseURL: 'http://localhost:8765/api/v1',
    })

    assert.equal(result.request.url, 'http://localhost:8765/v1/chat/completions')
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config test honors apiKind draft override instead of stale saved mode', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  const originalFetch = globalThis.fetch
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))
    store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'direct-provider-key',
    })

    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'http://localhost:8765/v1/chat/completions')
      assert.equal(headerValue(init?.headers, 'authorization'), 'Bearer user-token')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'chat connection ok' } }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await store.test({
      message: 'hello',
      model: 'model_config:9',
      modelConfigId: 9,
      apiKind: 'openai_chat_completions',
      useForChat: true,
      useForPlanner: true,
    }, {
      backendAuthToken: 'user-token',
      backendAPIBaseURL: 'http://localhost:8765/api/v1',
    })

    assert.equal(result.apiKind, 'openai_chat_completions')
    assert.equal(result.content, 'chat connection ok')
    assert.equal(result.request.url, 'http://localhost:8765/v1/chat/completions')
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config explicit provider test does not treat backend auth as provider API key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))
    store.save({
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
    })

    await assert.rejects(
      () => store.test({ message: 'hello' }, { backendAuthToken: 'backend-user-token' }),
      /openai_responses requires an API key in model settings/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('JSON mode messages include ASCII JSON instruction when missing', () => {
  const messages = ensureJSONModeMessages([
      {
        role: 'system',
        content: '输出结构化对象，不要使用 markdown。',
      },
      {
        role: 'user',
        content: '分析这个剧本。',
      },
    ])

  assert.equal(messages[0]?.role, 'system')
  assert.match(messages[0]?.content ?? '', /\bJSON\b/)
  assert.equal(messages[1]?.content, '输出结构化对象，不要使用 markdown。')
})

test('JSON mode messages do not duplicate an existing JSON instruction', () => {
  const messages = ensureJSONModeMessages([
      {
        role: 'system',
        content: 'Return only valid JSON.',
      },
      {
        role: 'user',
        content: 'Analyze this script.',
      },
    ])

  assert.equal(messages.length, 2)
  assert.equal(messages[0]?.content, 'Return only valid JSON.')
})

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === name.toLowerCase())
    return entry?.[1] ?? null
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry?.[1] ?? null
}

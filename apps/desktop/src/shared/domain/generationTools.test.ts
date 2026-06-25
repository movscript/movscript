import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGenerationToolServer,
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  normalizeGenerationToolsSettings,
} from './generationTools'

test('generation tools normalize local server protocol settings', () => {
  const server = createGenerationToolServer('comfyui', {
    id: 'server-1',
    enabled: true,
    baseURL: ' http://127.0.0.1:8188/ ',
    timeoutMS: 42,
    priority: 7.7,
    tags: [' fast ', 'fast', ''],
  })

  const settings = normalizeGenerationToolsSettings({
    servers: [server],
    defaultServerId: 'server-1',
    defaultServerIds: { comfyui: 'server-1' },
    preferLocalServers: false,
  })

  assert.equal(settings.servers[0]?.baseURL, 'http://127.0.0.1:8188')
  assert.equal(settings.servers[0]?.timeoutMS, 1000)
  assert.equal(settings.servers[0]?.priority, 8)
  assert.deepEqual(settings.servers[0]?.tags, ['fast'])
  assert.deepEqual(settings.defaultServerIds, { comfyui: 'server-1' })
  assert.equal(settings.preferLocalServers, false)
})

test('generation tools normalize legacy settings and fallback defaults', () => {
  const legacy = normalizeGenerationToolsSettings({
    defaultServerId: 'local-comfyui-default',
    comfyui: {
      enabled: true,
      apiKey: 'token-1',
      baseURL: 'http://localhost:8188/',
    },
  } as Parameters<typeof normalizeGenerationToolsSettings>[0])

  assert.equal(legacy.servers[0]?.id, 'local-comfyui-default')
  assert.equal(legacy.servers[0]?.authKind, 'bearer')
  assert.equal(legacy.servers[0]?.token, 'token-1')
  assert.deepEqual(legacy.defaultServerIds, { comfyui: 'local-comfyui-default' })

  assert.deepEqual(
    normalizeGenerationToolsSettings(null).servers.map((server) => server.id),
    DEFAULT_GENERATION_TOOLS_SETTINGS.servers.map((server) => server.id),
  )
})

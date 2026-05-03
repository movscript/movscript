import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { RuntimeModelConfigStore } from './modelConfig.js'

test('runtime model config saves API key and base URL to a private file shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const store = new RuntimeModelConfigStore(filePath)

    const publicConfig = store.save({
      baseURL: 'https://example.test/v1/',
      model: 'debug-model',
      apiKey: 'sk-test',
      useForChat: true,
      useForPlanner: false,
    })
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>

    assert.equal(publicConfig.configured, true)
    assert.equal(publicConfig.apiKeyConfigured, true)
    assert.equal(publicConfig.baseURL, 'https://example.test/v1')
    assert.equal(publicConfig.model, 'debug-model')
    assert.equal(publicConfig.source, 'file')
    assert.equal(raw.apiKey, 'sk-test')
    assert.equal(raw.baseURL, 'https://example.test/v1')
    assert.equal(raw.useForPlanner, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime model config keeps an existing API key when saving URL/model changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-model-config-'))
  try {
    const store = new RuntimeModelConfigStore(join(dir, 'model-config.json'))

    store.save({ baseURL: 'https://first.test/v1', model: 'first', apiKey: 'sk-existing' })
    const updated = store.save({ baseURL: 'https://second.test/v1', model: 'second' })
    const effective = store.getEffectiveConfig()

    assert.equal(updated.apiKeyConfigured, true)
    assert.equal(updated.baseURL, 'https://second.test/v1')
    assert.equal(updated.model, 'second')
    assert.equal(effective?.apiKey, 'sk-existing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

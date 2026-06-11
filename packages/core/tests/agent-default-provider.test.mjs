import assert from 'node:assert/strict'
import test from 'node:test'

import {
  backendAgentProviderRef,
  hasExplicitAgentProviderConfig,
  normalizeAgentProviderKey,
  resolveDefaultAgentProviderFromBackend,
  selectDefaultAgentProviderModel,
} from '../dist/agent/index.js'

test('core default agent provider decision creates backend provider config from default model', () => {
  const decision = resolveDefaultAgentProviderFromBackend({
    providerKind: 'mova',
    providerKey: 'Mova',
    currentProvider: undefined,
    apiBaseURL: 'http://localhost:8765/api/',
    models: [
      modelFixture({ id: 1, credential_id: 10, model_id: 'fallback-model' }),
      modelFixture({ id: 2, credential_id: 20, model_id: 'default-model', is_default: true }),
    ],
  })

  assert.deepEqual(decision.result, {
    status: 'created',
    providerKey: 'mova',
    providerRef: 'backend:20',
    model: 'default-model',
  })
  assert.equal(decision.providerConfig?.enabled, true)
  assert.equal(decision.providerConfig?.baseURL, 'http://localhost:8765/api/v1')
  assert.deepEqual(decision.providerConfig?.config, { mode: 'backendKey', modelProviderRef: 'backend:20' })
  assert.deepEqual(decision.providerConfig?.auth, { mode: 'backendKey', modelProviderRef: 'backend:20' })
  assert.deepEqual(decision.providerConfig?.defaultAgentProvider, {
    source: 'backend-model',
    providerRef: 'backend:20',
    model: 'default-model',
    credentialId: 20,
  })
})

test('core default agent provider decision keeps explicit provider config unchanged', () => {
  const currentProvider = {
    authSource: 'local-home',
    auth: { mode: 'local-home' },
    config: { mode: 'local-home' },
  }
  const decision = resolveDefaultAgentProviderFromBackend({
    providerKind: 'mova',
    currentProvider,
    apiBaseURL: 'http://localhost:8765/api',
    models: [modelFixture({ credential_id: 20, model_id: 'default-model', is_default: true })],
  })

  assert.equal(decision.result.status, 'existing')
  assert.equal(decision.result.providerKey, 'mova')
  assert.equal(decision.providerConfig, undefined)
  assert.equal(hasExplicitAgentProviderConfig(currentProvider), true)
})

test('core default agent provider model helpers prefer backend defaults and normalize keys', () => {
  const fallback = modelFixture({ id: 1, credential_id: 10, model_id: 'fallback-model' })
  const pinned = modelFixture({ id: 2, credential_id: 20, model_id: 'default-model', is_default: true })

  assert.equal(selectDefaultAgentProviderModel([fallback, pinned])?.model_id, 'default-model')
  assert.equal(backendAgentProviderRef(pinned), 'backend:20')
  assert.equal(normalizeAgentProviderKey(' Codex_1 '), 'codex_1')
  assert.equal(normalizeAgentProviderKey('1-invalid'), 'mova')
})

function modelFixture(patch = {}) {
  return {
    id: 1,
    credential_id: 1,
    model_id: 'model',
    display_name: 'Model',
    capabilities: ['text'],
    accepts_image_input: false,
    ...patch,
  }
}

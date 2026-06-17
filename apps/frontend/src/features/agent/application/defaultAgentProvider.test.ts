import assert from 'node:assert/strict'
import test from 'node:test'

import { backendAgentProviderRef, ensureDefaultAgentProviderFromBackend, selectDefaultAgentProviderModel } from './defaultAgentProvider'
import type { MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import type { PublicModel } from '@/types'

test('ensureDefaultAgentProviderFromBackend creates a backend provider from the backend default model', async () => {
  const saves: MovScriptWorkspaceConfig['providers'][] = []
  const client = {
    async getWorkspaceConfig(): Promise<MovScriptWorkspaceConfig> {
      return {
        schema: 'movscript.workspace-config.v2',
        updatedAt: '2026-06-07T00:00:00.000Z',
      }
    },
    async saveWorkspaceConfig(input: { providers?: MovScriptWorkspaceConfig['providers'] }): Promise<MovScriptWorkspaceConfig> {
      saves.push(input.providers)
      return {
        schema: 'movscript.workspace-config.v2',
        updatedAt: '2026-06-07T00:00:01.000Z',
        providers: input.providers,
      }
    },
  }

  const result = await ensureDefaultAgentProviderFromBackend({
    provider: providerFixture(),
    models: [
      modelFixture({ id: 1, credential_id: 10, model_id: 'fallback-model' }),
      modelFixture({ id: 2, credential_id: 20, model_id: 'default-model', is_default: true }),
    ],
    client,
  })

  assert.equal(result.status, 'created')
  assert.equal(result.providerKey, 'mova')
  assert.equal(result.providerRef, 'backend:20')
  assert.equal(result.model, 'default-model')
  assert.equal(saves.length, 1)
  assert.equal(saves[0]?.mova?.configSource, 'backend')
  assert.deepEqual(saves[0]?.mova?.config, { mode: 'backendKey', modelProviderRef: 'backend:20' })
  assert.deepEqual(saves[0]?.mova?.auth, { mode: 'backendKey', modelProviderRef: 'backend:20' })
  assert.deepEqual(saves[0]?.mova?.defaultAgentProvider, {
    source: 'backend-model',
    providerRef: 'backend:20',
    model: 'default-model',
    credentialId: 20,
  })
})

test('ensureDefaultAgentProviderFromBackend keeps explicit provider config unchanged', async () => {
  let saveCalled = false
  const client = {
    async getWorkspaceConfig(): Promise<MovScriptWorkspaceConfig> {
      return {
        schema: 'movscript.workspace-config.v2',
        updatedAt: '2026-06-07T00:00:00.000Z',
        providers: {
          mova: {
            authSource: 'local-home',
            auth: { mode: 'local-home' },
            config: { mode: 'local-home' },
          },
        },
      }
    },
    async saveWorkspaceConfig(): Promise<MovScriptWorkspaceConfig> {
      saveCalled = true
      throw new Error('save should not be called')
    },
  }

  const result = await ensureDefaultAgentProviderFromBackend({
    provider: providerFixture(),
    models: [modelFixture({ credential_id: 20, model_id: 'default-model', is_default: true })],
    client,
  })

  assert.equal(result.status, 'existing')
  assert.equal(saveCalled, false)
})

test('default agent provider model helpers prefer backend defaults', () => {
  const fallback = modelFixture({ id: 1, credential_id: 10, model_id: 'fallback-model' })
  const pinned = modelFixture({ id: 2, credential_id: 20, model_id: 'default-model', is_default: true })

  assert.equal(selectDefaultAgentProviderModel([fallback, pinned])?.model_id, 'default-model')
  assert.equal(backendAgentProviderRef(pinned), 'backend:20')
})

function providerFixture(): ProviderConfig {
  return {
    id: 'mova',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'MovScript Mova',
    enabled: true,
    appServerProfile: {
      id: 'mova-movscript-home',
      label: 'MovScript Mova',
      providerKey: 'mova',
      home: '.mova',
      lifecycle: 'movscript-owned',
    },
  }
}

function modelFixture(patch: Partial<PublicModel>): PublicModel {
  return {
    id: 1,
    credential_id: 1,
    model_id: 'model',
    display_name: 'Model',
    capabilities: ['text'],
    accepts_image_input: false,
    masked_key: 'sk-***',
    is_enabled: true,
    files_api_enabled: false,
    files_api_base_url: '',
    files_api_masked_key: '',
    CreatedAt: '2026-06-07T00:00:00.000Z',
    UpdatedAt: '2026-06-07T00:00:00.000Z',
    ...patch,
  }
}

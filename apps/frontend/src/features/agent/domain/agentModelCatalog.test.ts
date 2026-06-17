import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchAgentBackendModels, normalizeAgentModelCatalogEntries } from '../application/agentModelCatalogApi'
import { AGENT_BACKEND_MODEL_CAPABILITY_QUERY, mergeAgentBackendModels } from './agentModelCatalog'
import type { PublicModel } from '@/types'

test('fetchAgentBackendModels asks backend for text and reasoning models', async () => {
  const requests: Array<{ path: string; capability: unknown }> = []
  const client = {
    async get(path: string, options?: { params?: Record<string, unknown> }) {
      requests.push({ path, capability: options?.params?.capability })
      return { data: [modelFixture({ id: 1, model_id: 'gpt-5.4', capabilities: ['reasoning'] })] }
    },
  }

  const models = await fetchAgentBackendModels(client)

  assert.deepEqual(requests, [{ path: '/models', capability: AGENT_BACKEND_MODEL_CAPABILITY_QUERY }])
  assert.equal(models[0]?.model_id, 'gpt-5.4')
})

test('mergeAgentBackendModels deduplicates text and reasoning views of the same backend model', () => {
  const models = mergeAgentBackendModels([
    modelFixture({ id: 1, model_id: 'gpt-5.4', capabilities: ['text'], provider_variant_count: 1 }),
    modelFixture({ id: 2, model_id: 'gpt-5.4', capabilities: ['reasoning'], provider_variant_count: 1 }),
  ])

  assert.equal(models.length, 1)
  assert.deepEqual(models[0]?.capabilities, ['text', 'reasoning'])
})

test('normalizeAgentModelCatalogEntries maps backend gorm IDs to frontend IDs', () => {
  const entries = normalizeAgentModelCatalogEntries([
    {
      ID: 42,
      public_model_id: 'gpt-catalog',
      provider_model_id: 'gpt-provider',
      display_name: 'GPT Catalog',
      is_enabled: true,
      route_bindings: [
        {
          ID: 99,
          catalog_entry_id: 42,
          source_type: 'local_provider',
          credential_id: 7,
          is_enabled: true,
        },
      ],
    },
  ])

  assert.equal(entries[0]?.id, 42)
  assert.equal(entries[0]?.route_bindings?.[0]?.id, 99)
})

function modelFixture(patch: Partial<PublicModel>): PublicModel {
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

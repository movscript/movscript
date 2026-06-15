import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchAgentBackendModels } from '../application/agentModelCatalogApi'
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

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_BACKEND_MODEL_CAPABILITY_QUERY,
  fetchAgentBackendModels,
  mergeAgentBackendModels,
  publicAgentBackendModelId,
} from '../dist/agent/index.js'

test('core agent model catalog asks for text and reasoning models', async () => {
  const requests = []
  const client = {
    async get(path, options) {
      requests.push({ path, capability: options?.params?.capability })
      return { data: [modelFixture({ id: 1, model_id: 'gpt-5.4', capabilities: ['reasoning'] })] }
    },
  }

  const models = await fetchAgentBackendModels(client)

  assert.deepEqual(requests, [{ path: '/models', capability: AGENT_BACKEND_MODEL_CAPABILITY_QUERY }])
  assert.equal(models[0]?.model_id, 'gpt-5.4')
})

test('core agent model catalog merges backend variants by public model id', () => {
  const models = mergeAgentBackendModels([
    modelFixture({ id: 1, model_id: 'gpt-5.4', capabilities: ['text'], provider_variant_count: 1 }),
    modelFixture({ id: 2, model_id: 'gpt-5.4', capabilities: ['reasoning'], accepts_image_input: true, provider_variant_count: 2 }),
  ])

  assert.equal(models.length, 1)
  assert.deepEqual(models[0]?.capabilities, ['text', 'reasoning'])
  assert.equal(models[0]?.accepts_image_input, true)
  assert.equal(models[0]?.provider_variant_count, 2)
})

test('core agent model catalog resolves stable public model ids', () => {
  assert.equal(publicAgentBackendModelId(modelFixture({ id: 9, model_id: ' gpt-5.4 ' })), 'gpt-5.4')
  assert.equal(publicAgentBackendModelId(modelFixture({ id: 9, model_id: '', logical_model_id: 'logical-id' })), 'logical-id')
  assert.equal(publicAgentBackendModelId(modelFixture({ id: 9, model_id: '', logical_model_id: '', model_def_id: 'model-def' })), 'model-def')
  assert.equal(publicAgentBackendModelId(modelFixture({ id: 9, model_id: '', logical_model_id: '', model_def_id: '' })), 'model_config:9')
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

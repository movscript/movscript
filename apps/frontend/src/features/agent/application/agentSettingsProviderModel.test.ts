import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearedProviderModelWorkspaceDraft,
  providerModelConfigFromSelection,
  providerModelWorkspaceDraftFromConfig,
  storedProviderModelWorkspaceId,
} from '@/features/agent/application/agentSettingsProviderModel'
import type { ProviderModelConfigPublic } from '@movscript/core/agent/protocol'
import type { PublicModel } from '@/types'

const textModels: PublicModel[] = [
  model({ id: 11, catalog_entry_id: 1011, model_id: 'gpt-fast', display_name: 'Fast Text' }),
  model({ id: 12, model_id: 'gpt-deep', display_name: 'Deep Text' }),
]

test('provider model workspace draft follows backend catalog config', () => {
  const draft = providerModelWorkspaceDraftFromConfig({
    config: providerConfig({
      model: 'gpt-deep',
      apiKind: 'openai_chat_completions',
      useForChat: true,
      useForPlanner: false,
    }),
    models: textModels,
    noModelValue: '__none',
  })

  assert.deepEqual(draft, {
    selectedModelId: 'gpt-deep',
    useForChat: true,
    useForPlanner: false,
  })
})

test('provider model workspace draft keeps legacy direct model ids out of catalog selection', () => {
  const draft = providerModelWorkspaceDraftFromConfig({
    config: providerConfig({
      model: 'claude-3-5-sonnet',
      modelEndpointBaseURL: 'https://example.test/v1',
      apiKind: undefined,
      useForChat: false,
      useForPlanner: true,
    }),
    models: textModels,
    noModelValue: '__none',
  })

  assert.deepEqual(draft, {
    selectedModelId: '__none',
    useForChat: false,
    useForPlanner: true,
  })
})

test('stored provider model workspace id uses public model ids', () => {
  assert.equal(storedProviderModelWorkspaceId(textModels, 'gpt-fast'), 'gpt-fast')
  assert.equal(storedProviderModelWorkspaceId(textModels, 'missing-model'), null)
  assert.equal(storedProviderModelWorkspaceId(textModels, null), null)
})

test('cleared provider model workspace draft resets model workspace defaults', () => {
  assert.deepEqual(clearedProviderModelWorkspaceDraft({ noModelValue: '__none' }), {
    selectedModelId: '__none',
    useForChat: true,
    useForPlanner: true,
  })
})

test('provider model selection builds neutral display config and routes', () => {
  assert.deepEqual(providerModelConfigFromSelection({
    modelId: 'gpt-fast',
    useForChat: true,
    useForPlanner: false,
  }), {
    configured: true,
    provider: 'backend-model-config',
    model: 'gpt-fast',
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    useForChat: true,
    useForPlanner: false,
    source: 'file',
    credentialStatus: {
      required: false,
      configured: false,
      sourceEnv: [],
      acceptedEnv: [],
    },
    capabilities: [
      {
        capability: 'text',
        configured: true,
        provider: 'backend-model-config',
        model: 'gpt-fast',
        source: 'configured',
      },
      {
        capability: 'planning',
        configured: false,
        source: 'disabled',
      },
    ],
  })
})

function providerConfig(patch: Partial<ProviderModelConfigPublic>): ProviderModelConfigPublic {
  return {
    configured: true,
    provider: 'backend-model-config',
    model: 'gpt-fast',
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    useForChat: true,
    useForPlanner: true,
    source: 'file',
    credentialStatus: {
      required: false,
      configured: false,
      sourceEnv: [],
      acceptedEnv: [],
    },
    ...patch,
  }
}

function model(patch: Pick<PublicModel, 'id' | 'model_id' | 'display_name'> & Partial<PublicModel>): PublicModel {
  return {
    provider_id: 'local_provider:1',
    capabilities: ['text'],
    accepts_image_input: false,
    ...patch,
  }
}

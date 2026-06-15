import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProviderModelOperationPlan,
  buildProviderModelTestRequest,
  clearedProviderModelWorkspaceDraft,
  providerModelSecretValidationIssue,
  providerModelWorkspaceDraftFromConfig,
  storedProviderModelWorkspaceId,
} from '@/features/agent/application/agentSettingsProviderModel'
import type { ProviderModelConfigPublic } from '@/shared/infrastructure/providerSessionClient'
import type { PublicModel } from '@/types'

const textModels: PublicModel[] = [
  model({ id: 11, model_id: 'model_config:11', display_name: 'Fast Text' }),
  model({ id: 12, model_id: 'model_config:12', display_name: 'Deep Text' }),
]

test('provider model workspace draft follows backend catalog config', () => {
  const draft = providerModelWorkspaceDraftFromConfig({
    config: providerConfig({
      modelConfigId: 12,
      model: 'model_config:12',
      apiKind: 'openai_chat_completions',
      useForChat: true,
      useForPlanner: false,
    }),
    models: textModels,
    noModelValue: '__none',
    defaultApiKind: 'openai_responses',
  })

  assert.deepEqual(draft, {
    selectedModelId: 'model_config:12',
    directModelId: 'model_config:12',
    selectedApiKind: 'openai_chat_completions',
    baseURL: '',
    useForChat: true,
    useForPlanner: false,
  })
})

test('provider model workspace draft keeps manual model ids out of catalog selection', () => {
  const draft = providerModelWorkspaceDraftFromConfig({
    config: providerConfig({
      model: 'claude-3-5-sonnet',
      baseURL: 'https://example.test/v1',
      apiKind: undefined,
      useForChat: false,
      useForPlanner: true,
    }),
    models: textModels,
    noModelValue: '__none',
    defaultApiKind: 'openai_responses',
  })

  assert.deepEqual(draft, {
    selectedModelId: '__none',
    directModelId: 'claude-3-5-sonnet',
    selectedApiKind: 'openai_responses',
    baseURL: 'https://example.test/v1',
    useForChat: false,
    useForPlanner: true,
  })
})

test('stored provider model workspace id maps legacy numeric ids to public ids', () => {
  assert.equal(storedProviderModelWorkspaceId(textModels, 11), 'model_config:11')
  assert.equal(storedProviderModelWorkspaceId(textModels, 999), null)
  assert.equal(storedProviderModelWorkspaceId(textModels, null), null)
})

test('cleared provider model workspace draft resets model workspace defaults', () => {
  assert.deepEqual(clearedProviderModelWorkspaceDraft({
    noModelValue: '__none',
    defaultApiKind: 'openai_responses',
  }), {
    selectedModelId: '__none',
    directModelId: '',
    selectedApiKind: 'openai_responses',
    baseURL: '',
    useForChat: true,
    useForPlanner: true,
  })
})

test('provider model secret validation reports the blocking issue in priority order', () => {
  assert.equal(providerModelSecretValidationIssue({
    directModelIdHasSecret: true,
    baseURLHasSecret: true,
  }), 'model_id_secret')
  assert.equal(providerModelSecretValidationIssue({
    directModelIdHasSecret: false,
    baseURLHasSecret: true,
  }), 'base_url_secret')
  assert.equal(providerModelSecretValidationIssue({
    directModelIdHasSecret: false,
    baseURLHasSecret: false,
  }), null)
})

test('provider model operation plan builds catalog requests and stored ids', () => {
  const plan = buildProviderModelOperationPlan({
    selectedModel: textModels[0],
    usesModelCatalog: true,
    model: 'model_config:11',
    apiKind: 'openai_responses',
    baseURL: '',
    apiKey: '  secret  ',
    useForChat: true,
    useForPlanner: false,
  })

  assert.deepEqual(plan, {
    request: {
      modelConfigId: 11,
      model: 'model_config:11',
      apiKind: 'openai_responses',
      apiKey: 'secret',
      useForChat: true,
      useForPlanner: false,
    },
    storedModelId: 11,
  })
})

test('provider model test request keeps save request fields and normalizes message', () => {
  const request = {
    model: 'manual-model',
    apiKind: 'anthropic_messages' as const,
    baseURL: 'https://example.test/v1',
    useForChat: false,
    useForPlanner: true,
  }

  assert.deepEqual(buildProviderModelTestRequest({
    request,
    message: '  ',
    fallbackMessage: 'hello',
  }), {
    message: 'hello',
    ...request,
  })
})

function providerConfig(patch: Partial<ProviderModelConfigPublic>): ProviderModelConfigPublic {
  return {
    configured: true,
    provider: 'backend-model-config',
    model: 'model_config:11',
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

function model(patch: Pick<PublicModel, 'id' | 'model_id' | 'display_name'>): PublicModel {
  return {
    credential_id: 1,
    capabilities: ['text'],
    accepts_image_input: false,
    ...patch,
  }
}

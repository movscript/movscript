import assert from 'node:assert/strict'
import test from 'node:test'

import { backendAgentProviderRef, selectDefaultAgentProviderModel } from './defaultAgentProvider'
import type { PublicModel } from '@/types'

test('default agent provider helpers are frontend re-exports of core model selection helpers', () => {
  const fallback = modelFixture({ id: 1, model_id: 'fallback-model' })
  const pinned = modelFixture({ id: 2, model_id: 'default-model', is_default: true })

  assert.equal(selectDefaultAgentProviderModel([fallback, pinned])?.model_id, 'default-model')
  assert.equal(backendAgentProviderRef(pinned), 'backend:model:default-model')
  assert.equal(backendAgentProviderRef(modelFixture({ id: 20, catalog_entry_id: 42, model_id: '' })), 'backend:catalog:42')
})

function modelFixture(patch: Partial<PublicModel>): PublicModel {
  return {
    id: 1,
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

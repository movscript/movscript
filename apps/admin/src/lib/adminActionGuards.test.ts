import assert from 'node:assert/strict'
import test from 'node:test'
import {
  credentialToggleConfirmKey,
  featureToggleConfirmKey,
  modelConfigDisplayName,
  nextCredentialEnabledState,
} from './adminActionGuards'

test('credential toggle guard returns the next state and matching confirmation key', () => {
  assert.equal(nextCredentialEnabledState({ is_enabled: false }), true)
  assert.equal(credentialToggleConfirmKey({ is_enabled: false }), 'admin.models.confirmEnableCredential')

  assert.equal(nextCredentialEnabledState({ is_enabled: true }), false)
  assert.equal(credentialToggleConfirmKey({ is_enabled: true }), 'admin.models.confirmDisableCredential')
})

test('model config display name prefers custom admin name and falls back to model id', () => {
  assert.equal(modelConfigDisplayName({ custom_display_name: 'Fast Text', model_def_id: 'gpt-4.1-mini' }), 'Fast Text')
  assert.equal(modelConfigDisplayName({ custom_display_name: '', model_def_id: 'gpt-4.1-mini' }), 'gpt-4.1-mini')
})

test('feature toggle guard only asks for confirmation when enabled state changes', () => {
  assert.equal(featureToggleConfirmKey({ is_enabled: false }, { allowed_model_ids: [1, 2] }), null)
  assert.equal(featureToggleConfirmKey({ is_enabled: true }, { is_enabled: true }), null)
  assert.equal(featureToggleConfirmKey({ is_enabled: false }, { is_enabled: false }), null)

  assert.equal(featureToggleConfirmKey({ is_enabled: false }, { is_enabled: true }), 'admin.features.confirmEnable')
  assert.equal(featureToggleConfirmKey({ is_enabled: true }, { is_enabled: false }), 'admin.features.confirmDisable')
})

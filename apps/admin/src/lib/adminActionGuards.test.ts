import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cloudFileConfigToggleConfirmKey,
  credentialToggleConfirmKey,
  jobActionConfirmKey,
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

test('job action guard maps operational actions to confirmation keys', () => {
  assert.equal(jobActionConfirmKey('retry'), 'admin.debug.jobs.confirmRetry')
  assert.equal(jobActionConfirmKey('cancel'), 'admin.debug.jobs.confirmCancel')
  assert.equal(jobActionConfirmKey('delete'), 'admin.debug.jobs.confirmDelete')
})

test('cloud file config toggle guard maps current state to confirmation key', () => {
  assert.equal(cloudFileConfigToggleConfirmKey({ is_enabled: false }), 'admin.cloudFiles.confirmEnable')
  assert.equal(cloudFileConfigToggleConfirmKey({ is_enabled: true }), 'admin.cloudFiles.confirmDisable')
})

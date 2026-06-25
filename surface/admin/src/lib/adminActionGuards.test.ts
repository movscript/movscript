import assert from 'node:assert/strict'
import test from 'node:test'
import {
  catalogEntryDisplayName,
  cloudFileConfigToggleConfirmKey,
  credentialToggleConfirmKey,
  jobActionConfirmKey,
  nextCredentialEnabledState,
} from './adminActionGuards'

test('credential toggle guard returns the next state and matching confirmation key', () => {
  assert.equal(nextCredentialEnabledState({ is_enabled: false }), true)
  assert.equal(credentialToggleConfirmKey({ is_enabled: false }), 'admin.models.confirmEnableCredential')

  assert.equal(nextCredentialEnabledState({ is_enabled: true }), false)
  assert.equal(credentialToggleConfirmKey({ is_enabled: true }), 'admin.models.confirmDisableCredential')
})

test('catalog entry display name prefers admin display fields and falls back to public model id', () => {
  assert.equal(catalogEntryDisplayName({ display_name: 'Fast Text', short_name: 'fast', public_model_id: 'gpt-5.2' }), 'Fast Text')
  assert.equal(catalogEntryDisplayName({ display_name: '', short_name: 'fast', public_model_id: 'gpt-5.2' }), 'fast')
  assert.equal(catalogEntryDisplayName({ display_name: '', short_name: '', public_model_id: 'gpt-5.2' }), 'gpt-5.2')
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

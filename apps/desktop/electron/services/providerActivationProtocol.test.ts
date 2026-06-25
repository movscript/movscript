import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findProviderActivationURL,
  parseProviderActivationURL,
  RESTART_LOCAL_BACKEND_ACTIVATION_URL,
  RESTART_LOCAL_RUNTIME_ACTIVATION_URL,
} from './providerActivationProtocol'

test('parseProviderActivationURL accepts local runtime restart activation links', () => {
  assert.deepEqual(parseProviderActivationURL(RESTART_LOCAL_RUNTIME_ACTIVATION_URL), {
    action: 'restart_local_runtime',
  })
})

test('parseProviderActivationURL keeps local backend restart links as compatibility aliases', () => {
  assert.deepEqual(parseProviderActivationURL(RESTART_LOCAL_BACKEND_ACTIVATION_URL), {
    action: 'restart_local_runtime',
  })
})

test('parseProviderActivationURL rejects unrelated or unsupported links', () => {
  assert.equal(parseProviderActivationURL('https://example.com'), null)
  assert.equal(parseProviderActivationURL('movscript://provider-activation/unknown'), null)
  assert.equal(parseProviderActivationURL('movscript://other/restart-local-backend'), null)
  assert.equal(parseProviderActivationURL('not a url'), null)
})

test('findProviderActivationURL finds the first supported protocol argument', () => {
  assert.equal(
    findProviderActivationURL(['--flag', RESTART_LOCAL_RUNTIME_ACTIVATION_URL]),
    RESTART_LOCAL_RUNTIME_ACTIVATION_URL,
  )
  assert.equal(findProviderActivationURL(['--flag', 'movscript://provider-activation/unknown']), undefined)
})

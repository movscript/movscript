import assert from 'node:assert/strict'
import test from 'node:test'

import { hasRelayGatewayProviderInstance, isRelayGatewayProviderInstance, RELAY_GATEWAY_PROVIDER_INSTANCE_ID } from './adminRelayGatewayMode'

test('detects enterprise relay gateway startup instance by id', () => {
  assert.equal(isRelayGatewayProviderInstance({ id: RELAY_GATEWAY_PROVIDER_INSTANCE_ID, type: 'ai_gateway', adapter: 'relay-gateway' }), true)
})

test('detects enterprise relay gateway startup instance by type and adapter', () => {
  assert.equal(isRelayGatewayProviderInstance({ id: 'custom-id', type: 'ai_gateway', adapter: 'relay-gateway' }), true)
})

test('does not treat local provider instances as relay gateway mode', () => {
  assert.equal(hasRelayGatewayProviderInstance([
    { id: 'ai_gateway:local', type: 'ai_gateway', adapter: 'local' },
    { id: 'credential:1', type: 'ai_credential', adapter: 'openai_compat' },
  ]), false)
})

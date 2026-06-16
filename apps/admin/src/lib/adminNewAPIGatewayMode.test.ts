import assert from 'node:assert/strict'
import test from 'node:test'

import { hasNewAPIGatewayProviderInstance, isNewAPIGatewayProviderInstance, NEW_API_GATEWAY_PROVIDER_INSTANCE_ID } from './adminNewAPIGatewayMode'

test('detects enterprise new-api gateway startup instance by id', () => {
  assert.equal(isNewAPIGatewayProviderInstance({ id: NEW_API_GATEWAY_PROVIDER_INSTANCE_ID, type: 'ai_gateway', adapter: 'new-api' }), true)
})

test('detects enterprise new-api gateway startup instance by type and adapter', () => {
  assert.equal(isNewAPIGatewayProviderInstance({ id: 'custom-id', type: 'ai_gateway', adapter: 'new-api' }), true)
})

test('does not treat local provider instances as new-api gateway mode', () => {
  assert.equal(hasNewAPIGatewayProviderInstance([
    { id: 'ai_gateway:local', type: 'ai_gateway', adapter: 'local' },
    { id: 'credential:1', type: 'ai_credential', adapter: 'openai_compat' },
  ]), false)
})

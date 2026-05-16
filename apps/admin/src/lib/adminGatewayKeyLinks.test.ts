import assert from 'node:assert/strict'
import test from 'node:test'
import { gatewayKeyAuditHref, gatewayKeyUsageHref } from './adminGatewayKeyLinks'

test('gatewayKeyUsageHref links to usage logs filtered by key and scope', () => {
  assert.equal(
    gatewayKeyUsageHref({ ID: 21, org_id: 9, project_id: 11 }),
    '/usage-logs?org_id=9&project_id=11&gateway_api_key_id=21',
  )
})

test('gatewayKeyAuditHref links to audit logs filtered by key target and scope', () => {
  assert.equal(
    gatewayKeyAuditHref({ ID: 21, org_id: 9, project_id: 11 }),
    '/audit-logs?target_type=model_gateway_api_key&target_id=21&org_id=9&project_id=11',
  )
})

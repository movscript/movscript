import assert from 'node:assert/strict'
import test from 'node:test'
import {
  auditFiltersFromSearchParams,
  auditLogsHref,
  auditSearchParams,
  dateToQueryInput,
  emptyAuditLogFilters,
  emptyUsageFilters,
  pageFromSearchParams,
  queryDateToInput,
  relativePastDateInput,
  usageFiltersFromSearchParams,
  usageLogsHref,
  usageSearchParams,
} from './adminLogQueryParams'

test('pageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(pageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(pageFromSearchParams(new URLSearchParams('page=3')), 3)
  assert.equal(pageFromSearchParams(new URLSearchParams('page=3.8')), 3)
  assert.equal(pageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(pageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('queryDateToInput converts RFC3339 timestamps into datetime-local shape', () => {
  const got = queryDateToInput('2026-05-16T03:20:45Z')
  assert.match(got, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  assert.equal(queryDateToInput('not-a-date'), 'not-a-date')
  assert.equal(queryDateToInput(''), '')
})

test('date helpers produce datetime-local query values', () => {
  const now = new Date(2026, 4, 16, 13, 5, 45)
  assert.equal(dateToQueryInput(now), '2026-05-16T13:05')
  assert.equal(relativePastDateInput(7, now), '2026-05-09T13:05')
})

test('audit filters parse and serialize URL search params', () => {
  const filters = auditFiltersFromSearchParams(new URLSearchParams('actor_id=7&target_type=resource&target_id=9&org_id=3&project_id=4&action=resource.admin_deleted&page=2'))
  assert.equal(filters.actorId, '7')
  assert.equal(filters.targetType, 'resource')
  assert.equal(filters.targetId, '9')
  assert.equal(filters.orgId, '3')
  assert.equal(filters.projectId, '4')
  assert.equal(filters.action, 'resource.admin_deleted')

  const serialized = auditSearchParams({ ...emptyAuditLogFilters, actorId: ' 7 ', orgId: ' 3 ', projectId: '4' }, 2)
  assert.equal(serialized.toString(), 'actor_id=7&org_id=3&project_id=4&page=2')
})

test('usage filters parse and serialize URL search params', () => {
  const filters = usageFiltersFromSearchParams(new URLSearchParams('provider_id=1&model_config_id=2&operation_type=image&user_id=7&org_id=3&project_id=4&gateway_api_key_id=9&page=2'))
  assert.equal(filters.providerId, '1')
  assert.equal(filters.modelConfigId, '2')
  assert.equal(filters.operationType, 'image')
  assert.equal(filters.userId, '7')
  assert.equal(filters.orgId, '3')
  assert.equal(filters.projectId, '4')
  assert.equal(filters.gatewayApiKeyId, '9')

  const serialized = usageSearchParams({ ...emptyUsageFilters, userId: ' 7 ', orgId: '3', gatewayApiKeyId: ' 9 ', operationType: 'text' }, 1)
  assert.equal(serialized.toString(), 'operation_type=text&user_id=7&org_id=3&gateway_api_key_id=9')
})

test('log href helpers serialize filters and omit empty values', () => {
  assert.equal(auditLogsHref(), '/audit-logs')
  assert.equal(
    auditLogsHref({ targetType: 'model_gateway_api_key', targetId: 21, orgId: 9, projectId: undefined }),
    '/audit-logs?target_type=model_gateway_api_key&target_id=21&org_id=9',
  )
  assert.equal(
    auditLogsHref({ actorId: ' 7 ', action: 'org.member_added' }, 2),
    '/audit-logs?actor_id=7&action=org.member_added&page=2',
  )

  assert.equal(usageLogsHref(), '/usage-logs')
  assert.equal(
    usageLogsHref({ userId: ' 7 ', orgId: 3, gatewayApiKeyId: 21 }),
    '/usage-logs?user_id=7&org_id=3&gateway_api_key_id=21',
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  auditFiltersFromSearchParams,
  auditSearchParams,
  emptyAuditLogFilters,
  emptyUsageFilters,
  pageFromSearchParams,
  queryDateToInput,
  usageFiltersFromSearchParams,
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
  const filters = usageFiltersFromSearchParams(new URLSearchParams('provider_id=1&model_config_id=2&operation_type=image&user_id=7&org_id=3&project_id=4&page=2'))
  assert.equal(filters.providerId, '1')
  assert.equal(filters.modelConfigId, '2')
  assert.equal(filters.operationType, 'image')
  assert.equal(filters.userId, '7')
  assert.equal(filters.orgId, '3')
  assert.equal(filters.projectId, '4')

  const serialized = usageSearchParams({ ...emptyUsageFilters, userId: ' 7 ', orgId: '3', operationType: 'text' }, 1)
  assert.equal(serialized.toString(), 'operation_type=text&user_id=7&org_id=3')
})

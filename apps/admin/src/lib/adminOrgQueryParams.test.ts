import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyOrgListFilters,
  orgFiltersFromSearchParams,
  orgListHref,
  orgPageFromSearchParams,
  orgSearchParams,
} from './adminOrgQueryParams'

test('orgPageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(orgPageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(orgPageFromSearchParams(new URLSearchParams('page=6')), 6)
  assert.equal(orgPageFromSearchParams(new URLSearchParams('page=6.7')), 6)
  assert.equal(orgPageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(orgPageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('orgFiltersFromSearchParams parses org list filters', () => {
  const filters = orgFiltersFromSearchParams(new URLSearchParams('q=studio&org_id=12&plan=team&status=active&is_personal=false'))

  assert.deepEqual(filters, {
    query: 'studio',
    orgId: '12',
    plan: 'team',
    status: 'active',
    isPersonal: 'false',
  })
})

test('orgSearchParams trims values and omits empty defaults', () => {
  const params = orgSearchParams({
    ...emptyOrgListFilters,
    query: ' studio ',
    orgId: ' 12 ',
    isPersonal: 'false',
  }, 2)

  assert.equal(params.toString(), 'q=studio&org_id=12&is_personal=false&page=2')
})

test('orgListHref creates shareable admin org links', () => {
  assert.equal(orgListHref({ orgId: 12, plan: 'team', isPersonal: false }), '/orgs?org_id=12&plan=team&is_personal=false')
  assert.equal(orgListHref({}, 1), '/orgs')
})

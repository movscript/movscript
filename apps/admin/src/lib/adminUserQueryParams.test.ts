import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyUserListFilters,
  userFiltersFromSearchParams,
  userListHref,
  userPageFromSearchParams,
  userSearchParams,
} from './adminUserQueryParams'

test('userPageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(userPageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(userPageFromSearchParams(new URLSearchParams('page=5')), 5)
  assert.equal(userPageFromSearchParams(new URLSearchParams('page=5.8')), 5)
  assert.equal(userPageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(userPageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('userFiltersFromSearchParams parses user list filters', () => {
  const filters = userFiltersFromSearchParams(new URLSearchParams('q=alice&user_id=7&system_role=super_admin&status=disabled'))

  assert.deepEqual(filters, {
    query: 'alice',
    userId: '7',
    systemRole: 'super_admin',
    status: 'disabled',
  })
})

test('userSearchParams trims values and omits empty defaults', () => {
  const params = userSearchParams({
    ...emptyUserListFilters,
    query: ' alice ',
    userId: ' 7 ',
    status: 'active',
  }, 3)

  assert.equal(params.toString(), 'q=alice&user_id=7&status=active&page=3')
})

test('userListHref creates shareable admin user links', () => {
  assert.equal(userListHref({ userId: 7, systemRole: 'super_admin', status: 'active' }), '/user-management?user_id=7&system_role=super_admin&status=active')
  assert.equal(userListHref({}, 1), '/user-management')
})

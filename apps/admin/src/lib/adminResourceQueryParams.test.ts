import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyResourceListFilters,
  resourceFiltersFromSearchParams,
  resourceListHref,
  resourcePageFromSearchParams,
  resourceSearchParams,
} from './adminResourceQueryParams'

test('resourcePageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(resourcePageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(resourcePageFromSearchParams(new URLSearchParams('page=7')), 7)
  assert.equal(resourcePageFromSearchParams(new URLSearchParams('page=7.4')), 7)
  assert.equal(resourcePageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(resourcePageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('resourceFiltersFromSearchParams parses storage resource filters', () => {
  const filters = resourceFiltersFromSearchParams(new URLSearchParams('q=poster&type=image&storage_backend=local&user_id=7&org_id=null'))

  assert.deepEqual(filters, {
    q: 'poster',
    type: 'image',
    storageBackend: 'local',
    userId: '7',
    orgId: 'null',
  })
})

test('resourceSearchParams trims values and omits empty defaults', () => {
  const params = resourceSearchParams({
    ...emptyResourceListFilters,
    q: ' poster ',
    type: 'image',
    orgId: ' null ',
  }, 2)

  assert.equal(params.toString(), 'q=poster&type=image&org_id=null&page=2')
})

test('resourceListHref creates shareable storage links', () => {
  assert.equal(resourceListHref({ userId: 7, storageBackend: 'local' }), '/storage?storage_backend=local&user_id=7')
  assert.equal(resourceListHref({}, 1), '/storage')
})

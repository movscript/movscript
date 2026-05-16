import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyProjectListFilters,
  projectFiltersFromSearchParams,
  projectListHref,
  projectPageFromSearchParams,
  projectSearchParams,
} from './adminProjectQueryParams'

test('projectPageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(projectPageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(projectPageFromSearchParams(new URLSearchParams('page=4')), 4)
  assert.equal(projectPageFromSearchParams(new URLSearchParams('page=4.9')), 4)
  assert.equal(projectPageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(projectPageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('projectFiltersFromSearchParams parses project list filters', () => {
  const filters = projectFiltersFromSearchParams(new URLSearchParams('q=promo&project_id=11&status=editing&owner_id=7&org_id=3'))

  assert.deepEqual(filters, {
    query: 'promo',
    projectId: '11',
    status: 'editing',
    ownerId: '7',
    orgId: '3',
  })
})

test('projectSearchParams trims values and omits empty defaults', () => {
  const params = projectSearchParams({
    ...emptyProjectListFilters,
    query: '  show ',
    projectId: ' 11 ',
    status: 'editing',
    ownerId: ' 7 ',
  }, 2)

  assert.equal(params.toString(), 'q=show&project_id=11&status=editing&owner_id=7&page=2')
})

test('projectListHref creates shareable admin project links', () => {
  assert.equal(projectListHref({ projectId: 11 }), '/projects?project_id=11')
  assert.equal(projectListHref({ orgId: 9, status: 'production' }), '/projects?status=production&org_id=9')
  assert.equal(projectListHref({}, 1), '/projects')
})

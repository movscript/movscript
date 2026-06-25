import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectHomeHrefForProject,
  projectHostHref,
  projectRouteContext,
  projectRouteHref,
  projectSurfaceHrefForLocalProject,
} from './localRouteLinks'

test('local project home href opens the canonical studio overview route', () => {
  const baseQuery = new URLSearchParams({
    projectDir: '/stale/project',
    projectServiceBaseURL: 'http://127.0.0.1:4101',
  })

  const href = projectHomeHrefForProject({
    ID: 7,
    name: 'Rain Night',
    project_uid: 'proj_uid_7',
    workspace_path: '/tmp/rain-night',
  }, baseQuery)
  const url = new URL(href, 'http://localhost')

  assert.equal(url.pathname, '/studio/7/overview')
  assert.equal(url.searchParams.get('projectDir'), '/tmp/rain-night')
  assert.equal(url.searchParams.get('projectUid'), 'proj_uid_7')
  assert.equal(url.searchParams.get('projectId'), '7')
  assert.equal(url.searchParams.get('projectName'), 'Rain Night')
  assert.equal(url.searchParams.get('projectServiceBaseURL'), 'http://127.0.0.1:4101')
})

test('local project route href uses project uid when no numeric id is available', () => {
  const href = projectSurfaceHrefForLocalProject({
    ID: 0,
    name: 'UID Project',
    project_uid: 'proj_uid_only',
    project_path: '/tmp/uid-project',
  }, 'scripts', new URLSearchParams())
  const url = new URL(href, 'http://localhost')

  assert.equal(url.pathname, '/studio/proj_uid_only/scripts')
  assert.equal(url.searchParams.get('projectDir'), '/tmp/uid-project')
  assert.equal(url.searchParams.get('projectUid'), 'proj_uid_only')
  assert.equal(url.searchParams.has('projectId'), false)
})

test('local route helpers require canonical project-id-first studio urls', () => {
  const canonical = projectRouteContext(
    '/studio/7/overview',
    new URLSearchParams('projectDir=/tmp/rain-night'),
  )
  assert.equal(canonical.route?.key, 'overview')
  assert.equal(canonical.projectId, '7')
  assert.equal(canonical.projectDir, '/tmp/rain-night')

  const segmentFirst = projectRouteContext(
    '/studio/scripts',
    new URLSearchParams('projectDir=/tmp/rain-night'),
  )
  assert.equal(segmentFirst.route, undefined)
  assert.equal(segmentFirst.projectId, 'scripts')
  assert.equal(segmentFirst.projectDir, '/tmp/rain-night')
})

test('local project route hrefs include the project id path segment', () => {
  assert.equal(
    projectHostHref('7', new URLSearchParams()).split('?')[0],
    '/studio/7/overview',
  )
  assert.equal(
    projectRouteHref('scripts', '7', new URLSearchParams()).split('?')[0],
    '/studio/7/scripts',
  )
})

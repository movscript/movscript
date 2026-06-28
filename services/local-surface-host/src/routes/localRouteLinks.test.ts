import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeTimelineFocusQuery,
  projectHomeHrefForProject,
  projectHostHref,
  projectRouteContext,
  projectRouteHref,
  projectSurfaceHrefForLocalProject,
} from './localRouteLinks'

test('local project home href opens the canonical studio overview route without direct service urls', () => {
  const baseQuery = new URLSearchParams({
    projectDir: '/stale/project',
    projectServiceBaseURL: 'http://127.0.0.1:4101',
    projectServiceURL: 'http://127.0.0.1:4102',
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
  assert.equal(url.searchParams.has('projectServiceBaseURL'), false)
  assert.equal(url.searchParams.has('projectServiceURL'), false)
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

  const multiSegment = projectRouteContext(
    '/studio/7/settings/preview',
    new URLSearchParams('projectDir=/tmp/rain-night'),
  )
  assert.equal(multiSegment.route?.key, 'settingPreview')
  assert.equal(multiSegment.projectId, '7')
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

test('local route context derives legacy production id from normalized timeline focus', () => {
  const scoped = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectDir=/tmp/rain-night&scopeKind=production&scopeRef=pilot'),
  )
  assert.equal(scoped.productionId, 'pilot')
  assert.equal(scoped.domainFocus.scope?.kind, 'production')
  assert.equal(scoped.domainFocus.scope?.ref, 'pilot')
  assert.equal(scoped.domainFocus.target?.targetKind, 'timeline_assembly')
  assert.equal(scoped.domainFocus.target?.targetRef, 'timeline_assembly:production:pilot')

  const assembly = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectDir=/tmp/rain-night&targetKind=timeline_assembly&targetRef=timeline_assembly:production:pilot-final'),
  )
  assert.equal(assembly.productionId, 'pilot-final')
  assert.equal(assembly.domainFocus.scope?.kind, 'production')
  assert.equal(assembly.domainFocus.scope?.ref, 'pilot-final')
  assert.equal(assembly.domainFocus.target?.targetRef, 'timeline_assembly:production:pilot-final')

  const alias = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectDir=/tmp/rain-night&timeline_assembly_ref=timeline_assembly:production:pilot-alias'),
  )
  assert.equal(alias.productionId, 'pilot-alias')
  assert.equal(alias.domainFocus.target?.targetRef, 'timeline_assembly:production:pilot-alias')
})

test('local route context treats non-production timeline focus as canonical over stale production query', () => {
  const scoped = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectDir=/tmp/rain-night&productionId=pilot&scopeKind=episode&scopeRef=episode_01'),
  )
  assert.equal(scoped.productionId, undefined)
  assert.equal(scoped.domainFocus.scope?.kind, 'episode')
  assert.equal(scoped.domainFocus.scope?.ref, 'episode_01')
  assert.equal(scoped.domainFocus.target?.targetKind, 'timeline_assembly')
  assert.equal(scoped.domainFocus.target?.targetRef, 'timeline_assembly:episode:episode_01')

  const alias = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectDir=/tmp/rain-night&productionId=pilot&timeline_assembly_ref=timeline_assembly:episode:episode_01'),
  )
  assert.equal(alias.productionId, undefined)
  assert.equal(alias.domainFocus.scope?.kind, 'episode')

  const query = new URLSearchParams('productionId=pilot&scopeKind=episode&scopeRef=episode_01')
  normalizeTimelineFocusQuery(query)
  assert.equal(query.get('productionId'), null)
  assert.equal(query.get('scopeKind'), 'episode')
  assert.equal(query.get('scopeRef'), 'episode_01')
})

test('local project href normalizes timeline focus while preserving production compatibility', () => {
  const staleHref = projectSurfaceHrefForLocalProject({
    ID: 7,
    name: 'Rain Night',
    workspace_path: '/tmp/rain-night',
  }, 'contentPreview', new URLSearchParams('productionId=pilot'), {
    scopeKind: 'episode',
    scopeRef: 'episode_01',
  })
  const staleUrl = new URL(staleHref, 'http://localhost')
  assert.equal(staleUrl.searchParams.get('productionId'), null)
  assert.equal(staleUrl.searchParams.get('scopeKind'), 'episode')
  assert.equal(staleUrl.searchParams.get('scopeRef'), 'episode_01')

  const productionHref = projectRouteHref(
    'preview',
    '7',
    new URLSearchParams('scopeKind=production&scopeRef=pilot'),
  )
  const productionUrl = new URL(productionHref, 'http://localhost')
  assert.equal(productionUrl.searchParams.get('productionId'), 'pilot')
  assert.equal(productionUrl.searchParams.get('scopeKind'), 'production')
  assert.equal(productionUrl.searchParams.get('scopeRef'), 'pilot')
})

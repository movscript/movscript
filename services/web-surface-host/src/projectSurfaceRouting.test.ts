import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeTimelineFocusQuery,
  projectRouteContext,
  webProjectSurfaceHref,
} from './projectSurfaceRouting'

test('web route context resolves multi-segment project routes', () => {
  const context = projectRouteContext(
    '/studio/7/settings/preview',
    new URLSearchParams('projectId=7'),
  )

  assert.equal(context.route?.key, 'settingPreview')
  assert.equal(context.projectId, '7')
})

test('web route context preserves non-production timeline focus over stale production query', () => {
  const context = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectId=7&productionId=pilot&scopeKind=episode&scopeRef=episode_01'),
  )

  assert.equal(context.projectId, '7')
  assert.equal(context.productionId, undefined)
  assert.equal(context.domainFocus.scope?.kind, 'episode')
  assert.equal(context.domainFocus.scope?.ref, 'episode_01')
  assert.equal(context.domainFocus.target, undefined)
})

test('web route context derives legacy production from normalized production scope', () => {
  const production = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectId=7&scopeKind=production&scopeRef=pilot'),
  )
  assert.equal(production.productionId, 'pilot')
  assert.equal(production.domainFocus.target, undefined)

  const episode = projectRouteContext(
    '/studio/7/preview',
    new URLSearchParams('projectId=7&productionId=pilot&scopeKind=episode&scopeRef=episode_01'),
  )
  assert.equal(episode.productionId, undefined)
  assert.equal(episode.domainFocus.scope?.kind, 'episode')
})

test('web project surface href normalizes focus query while preserving production compatibility', () => {
  const episodeHref = webProjectSurfaceHref({
    route: 'contentPreview',
    projectId: '7',
    search: new URLSearchParams('productionId=pilot&scopeKind=episode&scopeRef=episode_01'),
  })
  const episodeUrl = new URL(episodeHref, 'http://localhost')
  assert.equal(episodeUrl.searchParams.get('productionId'), null)
  assert.equal(episodeUrl.searchParams.get('scopeKind'), 'episode')
  assert.equal(episodeUrl.searchParams.get('scopeRef'), 'episode_01')

  const productionQuery = new URLSearchParams('scopeKind=production&scopeRef=pilot')
  normalizeTimelineFocusQuery(productionQuery)
  assert.equal(productionQuery.get('productionId'), 'pilot')
})

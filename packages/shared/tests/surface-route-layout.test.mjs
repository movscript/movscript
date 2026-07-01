import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sharedSurfaceAreaForPathname,
  sharedSurfacePrimaryNavItems,
  sharedSurfacePrimaryNavKeyForPathname,
  sharedSurfaceRouteDefinitions,
  sharedSurfaceRouteForPathname,
  sharedSurfaceRouteForRouteId,
} from '../dist/index.js'

test('shared surface primary navigation keeps the four user mental models', () => {
  assert.deepEqual(sharedSurfacePrimaryNavItems.map((item) => item.key), [
    'project',
    'workflow',
    'tool',
    'editing',
  ])
})

test('shared surface route definitions keep canonical route ids unique', () => {
  const routeIds = sharedSurfaceRouteDefinitions.map((definition) => definition.routeId)
  assert.equal(new Set(routeIds).size, routeIds.length)
})

test('shared surface route aliases map desktop and local paths to the same mental model', () => {
  assert.equal(sharedSurfaceRouteForRouteId('project.home')?.routeId, 'project.overview')
  assert.equal(sharedSurfaceRouteForRouteId('studio.contentCanvas')?.routeId, 'project.content.canvas')
  assert.equal(sharedSurfaceRouteForRouteId('tools.privateAssets')?.routeId, 'tools.provider')

  assert.equal(sharedSurfaceAreaForPathname('/project/content/canvas', { host: 'desktop' }), 'workflow')
  assert.equal(sharedSurfacePrimaryNavKeyForPathname('/studio', { host: 'local-web' }), 'project')
  assert.equal(sharedSurfaceAreaForPathname('/studio/demo/content/canvas', { host: 'local-web' }), 'workflow')
  assert.equal(sharedSurfacePrimaryNavKeyForPathname('/studio/demo/content/canvas', { host: 'local-web' }), 'workflow')
  assert.equal(sharedSurfacePrimaryNavKeyForPathname('/canvases/abc', { host: 'desktop' }), 'workflow')

  assert.equal(sharedSurfaceAreaForPathname('/editing', { host: 'desktop' }), 'editing')
  assert.equal(sharedSurfaceAreaForPathname('/editing/demo-edit', { host: 'local-web' }), 'editing')

  assert.equal(sharedSurfaceAreaForPathname('/tools/image', { host: 'local-web' }), 'tool')
  assert.equal(sharedSurfaceAreaForPathname('/tools/video', { host: 'local-web' }), 'tool')
  assert.equal(sharedSurfaceAreaForPathname('/tools/audio', { host: 'local-web' }), 'tool')
  assert.equal(sharedSurfacePrimaryNavKeyForPathname('/resources', { host: 'desktop' }), 'tool')
  assert.equal(sharedSurfacePrimaryNavKeyForPathname('/resources/external', { host: 'local-web' }), 'tool')
})

test('agent browser surfaces stay outside the primary four-way navigation', () => {
  const agentRoute = sharedSurfaceRouteForPathname('/agent/resources/42', { host: 'desktop' })
  assert.equal(agentRoute?.area, 'agent')
  assert.equal(agentRoute?.primaryNavKey, undefined)
})

test('shared surface layout owns local flush frame decisions for standalone workspaces', () => {
  assert.equal(sharedSurfaceRouteForPathname('/editing/demo-edit', { host: 'local-web' })?.shellLayout, 'flush')
  assert.equal(sharedSurfaceRouteForPathname('/agent/resources/42', { host: 'local-web' })?.shellLayout, 'flush')
  assert.equal(sharedSurfaceRouteForPathname('/canvases/42', { host: 'local-web' })?.shellLayout, 'flush')
})

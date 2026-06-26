import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROJECT_SURFACE_ROUTES,
  projectSurfaceDescriptor,
  projectSurfacePath,
} from '../dist/index.js'

test('project surface exposes studio routes independent of legacy agent routes', () => {
  assert.equal(PROJECT_SURFACE_ROUTES.overview, '/studio/:projectId/overview')
  assert.equal(PROJECT_SURFACE_ROUTES.progress, '/studio/:projectId/progress')
  assert.equal(PROJECT_SURFACE_ROUTES.dailies, '/studio/:projectId/dailies')
  assert.equal(PROJECT_SURFACE_ROUTES.scripts, '/studio/:projectId/scripts')
  assert.equal(PROJECT_SURFACE_ROUTES.standards, '/studio/:projectId/standards')
  assert.equal(PROJECT_SURFACE_ROUTES.content, '/studio/:projectId/content')
  assert.equal(PROJECT_SURFACE_ROUTES.contentCanvas, '/studio/:projectId/content/canvas')
  assert.equal(PROJECT_SURFACE_ROUTES.contentPreview, '/studio/:projectId/content/preview')
  assert.equal(projectSurfacePath('overview', 'rain/night'), '/studio/rain%2Fnight/overview')
  assert.equal(projectSurfacePath('scripts', 'rain/night'), '/studio/rain%2Fnight/scripts')
  assert.equal(projectSurfacePath('standards', 'rain/night'), '/studio/rain%2Fnight/standards')
  assert.equal(projectSurfacePath('content', 'rain/night'), '/studio/rain%2Fnight/content')
  assert.equal(projectSurfacePath('contentCanvas', 'rain/night'), '/studio/rain%2Fnight/content/canvas')
  assert.equal(projectSurfacePath('contentPreview', 'rain/night'), '/studio/rain%2Fnight/content/preview')
  assert.equal(projectSurfacePath('impact', 'rain/night'), '/studio/rain%2Fnight/impact')
})

test('project surface descriptor carries host-neutral project intent', () => {
  assert.deepEqual(
    projectSurfaceDescriptor({
      surface: 'dailies',
      projectId: 'chang-an-rain-night',
      params: { contentUnitId: '04_chase_video' },
      reason: 'review candidates',
      source: 'agent',
    }),
    {
      scope: 'project',
      surface: 'dailies',
      projectId: 'chang-an-rain-night',
      params: { contentUnitId: '04_chase_video' },
      reason: 'review candidates',
      source: 'agent',
    },
  )
})

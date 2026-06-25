import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_SURFACE_ROUTES,
  adminSurfaceDescriptor,
  adminSurfacePath,
} from '../dist-lib/index.js'

test('admin surface exposes management routes independently of project routes', () => {
  assert.equal(ADMIN_SURFACE_ROUTES.overview, '/admin/overview')
  assert.equal(ADMIN_SURFACE_ROUTES.jobTrace, '/admin/jobs/:jobId')
  assert.equal(adminSurfacePath('jobTrace', { jobId: 'job 9' }), '/admin/jobs/job%209')
})

test('admin surface descriptor carries host-neutral admin intent', () => {
  assert.deepEqual(
    adminSurfaceDescriptor({
      surface: 'agents',
      params: { status: 'running' },
      reason: 'inspect agent queue',
      source: 'desktop',
    }),
    {
      scope: 'admin',
      surface: 'agents',
      params: { status: 'running' },
      reason: 'inspect agent queue',
      source: 'desktop',
    },
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  desktopProjectSurfaceHref,
  desktopProjectSurfacePath,
} from './desktopProjectSurfaceRuntime'

test('desktop project surface adapter keeps the Desktop project home UI route', () => {
  assert.equal(desktopProjectSurfacePath('overview', 'proj_uid_7'), '/project/home')
  assert.equal(desktopProjectSurfacePath('scripts', 'proj_uid_7'), '/project/scripts/workbench')
  assert.equal(desktopProjectSurfacePath('standards', 'proj_uid_7'), '/project/standards')
  assert.equal(desktopProjectSurfacePath('content', 'proj_uid_7'), '/project/content')
  assert.equal(desktopProjectSurfacePath('settings', 'proj_uid_7'), '/project/settings')
})

test('desktop project surface adapter uses canonical studio routes for newer surfaces', () => {
  assert.equal(desktopProjectSurfacePath('impact', 'proj_uid_7'), '/studio/proj_uid_7/impact')
  assert.equal(
    desktopProjectSurfaceHref('dailies', 'rain/night', { contentUnitId: 'scene 1' }),
    '/studio/rain%2Fnight/dailies?contentUnitId=scene+1',
  )
})

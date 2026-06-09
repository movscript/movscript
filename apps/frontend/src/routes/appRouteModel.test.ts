import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasBackPath,
  canvasEditorPath,
  canvasListPathForSource,
  canvasRouteSourceFromSearch,
  getAppRouteSurface,
  routeForWorkMode,
  workModeForRoute,
} from './appRouteModel'

test('app route surface is derived from pathname instead of the saved work mode', () => {
  assert.equal(getAppRouteSurface('/project/agent'), 'agent')
  assert.equal(getAppRouteSurface('/project/agent/canvases'), 'agent')
  assert.equal(getAppRouteSurface('/project/overview'), 'detail')
  assert.equal(getAppRouteSurface('/canvases'), 'detail')
  assert.equal(getAppRouteSurface('/canvases/42'), 'canvas')
})

test('work mode route helpers keep canvas as a temporary surface', () => {
  assert.equal(workModeForRoute('/project/agent', 'detail'), 'agent')
  assert.equal(workModeForRoute('/project/overview', 'agent'), 'detail')
  assert.equal(workModeForRoute('/canvases/42', 'agent'), 'agent')
  assert.equal(routeForWorkMode('agent', true), '/project/agent')
  assert.equal(routeForWorkMode('detail', true), '/project/scripts/workbench')
  assert.equal(routeForWorkMode('agent', false), '/project/agent')
  assert.equal(routeForWorkMode('detail', false), '/')
})

test('canvas routes preserve their originating surface for back navigation', () => {
  assert.equal(canvasEditorPath(88, { source: 'detail' }), '/canvases/88')
  assert.equal(canvasEditorPath(88, { source: 'agent' }), '/canvases/88?from=agent')
  assert.equal(canvasRouteSourceFromSearch('?from=agent'), 'agent')
  assert.equal(canvasRouteSourceFromSearch('?from=detail'), 'detail')
  assert.equal(canvasListPathForSource('agent'), '/project/agent/canvases')
  assert.equal(canvasListPathForSource('detail'), '/canvases')
  assert.equal(canvasBackPath('?from=agent'), '/project/agent/canvases')
  assert.equal(canvasBackPath(''), '/canvases')
})

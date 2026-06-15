import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasBackPath,
  canvasEditorPath,
  canvasListPathForSource,
  canvasRouteSourceFromSearch,
  getAppRouteLayoutSpec,
  routeForWorkMode,
  workModeForRoute,
} from './appRouteModel'

test('app route layout spec is derived from pathname instead of the saved work mode', () => {
  assert.equal(getAppRouteLayoutSpec('/project/agent').surface, 'agent')
  assert.equal(getAppRouteLayoutSpec('/project/agent/canvases').surface, 'agent')
  assert.equal(getAppRouteLayoutSpec('/').surface, 'home')
  assert.equal(getAppRouteLayoutSpec('/project').kind, 'redirect')
  assert.equal(getAppRouteLayoutSpec('/project/home').surface, 'project')
  assert.equal(getAppRouteLayoutSpec('/project/scripts/workbench').surface, 'project')
  assert.equal(getAppRouteLayoutSpec('/canvases').surface, 'canvas')
  assert.equal(getAppRouteLayoutSpec('/tools/ref-image-gen').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/canvases/42').surface, 'canvas')
  assert.equal(getAppRouteLayoutSpec('/app/settings').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/app/settings').chrome, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').chrome, 'agent')
})

test('work mode route helpers keep canvas as a temporary surface', () => {
  assert.equal(workModeForRoute('/project/agent', 'project'), 'agent')
  assert.equal(workModeForRoute('/project/scripts/workbench', 'agent'), 'project')
  assert.equal(workModeForRoute('/canvases/42', 'agent'), 'agent')
  assert.equal(workModeForRoute('/app/settings', 'agent'), 'agent')
  assert.equal(workModeForRoute('/agent/settings', 'agent'), 'agent')
  assert.equal(workModeForRoute('/agent', 'project'), 'project')
  assert.equal(routeForWorkMode('agent', true), '/project/agent')
  assert.equal(routeForWorkMode('project', true), '/project/home')
  assert.equal(routeForWorkMode('tool', true), '/tools/ref-image-gen')
  assert.equal(routeForWorkMode('agent', false), '/project/agent')
  assert.equal(routeForWorkMode('project', false), '/projects')
  assert.equal(routeForWorkMode('tool', false), '/tools/ref-image-gen')
})

test('canvas routes preserve their originating surface for back navigation', () => {
  assert.equal(canvasEditorPath(88, { source: 'tool' }), '/canvases/88')
  assert.equal(canvasEditorPath(88, { source: 'agent' }), '/canvases/88?from=agent')
  assert.equal(canvasEditorPath(88, { source: 'project' }), '/canvases/88?from=project')
  assert.equal(canvasRouteSourceFromSearch('?from=agent'), 'agent')
  assert.equal(canvasRouteSourceFromSearch('?from=project'), 'project')
  assert.equal(canvasListPathForSource('agent'), '/project/agent/canvases')
  assert.equal(canvasListPathForSource('project'), '/project/home')
  assert.equal(canvasListPathForSource('tool'), '/canvases')
  assert.equal(canvasBackPath('?from=agent'), '/project/agent/canvases')
  assert.equal(canvasBackPath('?from=project'), '/project/home')
  assert.equal(canvasBackPath(''), '/canvases')
})

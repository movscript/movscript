import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasBackPath,
  canvasEditorPath,
  canvasListPathForSource,
  canvasRouteSourceFromSearch,
  editingProjectPath,
  getAppRouteLayoutSpec,
  routeForWorkMode,
  workModeForRoute,
} from './appRouteModel'

test('app route layout spec is derived from pathname instead of the saved work mode', () => {
  assert.equal(getAppRouteLayoutSpec('/project/agent').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/project/agent').routeId, 'fallback')
  assert.equal(getAppRouteLayoutSpec('/project/agent/canvases').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/project/agent/canvases').routeId, 'fallback')
  assert.equal(getAppRouteLayoutSpec('/').surface, 'home')
  assert.equal(getAppRouteLayoutSpec('/project').kind, 'redirect')
  assert.equal(getAppRouteLayoutSpec('/project/home').surface, 'project')
  assert.equal(getAppRouteLayoutSpec('/project/scripts/workbench').surface, 'project')
  assert.equal(getAppRouteLayoutSpec('/canvases').surface, 'canvas')
  assert.equal(getAppRouteLayoutSpec('/tools/ref-image-gen').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/canvases/42').surface, 'canvas')
  assert.equal(getAppRouteLayoutSpec('/app/settings').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/app/settings').chrome, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').routeId, 'fallback')
  assert.equal(getAppRouteLayoutSpec('/agents/mova').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/agents/mova').routeId, 'fallback')
})

test('work mode route helpers keep canvas as a temporary surface', () => {
  assert.equal(workModeForRoute('/project/agent', 'project'), 'tool')
  assert.equal(workModeForRoute('/project/scripts/workbench', 'agent'), 'project')
  assert.equal(workModeForRoute('/resources', 'project'), 'tool')
  assert.equal(workModeForRoute('/resources/external', 'project'), 'tool')
  assert.equal(workModeForRoute('/canvases/42', 'agent'), 'agent')
  assert.equal(workModeForRoute('/app/settings', 'agent'), 'agent')
  assert.equal(workModeForRoute('/agent/settings', 'agent'), 'tool')
  assert.equal(workModeForRoute('/agents/mova', 'tool'), 'tool')
  assert.equal(workModeForRoute('/agents/codex', 'project'), 'tool')
  assert.equal(workModeForRoute('/agent', 'project'), 'tool')
  assert.equal(routeForWorkMode('agent', true), '/project/home')
  assert.equal(routeForWorkMode('project', true), '/project/home')
  assert.equal(routeForWorkMode('tool', true), '/tools/ref-image-gen')
  assert.equal(routeForWorkMode('agent', false), '/projects')
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

test('editing project paths are standalone tool routes', () => {
  assert.equal(editingProjectPath('editing project/42'), '/editing/editing%20project%2F42')
  assert.equal(getAppRouteLayoutSpec('/editing/editing_project_42').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/editing/editing_project_42').projectEntryId, undefined)
})

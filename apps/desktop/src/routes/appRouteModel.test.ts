import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasBackPath,
  canvasEditorPath,
  canvasListPathForSource,
  canvasRouteSourceFromSearch,
  editingProjectPath,
  getAppRouteLayoutSpec,
  getAppSharedSurfaceRoute,
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
  assert.equal(getAppRouteLayoutSpec('/tools/image').surface, 'tool')
  assert.equal(getAppRouteLayoutSpec('/canvases/42').surface, 'canvas')
  assert.equal(getAppRouteLayoutSpec('/app/settings').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/app/settings').chrome, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agent/settings').chrome, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agents/mova').surface, 'settings')
  assert.equal(getAppRouteLayoutSpec('/agents/mova').chrome, 'settings')
})

test('desktop routes expose shared surface identities without changing desktop layout surfaces', () => {
  assert.equal(getAppSharedSurfaceRoute('/project/home')?.routeId, 'project.overview')
  assert.equal(getAppSharedSurfaceRoute('/project/home')?.area, 'project')
  assert.equal(getAppSharedSurfaceRoute('/project/content/canvas')?.routeId, 'project.content.canvas')
  assert.equal(getAppSharedSurfaceRoute('/project/content/canvas')?.area, 'workflow')
  assert.equal(getAppSharedSurfaceRoute('/canvases/42')?.primaryNavKey, 'workflow')
  assert.equal(getAppSharedSurfaceRoute('/editing/editing_project_42')?.area, 'editing')
  assert.equal(getAppRouteLayoutSpec('/editing/editing_project_42').surface, 'tool')
})

test('work mode route helpers keep canvas as a temporary surface', () => {
  assert.equal(workModeForRoute('/project/agent', 'project'), 'agent')
  assert.equal(workModeForRoute('/project/scripts/workbench', 'agent'), 'project')
  assert.equal(workModeForRoute('/resources', 'project'), 'tool')
  assert.equal(workModeForRoute('/resources/external', 'project'), 'tool')
  assert.equal(workModeForRoute('/canvases/42', 'agent'), 'agent')
  assert.equal(workModeForRoute('/app/settings', 'agent'), 'agent')
  assert.equal(workModeForRoute('/agent/settings', 'agent'), 'agent')
  assert.equal(workModeForRoute('/agents/mova', 'tool'), 'tool')
  assert.equal(workModeForRoute('/agents/codex', 'project'), 'project')
  assert.equal(workModeForRoute('/agent', 'project'), 'project')
  assert.equal(routeForWorkMode('agent', true), '/project/agent')
  assert.equal(routeForWorkMode('project', true), '/project/home')
  assert.equal(routeForWorkMode('tool', true), '/tools/image')
  assert.equal(routeForWorkMode('agent', false), '/project/agent')
  assert.equal(routeForWorkMode('project', false), '/projects')
  assert.equal(routeForWorkMode('tool', false), '/tools/image')
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

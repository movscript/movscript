import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProjectWorkbenchReviewParams,
  buildProjectWorkbenchReviewPath,
  getProjectWorkbenchDefinition,
  getProjectWorkbenchDefinitionForWorkspaceKind,
  mergeProjectWorkbenchReviewSearchParams,
  projectWorkbenchDefinitions,
  type ProjectWorkbenchId,
} from './projectWorkbenchRegistry'

test('project workbench definitions cover the canonical workbenches', () => {
  const expectedIds: ProjectWorkbenchId[] = [
    'orchestration_production',
    'content_orchestration',
    'project_standards',
  ]

  assert.deepEqual(projectWorkbenchDefinitions.map((item) => item.id), expectedIds)
  assert.equal(getProjectWorkbenchDefinition('orchestration_production').route, '/project/scripts/workbench')
  assert.equal(getProjectWorkbenchDefinition('content_orchestration').route, '/project/content-units/editor')
  assert.equal(getProjectWorkbenchDefinition('project_standards').route, '/project/standards')
  for (const definition of projectWorkbenchDefinitions) {
    assert.ok(definition.purpose.length > 0, `${definition.id} must document its purpose`)
    assert.ok(definition.decision.length > 0, `${definition.id} must document its decision surface`)
    assert.ok(definition.output.length > 0, `${definition.id} must document its output`)
    assert.ok(definition.sidebarTitleKey.startsWith('sidebar.items.'), `${definition.id} must declare sidebar title key`)
    assert.ok(definition.headerTitleKey.startsWith('header.titles.'), `${definition.id} must declare header title key`)
    assert.ok(definition.owns.length > 0, `${definition.id} must declare owned entities`)
    assert.ok(definition.reads.length > 0, `${definition.id} must declare read dependencies`)
  }
})

test('project workbench definitions own workspace kinds at the correct layer', () => {
  assert.equal(getProjectWorkbenchDefinitionForWorkspaceKind('project_standards_workspace'), null)
  assert.equal(getProjectWorkbenchDefinitionForWorkspaceKind('setting_workspace'), null)
  assert.equal(getProjectWorkbenchDefinitionForWorkspaceKind('asset_workspace'), null)
  assert.equal(getProjectWorkbenchDefinitionForWorkspaceKind('production_workspace'), null)
  assert.equal(getProjectWorkbenchDefinitionForWorkspaceKind('content_unit_workspace')?.id, 'content_orchestration')
})

test('project workbench review paths are generated from review query contracts', () => {
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('project_standards'), { workspaceId: 'workspace-a' }),
    '/project/standards?workspaceId=workspace-a',
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('content_orchestration'), {
      workspaceId: 'workspace-c',
      entityType: 'scene_moment',
      entityId: 77,
    }),
    '/project/content-units/editor?workspaceId=workspace-c&scene_moment_id=77',
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('orchestration_production'), { workspaceId: 'workspace-d' }),
    null,
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('orchestration_production'), {
      workspaceId: 'workspace-d',
      entityType: 'production',
      entityId: 301,
    }),
    '/project/scripts/workbench?view=review&workspaceId=workspace-d&productionId=301',
  )
})

test('project workbench review params can be merged into existing search params', () => {
  assert.deepEqual(
    buildProjectWorkbenchReviewParams(getProjectWorkbenchDefinition('content_orchestration'), {
      workspaceId: 'workspace-b',
      entityType: 'content_unit',
      entityId: 42,
    }),
    { workspaceId: 'workspace-b', content_unit_id: 42 },
  )

  const merged = mergeProjectWorkbenchReviewSearchParams(
    new URLSearchParams('tab=assets&workspaceId=old'),
    getProjectWorkbenchDefinition('content_orchestration'),
    {
      workspaceId: 'workspace-b',
      entityType: 'content_unit',
      entityId: 42,
    },
  )

  assert.equal(merged?.toString(), 'tab=assets&workspaceId=workspace-b&content_unit_id=42')
})

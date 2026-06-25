import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProjectEntryReviewParams,
  buildProjectEntryReviewPath,
  getProjectEntryDefinition,
  mergeProjectEntryReviewSearchParams,
  projectEntryRoutePath,
  projectEntryDefinitions,
  type ProjectEntryId,
} from './projectEntryRegistry'

test('project entry definitions cover the canonical project entries', () => {
  const expectedIds: ProjectEntryId[] = [
    'orchestration_production',
    'content',
    'project_standards',
  ]

  assert.deepEqual(projectEntryDefinitions.map((item) => item.id), expectedIds)
  assert.equal(projectEntryRoutePath(getProjectEntryDefinition('orchestration_production')), '/project/scripts/workbench')
  assert.equal(projectEntryRoutePath(getProjectEntryDefinition('content')), '/project/content')
  assert.equal(projectEntryRoutePath(getProjectEntryDefinition('project_standards')), '/project/standards')
  for (const definition of projectEntryDefinitions) {
    assert.ok(definition.purpose.length > 0, `${definition.id} must document its purpose`)
    assert.ok(definition.decision.length > 0, `${definition.id} must document its decision surface`)
    assert.ok(definition.output.length > 0, `${definition.id} must document its output`)
    assert.ok(definition.sidebarTitleKey.startsWith('sidebar.items.'), `${definition.id} must declare sidebar title key`)
    assert.ok(definition.headerTitleKey.startsWith('header.titles.'), `${definition.id} must declare header title key`)
    assert.ok(definition.owns.length > 0, `${definition.id} must declare owned entities`)
    assert.ok(definition.reads.length > 0, `${definition.id} must declare read dependencies`)
  }
})

test('project entry review paths are generated from review query contracts', () => {
  assert.equal(
    buildProjectEntryReviewPath(getProjectEntryDefinition('project_standards'), { workspaceId: 'workspace-a' }),
    '/project/standards?workspaceId=workspace-a',
  )
  assert.equal(
    buildProjectEntryReviewPath(getProjectEntryDefinition('content'), {
      workspaceId: 'workspace-c',
      entityType: 'scene_moment',
      entityId: 77,
    }),
    '/project/content?workspaceId=workspace-c&scene_moment_id=77',
  )
  assert.equal(
    buildProjectEntryReviewPath(getProjectEntryDefinition('orchestration_production'), { workspaceId: 'workspace-d' }),
    null,
  )
  assert.equal(
    buildProjectEntryReviewPath(getProjectEntryDefinition('orchestration_production'), {
      workspaceId: 'workspace-d',
      entityType: 'production',
      entityId: 301,
    }),
    '/project/scripts/workbench?view=review&workspaceId=workspace-d&productionId=301',
  )
})

test('project entry review params can be merged into existing search params', () => {
  assert.deepEqual(
    buildProjectEntryReviewParams(getProjectEntryDefinition('content'), {
      workspaceId: 'workspace-b',
      entityType: 'content_unit',
      entityId: 42,
    }),
    { workspaceId: 'workspace-b', content_unit_id: 42 },
  )

  const merged = mergeProjectEntryReviewSearchParams(
    new URLSearchParams('tab=assets&workspaceId=old'),
    getProjectEntryDefinition('content'),
    {
      workspaceId: 'workspace-b',
      entityType: 'content_unit',
      entityId: 42,
    },
  )

  assert.equal(merged?.toString(), 'tab=assets&workspaceId=workspace-b&content_unit_id=42')
})

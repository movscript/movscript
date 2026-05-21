import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProjectWorkbenchReviewParams,
  buildProjectWorkbenchReviewPath,
  getProjectWorkbenchDefinition,
  getProjectWorkbenchDefinitionForProposalKind,
  mergeProjectWorkbenchReviewSearchParams,
  projectWorkbenchDefinitions,
  type ProjectWorkbenchId,
} from './projectSurfaces'

test('project workbench definitions cover the five canonical workbenches', () => {
  const expectedIds: ProjectWorkbenchId[] = [
    'project_standards',
    'pre_production',
    'creative_plan',
    'content_orchestration',
    'delivery',
  ]

  assert.deepEqual(projectWorkbenchDefinitions.map((item) => item.id), expectedIds)
  assert.equal(getProjectWorkbenchDefinition('project_standards').route, '/project/standards')
  assert.equal(getProjectWorkbenchDefinition('pre_production').route, '/project/pre-production')
  assert.equal(getProjectWorkbenchDefinition('creative_plan').route, '/project/production/orchestration')
  assert.equal(getProjectWorkbenchDefinition('content_orchestration').route, '/project/content-units/workbench')
  assert.equal(getProjectWorkbenchDefinition('delivery').route, '/project/delivery/workbench')
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

test('project workbench definitions own proposal kinds at the correct layer', () => {
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('project_standards_proposal')?.id, 'project_standards')
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('setting_proposal')?.id, 'pre_production')
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('asset_proposal')?.id, 'pre_production')
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('production_proposal')?.id, 'creative_plan')
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('content_unit_proposal')?.id, 'content_orchestration')
  assert.equal(getProjectWorkbenchDefinitionForProposalKind('script_split_proposal'), null)
})

test('project workbench review paths are generated from review query contracts', () => {
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('project_standards'), { draftId: 'draft-a' }),
    '/project/standards?draftId=draft-a',
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('pre_production'), {
      draftId: 'draft-b',
      entityType: 'asset_slot',
      entityId: 88,
    }),
    '/project/pre-production?view=review&draftId=draft-b&asset_slot_id=88',
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('content_orchestration'), {
      draftId: 'draft-c',
      entityType: 'scene_moment',
      entityId: 77,
    }),
    '/project/content-units/workbench?view=review&draftId=draft-c&scene_moment_id=77',
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('creative_plan'), { draftId: 'draft-d' }),
    null,
  )
  assert.equal(
    buildProjectWorkbenchReviewPath(getProjectWorkbenchDefinition('creative_plan'), {
      draftId: 'draft-d',
      entityType: 'production',
      entityId: 301,
    }),
    '/project/production/orchestration?productionId=301&draftId=draft-d',
  )
})

test('project workbench review params can be merged into existing search params', () => {
  assert.deepEqual(
    buildProjectWorkbenchReviewParams(getProjectWorkbenchDefinition('pre_production'), {
      draftId: 'draft-b',
      entityType: 'creative_reference',
      entityId: 42,
    }),
    { view: 'review', draftId: 'draft-b', reference_id: 42 },
  )

  const merged = mergeProjectWorkbenchReviewSearchParams(
    new URLSearchParams('tab=assets&draftId=old'),
    getProjectWorkbenchDefinition('pre_production'),
    {
      draftId: 'draft-b',
      entityType: 'creative_reference',
      entityId: 42,
    },
  )

  assert.equal(merged?.toString(), 'tab=assets&draftId=draft-b&view=review&reference_id=42')
})

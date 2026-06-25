import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeProjectEntryArtifactReviewSearchParams,
  resolveProjectEntryWorkspaceReviewSearchParams,
} from './projectWorkspaceReview'

test('project entry workspace review search falls back to seeded workspace id', () => {
  const result = resolveProjectEntryWorkspaceReviewSearchParams(new URLSearchParams('tab=rules'), {
    projectEntryId: 'project_standards',
    workspaceKind: 'project_standards_workspace',
    fallbackWorkspaceId: 'seed-workspace',
  })

  assert.equal(result?.workspaceId, 'seed-workspace')
  assert.equal(result?.searchParams.toString(), 'tab=rules&workspaceId=seed-workspace')
})

test('project entry workspace review search prefers latest matching artifact and entity', () => {
  const result = resolveProjectEntryWorkspaceReviewSearchParams(new URLSearchParams('panel=review'), {
    projectEntryId: 'orchestration_production',
    workspaceKind: 'production_workspace',
    fallbackWorkspaceId: 'seed-workspace',
    artifacts: [
      {
        type: 'workspace',
        workspaceId: 'older-workspace',
        workspaceKind: 'production_workspace',
        target: { entityType: 'production', entityId: 100 },
      },
      {
        type: 'workspace',
        workspaceId: 'latest-workspace',
        workspaceKind: 'production_workspace',
        target: { entityType: 'production', entityId: 301 },
      },
    ],
  })

  assert.equal(result?.workspaceId, 'latest-workspace')
  assert.equal(result?.artifact?.workspaceId, 'latest-workspace')
  assert.equal(result?.searchParams.toString(), 'panel=review&view=review&workspaceId=latest-workspace&productionId=301')
})

test('project entry artifact review search merges related workspace artifacts', () => {
  const result = mergeProjectEntryArtifactReviewSearchParams(new URLSearchParams('kind=all'), {
    projectEntryId: 'content',
    artifacts: [
      { type: 'workspace', workspaceId: 'setting-1', workspaceKind: 'setting_workspace' },
      { type: 'workspace', workspaceId: 'asset-1', workspaceKind: 'asset_workspace' },
    ],
    primary: { workspaceKind: 'setting_workspace' },
    relatedWorkspaceParams: [
      { workspaceKind: 'setting_workspace', queryParam: 'settingWorkspaceId' },
      { workspaceKind: 'asset_workspace', queryParam: 'assetWorkspaceArtifactId' },
    ],
  })

  assert.equal(result.get('kind'), 'all')
  assert.equal(result.get('view'), null)
  assert.equal(result.get('workspaceId'), 'setting-1')
  assert.equal(result.get('settingWorkspaceId'), 'setting-1')
  assert.equal(result.get('assetWorkspaceArtifactId'), 'asset-1')
})

test('project entry artifact review search covers all active workspace workbenches', () => {
  const projectStandards = mergeProjectEntryArtifactReviewSearchParams(new URLSearchParams('tab=rules'), {
    projectEntryId: 'project_standards',
    artifacts: [{ type: 'workspace', workspaceId: 'standards-1', workspaceKind: 'project_standards_workspace' }],
    primary: { workspaceKind: 'project_standards_workspace' },
  })
  assert.equal(projectStandards.toString(), 'tab=rules&workspaceId=standards-1')

  const contentReview = mergeProjectEntryArtifactReviewSearchParams(new URLSearchParams('tab=assets'), {
    projectEntryId: 'content',
    artifacts: [
      { type: 'workspace', workspaceId: 'setting-2', workspaceKind: 'setting_workspace' },
      { type: 'workspace', workspaceId: 'asset-2', workspaceKind: 'asset_workspace' },
    ],
    primary: { workspaceKind: 'asset_workspace', entityType: 'asset_slot', entityId: 51 },
    relatedWorkspaceParams: [
      { workspaceKind: 'setting_workspace', queryParam: 'settingWorkspaceId' },
      { workspaceKind: 'asset_workspace', queryParam: 'assetWorkspaceArtifactId' },
    ],
  })
  assert.equal(contentReview.get('workspaceId'), 'asset-2')
  assert.equal(contentReview.get('settingWorkspaceId'), 'setting-2')
  assert.equal(contentReview.get('assetWorkspaceArtifactId'), 'asset-2')

  const creativeTaskGraph = mergeProjectEntryArtifactReviewSearchParams(new URLSearchParams('workspace=structure'), {
    projectEntryId: 'orchestration_production',
    artifacts: [
      { type: 'workspace', workspaceId: 'setting-3', workspaceKind: 'setting_workspace' },
      { type: 'workspace', workspaceId: 'asset-3', workspaceKind: 'asset_workspace' },
      { type: 'workspace', workspaceId: 'production-3', workspaceKind: 'production_workspace' },
    ],
    primary: { workspaceKind: 'production_workspace', entityType: 'production', entityId: 301 },
    relatedWorkspaceParams: [
      { workspaceKind: 'setting_workspace', queryParam: 'settingWorkspaceId' },
      { workspaceKind: 'asset_workspace', queryParam: 'assetWorkspaceArtifactId' },
    ],
  })
  assert.equal(creativeTaskGraph.get('workspace'), 'structure')
  assert.equal(creativeTaskGraph.get('workspaceId'), 'production-3')
  assert.equal(creativeTaskGraph.get('productionId'), '301')
  assert.equal(creativeTaskGraph.get('settingWorkspaceId'), 'setting-3')
  assert.equal(creativeTaskGraph.get('assetWorkspaceArtifactId'), 'asset-3')

  const contentOrchestration = mergeProjectEntryArtifactReviewSearchParams(new URLSearchParams('mode=timeline'), {
    projectEntryId: 'content',
    artifacts: [{ type: 'workspace', workspaceId: 'content-4', workspaceKind: 'content_unit_workspace' }],
    primary: { workspaceKind: 'content_unit_workspace', entityType: 'scene_moment', entityId: 77 },
  })
  assert.equal(contentOrchestration.get('view'), null)
  assert.equal(contentOrchestration.get('workspaceId'), 'content-4')
  assert.equal(contentOrchestration.get('scene_moment_id'), '77')
})

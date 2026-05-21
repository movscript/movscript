import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeProjectWorkbenchArtifactReviewSearchParams,
  resolveProjectWorkbenchDraftReviewSearchParams,
} from './projectWorkbenchDraftReview'

test('project workbench draft review search falls back to seeded draft id', () => {
  const result = resolveProjectWorkbenchDraftReviewSearchParams(new URLSearchParams('tab=rules'), {
    workbenchId: 'project_standards',
    proposalKind: 'project_standards_proposal',
    fallbackDraftId: 'seed-draft',
  })

  assert.equal(result?.draftId, 'seed-draft')
  assert.equal(result?.searchParams.toString(), 'tab=rules&draftId=seed-draft')
})

test('project workbench draft review search prefers latest matching artifact and entity', () => {
  const result = resolveProjectWorkbenchDraftReviewSearchParams(new URLSearchParams('panel=review'), {
    workbenchId: 'creative_plan',
    proposalKind: 'production_proposal',
    fallbackDraftId: 'seed-draft',
    artifacts: [
      {
        type: 'draft',
        draftId: 'older-draft',
        draftKind: 'production_proposal',
        target: { entityType: 'production', entityId: 100 },
      },
      {
        type: 'draft',
        draftId: 'latest-draft',
        draftKind: 'production_proposal',
        target: { entityType: 'production', entityId: 301 },
      },
    ],
  })

  assert.equal(result?.draftId, 'latest-draft')
  assert.equal(result?.artifact?.draftId, 'latest-draft')
  assert.equal(result?.searchParams.toString(), 'panel=review&productionId=301&draftId=latest-draft')
})

test('project workbench artifact review search merges related proposal drafts', () => {
  const result = mergeProjectWorkbenchArtifactReviewSearchParams(new URLSearchParams('kind=all'), {
    workbenchId: 'pre_production',
    artifacts: [
      { type: 'draft', draftId: 'setting-1', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-1', draftKind: 'asset_proposal' },
    ],
    primary: { proposalKind: 'setting_proposal' },
    relatedDraftParams: [
      { proposalKind: 'setting_proposal', queryParam: 'settingDraftId' },
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId' },
    ],
  })

  assert.equal(result.get('kind'), 'all')
  assert.equal(result.get('view'), 'review')
  assert.equal(result.get('draftId'), 'setting-1')
  assert.equal(result.get('settingDraftId'), 'setting-1')
  assert.equal(result.get('assetProposalDraftId'), 'asset-1')
})

test('project workbench artifact review search covers all active proposal workbenches', () => {
  const projectStandards = mergeProjectWorkbenchArtifactReviewSearchParams(new URLSearchParams('tab=rules'), {
    workbenchId: 'project_standards',
    artifacts: [{ type: 'draft', draftId: 'standards-1', draftKind: 'project_standards_proposal' }],
    primary: { proposalKind: 'project_standards_proposal' },
  })
  assert.equal(projectStandards.toString(), 'tab=rules&draftId=standards-1')

  const preProduction = mergeProjectWorkbenchArtifactReviewSearchParams(new URLSearchParams('tab=assets'), {
    workbenchId: 'pre_production',
    artifacts: [
      { type: 'draft', draftId: 'setting-2', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-2', draftKind: 'asset_proposal' },
    ],
    primary: { proposalKind: 'asset_proposal', entityType: 'asset_slot', entityId: 51 },
    relatedDraftParams: [
      { proposalKind: 'setting_proposal', queryParam: 'settingDraftId' },
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId' },
    ],
  })
  assert.equal(preProduction.get('view'), 'review')
  assert.equal(preProduction.get('draftId'), 'asset-2')
  assert.equal(preProduction.get('asset_slot_id'), '51')
  assert.equal(preProduction.get('settingDraftId'), 'setting-2')
  assert.equal(preProduction.get('assetProposalDraftId'), 'asset-2')

  const creativePlan = mergeProjectWorkbenchArtifactReviewSearchParams(new URLSearchParams('workspace=structure'), {
    workbenchId: 'creative_plan',
    artifacts: [
      { type: 'draft', draftId: 'setting-3', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-3', draftKind: 'asset_proposal' },
      { type: 'draft', draftId: 'production-3', draftKind: 'production_proposal' },
    ],
    primary: { proposalKind: 'production_proposal', entityType: 'production', entityId: 301 },
    relatedDraftParams: [
      { proposalKind: 'setting_proposal', queryParam: 'settingDraftId' },
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId' },
    ],
  })
  assert.equal(creativePlan.get('workspace'), 'structure')
  assert.equal(creativePlan.get('draftId'), 'production-3')
  assert.equal(creativePlan.get('productionId'), '301')
  assert.equal(creativePlan.get('settingDraftId'), 'setting-3')
  assert.equal(creativePlan.get('assetProposalDraftId'), 'asset-3')

  const contentOrchestration = mergeProjectWorkbenchArtifactReviewSearchParams(new URLSearchParams('mode=timeline'), {
    workbenchId: 'content_orchestration',
    artifacts: [{ type: 'draft', draftId: 'content-4', draftKind: 'content_unit_proposal' }],
    primary: { proposalKind: 'content_unit_proposal', entityType: 'scene_moment', entityId: 77 },
  })
  assert.equal(contentOrchestration.get('view'), 'review')
  assert.equal(contentOrchestration.get('draftId'), 'content-4')
  assert.equal(contentOrchestration.get('scene_moment_id'), '77')
})

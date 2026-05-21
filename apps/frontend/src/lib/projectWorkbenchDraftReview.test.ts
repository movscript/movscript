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

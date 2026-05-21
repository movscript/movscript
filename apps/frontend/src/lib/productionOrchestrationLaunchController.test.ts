import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionProposalLaunchPageKey,
  buildProductionProposalLaunchRequestId,
  buildProductionProposalSettledReviewSearchParams,
  productionProposalLaunchBlockedReason,
} from './productionOrchestrationLaunchController'

test('production orchestration launch controller builds stable launch identifiers', () => {
  assert.equal(
    buildProductionProposalLaunchRequestId(1_700_000_000_000, 0.123456),
    'production_orchestrate_loyw3v28_4fzyo8',
  )

  assert.equal(buildProductionProposalLaunchPageKey({
    projectId: 7,
    effectiveProductionId: 12,
    selectedProduction: { ID: 12, project_id: 7, name: '第一集制作' },
  }), 'production_orchestrate|/project/production/orchestration|production|12')
})

test('production orchestration launch controller explains launch blockers', () => {
  assert.equal(productionProposalLaunchBlockedReason({
    projectId: undefined,
    effectiveProductionId: 12,
    canLaunchLinkedProposal: true,
  }), 'missing_production')
  assert.equal(productionProposalLaunchBlockedReason({
    projectId: 7,
    effectiveProductionId: 0,
    canLaunchLinkedProposal: true,
  }), 'missing_production')
  assert.equal(productionProposalLaunchBlockedReason({
    projectId: 7,
    effectiveProductionId: 12,
    canLaunchLinkedProposal: false,
  }), 'missing_script')
  assert.equal(productionProposalLaunchBlockedReason({
    projectId: 7,
    effectiveProductionId: 12,
    canLaunchLinkedProposal: true,
  }), null)
})

test('production orchestration launch controller merges settled review params', () => {
  const next = buildProductionProposalSettledReviewSearchParams(new URLSearchParams('foo=bar'), {
    productionId: 12,
    fallbackDraftId: 'fallback-production',
    artifacts: [
      { type: 'draft', draftId: 'production-draft', draftKind: 'production_proposal' },
      { type: 'draft', draftId: 'setting-draft', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-draft', draftKind: 'asset_proposal' },
    ],
  })

  assert.equal(next.get('foo'), 'bar')
  assert.equal(next.get('draftId'), 'production-draft')
  assert.equal(next.get('productionId'), '12')
  assert.equal(next.get('settingDraftId'), 'setting-draft')
  assert.equal(next.get('assetProposalDraftId'), 'asset-draft')
})

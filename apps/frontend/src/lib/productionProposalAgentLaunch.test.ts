import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProductionProposalAgentPanelDraftPayload,
  buildProductionProposalReviewSearchParams,
  productionProposalLaunchLabel,
} from './productionProposalAgentLaunch'

test('production proposal launch labels selected production consistently', () => {
  assert.equal(productionProposalLaunchLabel({ ID: 3, name: '第一集制作' }, 3), '第一集制作')
  assert.equal(productionProposalLaunchLabel({ ID: 4 }, 4), '制作 #4')
  assert.equal(productionProposalLaunchLabel(null, 9), '制作 #9')
})

test('production proposal launch builds command-first agent payload', () => {
  const payload = buildProductionProposalAgentPanelDraftPayload({
    requestId: 'request-1',
    projectId: 7,
    productionId: 12,
    productionLabel: '第一集制作',
    draftId: 'draft-production',
    target: { scope: 'segmentAnalysis', entityId: 45 },
  })

  assert.equal(payload.requestId, 'request-1')
  assert.equal(payload.taskType, 'production_proposal')
  assert.equal(payload.title, '制作提案: 第一集制作')
  assert.equal(payload.projectId, 7)
  assert.equal(payload.autoSend, true)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.draftId, 'draft-production')
  assert.equal(payload.clientInput.uiSnapshot?.productionId, 12)
  assert.equal(payload.clientInput.uiSnapshot?.pageContext?.pageType, 'production_orchestrate')
  assert.match(payload.clientInput.message, /编排段 #45/)
  assert.match(payload.clientInput.message, /production_proposal/)
  assert.match(payload.clientInput.message, /setting_proposal/)
  assert.match(payload.clientInput.message, /asset_proposal/)
})

test('production proposal review search keeps upstream draft artifacts aligned', () => {
  const next = buildProductionProposalReviewSearchParams(new URLSearchParams('foo=bar'), {
    productionId: 12,
    fallbackDraftId: 'fallback-production',
    artifacts: [
      { type: 'draft', draftId: 'setting-draft', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-draft', draftKind: 'asset_proposal' },
      { type: 'draft', draftId: 'production-draft', draftKind: 'production_proposal' },
    ],
  })

  assert.equal(next.get('foo'), 'bar')
  assert.equal(next.get('draftId'), 'production-draft')
  assert.equal(next.get('productionId'), '12')
  assert.equal(next.get('settingDraftId'), 'setting-draft')
  assert.equal(next.get('assetProposalDraftId'), 'asset-draft')
})

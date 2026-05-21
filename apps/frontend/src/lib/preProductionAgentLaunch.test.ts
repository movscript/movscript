import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAssetCandidateProposalAgentPanelDraftPayload,
  buildAssetCandidateProposalReviewSearchParams,
  buildMediaCandidateGenerationAgentPanelDraftPayload,
  buildPreProductionAuditAgentPanelDraftPayload,
  buildPreProductionAuditReviewSearchParams,
  buildSettingPreparationAgentPanelDraftPayload,
  mediaCandidateOutputResourceIds,
} from './preProductionAgentLaunch'

test('asset candidate proposal launch builds draft-aware agent payload', () => {
  const payload = buildAssetCandidateProposalAgentPanelDraftPayload({
    requestId: 'asset-request',
    projectId: 7,
    assetSlotId: 51,
    slotName: '主角背包',
    draftId: 'asset-draft',
  })

  assert.equal(payload.requestId, 'asset-request')
  assert.equal(payload.taskType, 'asset_candidate_proposal')
  assert.equal(payload.projectId, 7)
  assert.equal(payload.autoSend, true)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.draftId, 'asset-draft')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'asset_slot')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 51)
  assert.match(payload.clientInput.message, /素材候选生成提案/)
})

test('pre-production audit launch asks only for setting and asset proposals', () => {
  const payload = buildPreProductionAuditAgentPanelDraftPayload({
    requestId: 'prep-audit',
    projectId: 7,
    projectLabel: '测试项目',
  })

  assert.equal(payload.taskType, 'pre_production_audit')
  assert.equal(payload.renderMode, 'page')
  assert.ok(payload.clientInput)
  assert.match(payload.clientInput.message, /setting_proposal/)
  assert.match(payload.clientInput.message, /asset_proposal/)
  assert.doesNotMatch(payload.clientInput.message, /production_proposal/)
})

test('setting preparation launch scopes the agent to the selected creative reference', () => {
  const payload = buildSettingPreparationAgentPanelDraftPayload({
    requestId: 'setting-prep',
    projectId: 7,
    creativeReferenceId: 31,
    creativeReferenceLabel: '女主角',
    message: '请补齐人物动机。',
  })

  assert.equal(payload.requestId, 'setting-prep')
  assert.equal(payload.taskType, 'setting_preparation')
  assert.equal(payload.renderMode, 'page')
  assert.equal(payload.projectId, 7)
  assert.equal(payload.message, '请补齐人物动机。')
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'creative_reference')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 31)
  assert.match(payload.clientInput.message, /女主角/)
})

test('media candidate generation launch builds real generation payload', () => {
  const payload = buildMediaCandidateGenerationAgentPanelDraftPayload({
    requestId: 'media-request',
    projectId: 7,
    assetSlotId: 51,
    slotName: '主角背包',
    slotKind: 'image',
    outputKind: 'image',
    description: '旧背包，磨损明显',
    promptHint: '冷色写实',
  })

  assert.equal(payload.taskType, 'asset_candidate_generation')
  assert.equal(payload.timeoutMs, 600_000)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'asset_slot')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 51)
  assert.match(payload.clientInput.message, /真实生成/)
  assert.match(payload.clientInput.message, /asset_candidate_generation/)
  assert.match(payload.clientInput.message, /冷色写实/)
})

test('media candidate generation result normalizes output resource ids', () => {
  assert.deepEqual(mediaCandidateOutputResourceIds({ outputResourceId: 8, outputResourceIds: [8, 9], jobId: 3 }), [8, 9])
  assert.deepEqual(mediaCandidateOutputResourceIds({ outputResourceId: 8, outputResourceIds: [], jobId: 3 }), [8])
  assert.deepEqual(mediaCandidateOutputResourceIds(undefined), [])
})

test('pre-production launch review search preserves related proposal drafts', () => {
  const assetSearch = buildAssetCandidateProposalReviewSearchParams(new URLSearchParams('kind=image'), {
    assetSlotId: 51,
    fallbackDraftId: 'fallback-asset',
    artifacts: [{ type: 'draft', draftId: 'artifact-asset', draftKind: 'asset_proposal' }],
  })
  assert.equal(assetSearch.get('kind'), 'image')
  assert.equal(assetSearch.get('view'), 'review')
  assert.equal(assetSearch.get('asset_slot_id'), '51')
  assert.equal(assetSearch.get('draftId'), 'artifact-asset')
  assert.equal(assetSearch.get('assetProposalDraftId'), 'artifact-asset')

  const auditSearch = buildPreProductionAuditReviewSearchParams(new URLSearchParams(), {
    artifacts: [
      { type: 'draft', draftId: 'setting-draft', draftKind: 'setting_proposal' },
      { type: 'draft', draftId: 'asset-draft', draftKind: 'asset_proposal' },
    ],
  })
  assert.equal(auditSearch.get('view'), 'review')
  assert.equal(auditSearch.get('draftId'), 'setting-draft')
  assert.equal(auditSearch.get('settingDraftId'), 'setting-draft')
  assert.equal(auditSearch.get('assetProposalDraftId'), 'asset-draft')
})

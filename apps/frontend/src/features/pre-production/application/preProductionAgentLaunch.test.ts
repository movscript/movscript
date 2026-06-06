import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAssetCandidateWorkspaceAgentPanelWorkspacePayload,
  buildAssetCandidateWorkspaceReviewSearchParams,
  buildMediaCandidateGenerationAgentPanelWorkspacePayload,
  buildPreProductionAuditAgentPanelWorkspacePayload,
  buildPreProductionAuditReviewSearchParams,
  mediaCandidateOutputResourceIds,
} from './preProductionAgentLaunch'

test('asset candidate workspace launch builds workspace-aware agent payload', () => {
  const payload = buildAssetCandidateWorkspaceAgentPanelWorkspacePayload({
    requestId: 'asset-request',
    projectId: 7,
    assetSlotId: 51,
    slotName: '主角背包',
    workspaceId: 'asset-workspace',
  })

  assert.equal(payload.requestId, 'asset-request')
  assert.equal(payload.taskType, 'asset_candidate_workspace')
  assert.equal(payload.projectId, 7)
  assert.equal(payload.autoSend, true)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.workspaceId, 'asset-workspace')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityType, 'asset_slot')
  assert.equal(payload.clientInput.uiSnapshot?.selection?.entityId, 51)
  assert.match(payload.clientInput.message, /素材候选生成工作区/)
})

test('pre-production audit launch asks only for setting and asset workspaces', () => {
  const payload = buildPreProductionAuditAgentPanelWorkspacePayload({
    requestId: 'prep-audit',
    projectId: 7,
    projectLabel: '测试项目',
  })

  assert.equal(payload.taskType, 'pre_production_audit')
  assert.equal(payload.renderMode, 'page')
  assert.ok(payload.clientInput)
  assert.match(payload.clientInput.message, /setting_workspace/)
  assert.match(payload.clientInput.message, /asset_workspace/)
  assert.doesNotMatch(payload.clientInput.message, /production_workspace/)
})

test('media candidate generation launch builds real generation payload', () => {
  const payload = buildMediaCandidateGenerationAgentPanelWorkspacePayload({
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

test('pre-production launch review search preserves related workspace artifacts', () => {
  const assetSearch = buildAssetCandidateWorkspaceReviewSearchParams(new URLSearchParams('kind=image'), {
    assetSlotId: 51,
    fallbackWorkspaceId: 'fallback-asset',
    artifacts: [{ type: 'workspace', workspaceId: 'artifact-asset', workspaceKind: 'asset_workspace' }],
  })
  assert.equal(assetSearch.get('kind'), 'image')
  assert.equal(assetSearch.get('view'), 'review')
  assert.equal(assetSearch.get('asset_slot_id'), '51')
  assert.equal(assetSearch.get('workspaceId'), 'artifact-asset')
  assert.equal(assetSearch.get('assetWorkspaceArtifactId'), 'artifact-asset')

  const auditSearch = buildPreProductionAuditReviewSearchParams(new URLSearchParams(), {
    artifacts: [
      { type: 'workspace', workspaceId: 'setting-workspace', workspaceKind: 'setting_workspace' },
      { type: 'workspace', workspaceId: 'asset-workspace', workspaceKind: 'asset_workspace' },
    ],
  })
  assert.equal(auditSearch.get('view'), 'review')
  assert.equal(auditSearch.get('workspaceId'), 'setting-workspace')
  assert.equal(auditSearch.get('settingWorkspaceId'), 'setting-workspace')
  assert.equal(auditSearch.get('assetWorkspaceArtifactId'), 'asset-workspace')
})

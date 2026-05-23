import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/drafts'

import { localAgentClient, type AgentDraft } from './localAgentClient'
import {
  buildProductionProposalAgentPanelDraftPayload,
  buildProductionProposalRevisionAgentPanelDraftPayload,
  buildProductionProposalReviewSearchParams,
  ensureProductionProposalDraft,
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

test('production proposal revision launch routes edits through the draft file', () => {
  const payload = buildProductionProposalRevisionAgentPanelDraftPayload({
    requestId: 'revision-1',
    projectId: 7,
    productionId: 12,
    productionLabel: '第一集制作',
    draftId: 'draft/with space',
    instruction: '第二段压缩成两个情节',
  })

  assert.equal(payload.requestId, 'revision-1')
  assert.equal(payload.taskType, 'production_proposal')
  assert.equal(payload.autoSend, true)
  assert.ok(payload.clientInput)
  assert.equal(payload.clientInput.uiSnapshot?.draftId, 'draft/with space')
  assert.match(payload.clientInput.message, /core_file_read/)
  assert.match(payload.clientInput.message, /core_file_edit/)
  assert.match(payload.clientInput.message, /agent:\/\/draft\/draft%2Fwith%20space\/content/)
  assert.match(payload.clientInput.message, /不要直接写正式 production graph/)
  assert.match(payload.clientInput.message, /第二段压缩成两个情节/)
})

test('production proposal draft can seed proposal from current snapshot for manual proposal mode', async (t) => {
  const createdDrafts: Array<{ content: string }> = []
  t.after(() => mock.restoreAll())
  mock.method(localAgentClient, 'getDraft', async () => null as unknown as AgentDraft)
  mock.method(localAgentClient, 'listDrafts', async () => ({ drafts: [] }))
  mock.method(localAgentClient, 'createDraft', async (input: { content: string }) => {
    createdDrafts.push(input)
    return {
      id: 'draft-production',
      kind: 'production_proposal',
      title: '制作提案草稿',
      content: input.content,
      status: 'draft',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    } as AgentDraft
  })

  await ensureProductionProposalDraft({
    projectId: 7,
    productionId: 12,
    production: { ID: 12, name: '第一集制作' },
    productionPageKey: 'production-page',
    productionSnapshot: {
      segments: [{
        id: 10,
        title: '当前段落',
        scene_moments: [{ id: 20, title: '当前情节', action_text: '当前动作' }],
      }],
    },
    scriptVersion: null,
    projectScripts: [],
    seedProposalFromSnapshot: true,
  })

  assert.equal(createdDrafts.length, 1)
  const content = JSON.parse(createdDrafts[0]!.content)
  assert.equal(content.schema, DRAFT_CONTENT_SCHEMA_IDS.productionProposal)
  assert.equal(content.proposal.segments[0].id, 10)
  assert.equal(content.proposal.segments[0].scene_moments[0].id, 20)
  assert.equal(content.snapshot_base.segments[0].id, 10)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProjectLayerDraftContentForEntries,
  buildProjectLayerProposalEntryDiffRows,
  parseProjectLayerProposalDraft,
} from './projectLayerProposalReview'
import type { AgentDraft } from './localAgentClient'

function draft(input: Partial<AgentDraft> & Pick<AgentDraft, 'id' | 'kind' | 'content'>): AgentDraft {
  return {
    title: input.id,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...input,
  }
}

test('project layer proposal review can isolate setting proposal entries', () => {
  const view = parseProjectLayerProposalDraft(
    draft({
      id: 'setting-draft',
      kind: 'setting_proposal',
      content: JSON.stringify({
        summary: '整理角色设定',
        mode: 'snapshot',
        proposal: {
          creative_references: [
            { id: 7, name: '主角', description: '新的角色说明' },
          ],
          asset_slots: [
            { name: '角色头像', kind: 'image' },
          ],
        },
      }),
    }),
    {
      creativeReferences: [{ ID: 7, name: '主角', description: '旧的角色说明' }],
      assetSlots: [],
    },
    { includeAssetSlots: false },
  )

  assert.equal(view?.summary, '整理角色设定')
  assert.equal(view?.creativeReferences.length, 1)
  assert.equal(view?.assetSlots.length, 0)
  assert.equal(view?.creativeReferences[0]?.changeType, 'modified')
})

test('project layer proposal review can isolate asset slot proposal entries and diff owner', () => {
  const view = parseProjectLayerProposalDraft(
    draft({
      id: 'asset-proposal-draft',
      kind: 'asset_proposal',
      content: JSON.stringify({
        mode: 'snapshot',
        proposal: {
          creative_references: [
            { name: '角色设定' },
          ],
          asset_slots: [
            {
              id: 12,
              owner: { type: 'creative_reference', id: 9 },
              name: '角色半身照',
              kind: 'image',
              prompt_hint: '正面站姿',
            },
          ],
        },
      }),
    }),
    {
      creativeReferences: [],
      assetSlots: [{ ID: 12, name: '角色半身照', prompt_hint: '侧面站姿', creative_reference_id: 8 }],
    },
    { includeCreativeReferences: false },
  )

  assert.equal(view?.creativeReferences.length, 0)
  assert.equal(view?.assetSlots.length, 1)
  assert.equal(view?.assetSlots[0]?.changeType, 'modified')

  const rows = buildProjectLayerProposalEntryDiffRows(
    view!.assetSlots[0]!,
    {
      creativeReferences: [],
      assetSlots: [{ ID: 12, name: '角色半身照', prompt_hint: '侧面站姿', creative_reference_id: 8 }],
    },
    new Map([
      ['8', '旧角色'],
      ['9', '新角色'],
    ]),
  )

  assert.ok(rows.some((row) => row.label === '用途' && row.before === '侧面站姿' && row.after === '正面站姿'))
  assert.ok(rows.some((row) => row.label === '归属' && row.before === '旧角色' && row.after === '新角色'))
})

test('buildProjectLayerDraftContentForEntries keeps unselected backend rows in snapshot apply payload', () => {
  const sourceDraft = draft({
    id: 'setting-draft',
    kind: 'setting_proposal',
    content: JSON.stringify({
      mode: 'snapshot',
      proposal: {
        creative_references: [
          { id: 7, name: '主角', description: '新的角色说明' },
        ],
        asset_slots: [],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 7, name: '主角', description: '旧的角色说明' },
      { ID: 8, name: '配角', description: '保留不动' },
    ],
    assetSlots: [],
  }
  const view = parseProjectLayerProposalDraft(sourceDraft, data, { includeAssetSlots: false })
  const payload = JSON.parse(buildProjectLayerDraftContentForEntries(sourceDraft, [view!.creativeReferences[0]!], data)) as Record<string, any>

  assert.equal(payload.mode, 'snapshot')
  assert.deepEqual(payload.proposal.creative_references.map((item: any) => item.id).sort(), [7, 8])
  assert.equal(payload.proposal.creative_references.find((item: any) => item.id === 7)?.description, '新的角色说明')
  assert.equal(payload.proposal.creative_references.find((item: any) => item.id === 8)?.description, '保留不动')
})

test('buildProjectLayerDraftContentForEntries scopes asset proposal payload to asset slots', () => {
  const sourceDraft = draft({
    id: 'asset-draft',
    kind: 'asset_proposal',
    content: JSON.stringify({
      schema: 'movscript.asset_proposal.v1',
      scope: 'asset_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [{ id: 7, name: '草稿内设定' }],
        asset_slots: [
          { name: '角色头像', kind: 'image', owner: { type: 'creative_reference', client_id: 'hero_ref' } },
        ],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 7, name: '已入库角色', description: '当前设定' },
    ],
    assetSlots: [
      { ID: 12, name: '旧头像', kind: 'image', creative_reference_id: 7 },
    ],
  }
  const view = parseProjectLayerProposalDraft(sourceDraft, data, { includeCreativeReferences: false })
  const payload = JSON.parse(buildProjectLayerDraftContentForEntries(sourceDraft, [view!.assetSlots[0]!], data)) as Record<string, any>

  assert.equal(payload.mode, 'snapshot')
  assert.deepEqual(payload.proposal.creative_references, [])
  assert.deepEqual(payload.proposal.asset_slots.map((item: any) => item.name).sort(), ['旧头像', '角色头像'])
})

test('buildProjectLayerDraftContentForEntries rebases stale asset owner ids from current references', () => {
  const sourceDraft = draft({
    id: 'asset-draft',
    kind: 'asset_proposal',
    content: JSON.stringify({
      schema: 'movscript.asset_proposal.v1',
      scope: 'asset_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [],
        asset_slots: [
          { name: '女主形象图', kind: 'image', owner: { type: 'creative_reference', id: 999 }, description: '女主官方人设图' },
        ],
      },
    }),
  })
  const data = {
    creativeReferences: [
      { ID: 41, name: '苏晚', description: '女主，单亲妈妈' },
      { ID: 42, name: '陆景深', description: '男主，集团总裁' },
    ],
    assetSlots: [],
  }
  const view = parseProjectLayerProposalDraft(sourceDraft, data, { includeCreativeReferences: false })
  const payload = JSON.parse(buildProjectLayerDraftContentForEntries(sourceDraft, [view!.assetSlots[0]!], data)) as Record<string, any>
  const slot = payload.proposal.asset_slots[0]

  assert.equal(slot.owner.id, 41)
  assert.equal(slot.creative_reference_id, 41)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
        proposal: {
          creative_references: [
            { id: 7, fields: { name: '主角', description: '新的角色说明' } },
          ],
          asset_slots: [
            { fields: { name: '角色头像' } },
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
        proposal: {
          creative_references: [
            { fields: { name: '角色设定' } },
          ],
          asset_slots: [
            {
              id: 12,
              owner: { type: 'creative_reference', id: 9 },
              fields: { name: '角色半身照', prompt_hint: '正面站姿' },
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

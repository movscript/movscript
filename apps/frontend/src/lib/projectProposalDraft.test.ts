import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmptyProjectProposalDraftContent } from './projectProposalDraft'

test('buildEmptyProjectProposalDraftContent can seed editable snapshot content', () => {
  const content = buildEmptyProjectProposalDraftContent({
    projectId: 4,
    mode: 'snapshot',
    projectStyle: {
      aspect_ratio: '9:16',
      visual_style: '竖屏写实，肤色自然，道具轮廓清晰',
      custom_rules: [{
        key: 'character_consistency',
        label: '角色一致性',
        value: '主角发型、年龄感和服装气质必须保持一致。',
        prompt_role: 'constraint',
        enabled: true,
        required: false,
        order: 10,
      }],
    },
    summary: 'seeded snapshot',
  })

  assert.equal(content.projectId, 4)
  assert.equal(content.mode, 'snapshot')
  assert.equal(content.proposal.project_style.aspect_ratio, '9:16')
  assert.equal(content.proposal.project_style.visual_style, '竖屏写实，肤色自然，道具轮廓清晰')
  assert.equal(content.proposal.project_style.custom_rules?.[0]?.key, 'character_consistency')
  assert.equal('creative_references' in content.proposal, false)
  assert.equal('asset_slots' in content.proposal, false)
})

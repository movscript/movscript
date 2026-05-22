import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

import type { AgentDraft } from './localAgentClient'
import {
  appendProductionProposalDraftSceneMoment,
  appendProductionProposalDraftSegment,
  appendProductionProposalDraftCreativeReference,
  productionProposalDraftNodeKey,
  removeProductionProposalDraftCreativeReference,
  removeProductionProposalDraftSceneMoment,
  removeProductionProposalDraftSegment,
  replaceProductionProposalDraftSceneMoment,
  replaceProductionProposalDraftSegment,
  updateProductionProposalDraftText,
} from './productionProposalDraftEdit'

test('production proposal draft edits patch draft content text', () => {
  const draft = productionDraft({
    proposal: {
      segments: [{
        id: 10,
        title: '旧段落',
        kind: 'scene',
        summary: '旧摘要',
        scene_moments: [{
          id: 20,
          title: '旧情节',
          time_text: '夜',
          location_text: '街口',
          action_text: '等待',
        }],
      }],
    },
  })

  const result = updateProductionProposalDraftText(draft, (content) => {
    const segmentKey = productionProposalDraftNodeKey(content.proposal.segments[0]!, 'segment:0')
    replaceProductionProposalDraftSegment(content, segmentKey, {
      ...content.proposal.segments[0]!,
      title: '新段落',
      summary: '新摘要',
    })
    replaceProductionProposalDraftSceneMoment(content, segmentKey, 'id:20', {
      ...content.proposal.segments[0]!.scene_moments![0]!,
      action_text: '推门进入',
    })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.equal(content.schema, DRAFT_CONTENT_SCHEMA_IDS.productionProposal)
  assert.equal(content.proposal.segments[0].title, '新段落')
  assert.equal(content.proposal.segments[0].summary, '新摘要')
  assert.equal(content.proposal.segments[0].scene_moments[0].action_text, '推门进入')
})

test('production proposal draft edits add and remove proposal nodes', () => {
  const draft = productionDraft({
    proposal: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        scene_moments: [{ client_id: 'moment-a', title: '情节 A' }],
      }],
    },
  })

  const result = updateProductionProposalDraftText(draft, (content) => {
    removeProductionProposalDraftSceneMoment(content, 'client:segment-a', 'client:moment-a')
    appendProductionProposalDraftSceneMoment(content, 'client:segment-a', {
      client_id: 'moment-b',
      title: '情节 B',
      action_text: '新的动作',
    })
    appendProductionProposalDraftSegment(content, {
      client_id: 'segment-b',
      title: '段落 B',
      summary: '新增段落',
      scene_moments: [],
    })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.proposal.segments.map((segment: { client_id: string }) => segment.client_id), ['segment-a', 'segment-b'])
  assert.deepEqual(content.proposal.segments[0].scene_moments.map((moment: { client_id: string }) => moment.client_id), ['moment-b'])
  assert.equal(content.proposal.segments[1].order, 2)
})

test('production proposal draft edits can clear script block bindings', () => {
  const draft = productionDraft({
    proposal: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        script_block_id: 5,
        scene_moments: [{ client_id: 'moment-a', title: '情节 A', script_block_id: 6 }],
      }],
    },
  })

  const result = updateProductionProposalDraftText(draft, (content) => {
    replaceProductionProposalDraftSegment(content, 'client:segment-a', { script_block_id: null })
    replaceProductionProposalDraftSceneMoment(content, 'client:segment-a', 'client:moment-a', { script_block_id: null })
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.equal(content.proposal.segments[0].script_block_id, null)
  assert.equal(content.proposal.segments[0].scene_moments[0].script_block_id, null)
})

test('production proposal draft edit rejects invalid draft text', () => {
  const result = updateProductionProposalDraftText({ ...productionDraft({}), content: '{"schema":"wrong"}' }, () => {
    throw new Error('should not run')
  })

  assert.equal(result.error, '这不是可编辑的 production proposal snapshot 草稿。')
})

test('production proposal draft edit can remove a segment from the proposal', () => {
  const draft = productionDraft({
    proposal: {
      segments: [
        { client_id: 'keep', title: '保留', scene_moments: [] },
        { client_id: 'remove', title: '移除', scene_moments: [] },
      ],
    },
  })

  const result = updateProductionProposalDraftText(draft, (content) => {
    assert.equal(replaceProductionProposalDraftSegment(content, 'missing', { title: '不会写入' }), false)
    const removed = removeProductionProposalDraftSegment(content, 'client:remove')
    assert.equal(removed, true)
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.proposal.segments.map((segment: { client_id: string }) => segment.client_id), ['keep'])
})

test('production proposal draft edits scene moment creative references', () => {
  const draft = productionDraft({
    proposal: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        scene_moments: [{
          client_id: 'moment-a',
          title: '情节 A',
          creative_references: [{ id: 1, name: '旧人物', role: 'supporting' }],
        }],
      }],
    },
  })

  const result = updateProductionProposalDraftText(draft, (content) => {
    appendProductionProposalDraftCreativeReference(content, 'client:segment-a', 'client:moment-a', {
      id: 2,
      name: '新人物',
      kind: 'person',
      role: 'protagonist',
    })
    removeProductionProposalDraftCreativeReference(content, 'client:segment-a', 'client:moment-a', 'id:1')
  })

  assert.equal(result.error, '')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.proposal.segments[0].scene_moments[0].creative_references, [{
    id: 2,
    name: '新人物',
    kind: 'person',
    role: 'protagonist',
  }])
})

function productionDraft(content: Record<string, unknown>): AgentDraft {
  return {
    id: 'draft-production',
    kind: 'production_proposal',
    title: 'Production proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
      scope: DRAFT_SCOPES.productionProposal,
      mode: 'snapshot',
      productionId: 12,
      proposalScope: 'production',
      summary: '',
      proposal: { segments: [] },
      impact_notes: [],
      proposedAt: '2026-05-22T00:00:00.000Z',
      ...content,
    }),
    status: 'draft',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
  }
}

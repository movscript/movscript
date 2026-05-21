import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentDraft } from './localAgentClient.ts'
import { buildContentDraftReviewModel, dedupeDrafts, draftEntityId, parseDraftJsonContent } from './contentWorkbenchDraftReviewModel.ts'

const baseDraft: AgentDraft = {
  id: 'draft-1',
  kind: 'content_unit_proposal',
  title: '制作项草案',
  content: '',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

test('content workbench draft review parses fenced JSON blocks', () => {
  assert.deepEqual(parseDraftJsonContent('```json\n{"ok":true}\n```'), { ok: true })
  assert.deepEqual(parseDraftJsonContent('prefix {"ok":1} suffix'), { ok: 1 })
  assert.equal(parseDraftJsonContent('not json'), null)
})

test('content workbench draft review builds snapshot diffs for content units', () => {
  const draft: AgentDraft = {
    ...baseDraft,
    target: { entityId: 9 },
    content: JSON.stringify({
      proposal: {
        units: [
          {
            title: '雨夜特写',
            kind: 'shot',
            description: '角色回头',
            prompt: 'close up',
            duration_sec: 5,
            shot: { shot_size: 'close_up', camera_angle: 'eye_level', camera_motion: 'dolly_in' },
            visual_plan: { space: '巷口', blocking: '角色回头', beats: ['停顿'] },
            storyboard_brief: { purpose: '确认悬疑', action_moment: '回头瞬间' },
          },
          {
            title: '旁白推进',
            kind: 'voiceover',
            description: '交代内心',
          },
        ],
      },
    }),
  }

  const model = buildContentDraftReviewModel(draft, {
    rowByMomentId: new Map([
      [9, {
        moment: { ID: 9, title: '巷口对峙' },
        units: [
          {
            ID: 3,
            title: '雨夜特写',
            kind: 'shot',
            description: '角色停步',
            prompt: 'wide shot',
            duration_sec: 4,
            shot_size: 'wide',
            metadata_json: JSON.stringify({
              visual_plan: { space: '巷口' },
              storyboard_brief: { purpose: '旧目的' },
            }),
          },
        ],
      }],
    ]),
    rowByUnitId: new Map(),
  })

  assert.equal(model.targetLabel, '巷口对峙')
  assert.equal(model.stats.find((item) => item.label === '快照新增')?.value, 1)
  assert.equal(model.stats.find((item) => item.label === '快照变更')?.value, 1)
  assert.equal(model.diffs[0].currentUnitId, 3)
  assert.equal(model.diffs[0].state, 'changed')
  assert.ok(model.diffs[0].fields.some((field) => field.label === '视觉调度'))
  assert.equal(model.diffs[1].state, 'added')
})

test('content workbench draft review reports invalid or risky drafts', () => {
  const invalid = buildContentDraftReviewModel({ ...baseDraft, content: 'bad' }, {
    rowByMomentId: new Map(),
    rowByUnitId: new Map(),
  })

  assert.match(invalid.summary, /无法解析/)
  assert.deepEqual(invalid.warnings, ['草案内容不是可解析的 JSON。'])

  const risky = buildContentDraftReviewModel({
    ...baseDraft,
    content: JSON.stringify({
      proposal: {
        timeline_items: [],
        units: [{ title: '旧格式', kind: 'shot', action: 'create' }],
      },
    }),
  }, {
    rowByMomentId: new Map(),
    rowByUnitId: new Map(),
  })

  assert.ok(risky.warnings.some((warning) => warning.includes('timeline_items')))
  assert.ok(risky.warnings.some((warning) => warning.includes('旧版操作字段')))
})

test('content workbench draft review helpers dedupe and read entity ids', () => {
  assert.equal(draftEntityId({ entityId: '12' }), 12)
  assert.deepEqual(dedupeDrafts([
    { ...baseDraft, id: 'a' },
    { ...baseDraft, id: 'a', title: '重复' },
    { ...baseDraft, id: 'b' },
  ]).map((draft) => draft.id), ['a', 'b'])
})

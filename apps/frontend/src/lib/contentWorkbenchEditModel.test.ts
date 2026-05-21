import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeyframeGenerationPrompt,
  contentUnitEditDraftEqualsRecord,
  contentUnitEditDraftFromRecord,
  contentUnitEditPayload,
  frameRoleLabel,
  keyframeEditDraftFromRecord,
  keyframeFrameRoleLabel,
  keyframeGenerationStatusLabel,
  keyframeHasOutput,
  keyframeHasRunningJob,
  keyframeOrderForRole,
  keyframeOutputResourceId,
  keyframeTitleForRole,
  nextKeyframeFrameRole,
  normalizeKeyframeFrameRole,
} from './contentWorkbenchEditModel.ts'

test('content workbench edit model round-trips visual plan and storyboard metadata', () => {
  const unit = {
    ID: 7,
    title: '雨夜特写',
    duration_sec: 4,
    description: '角色回头',
    prompt: 'cinematic close up',
    status: 'candidate',
    metadata_json: JSON.stringify({
      visual_plan: {
        space: '巷口',
        blocking: '角色从右入画',
        camera_path: '缓慢推进',
        beats: ['停顿', '回头'],
        props: ['伞'],
        lighting: '霓虹侧光',
        risks: ['雨滴遮挡'],
      },
      storyboard_brief: {
        purpose: '确认悬疑信息',
        subject: '林夏',
        composition: '三分线构图',
        action_moment: '回头瞬间',
        emotion: '警觉',
        keyframe_suggestions: ['首帧', '尾帧'],
      },
    }),
  }

  const draft = contentUnitEditDraftFromRecord(unit)

  assert.equal(draft.visual_plan_beats, '停顿\n回头')
  assert.equal(draft.storyboard_keyframe_suggestions, '首帧\n尾帧')
  assert.equal(contentUnitEditDraftEqualsRecord(draft, unit), true)

  const payload = contentUnitEditPayload({
    ...draft,
    duration_sec: '5',
    visual_plan_props: '伞\n门牌',
  })
  const metadata = JSON.parse(String(payload.metadata_json))

  assert.equal(payload.duration_sec, 5)
  assert.deepEqual(metadata.visual_plan.props, ['伞', '门牌'])
  assert.equal(metadata.storyboard_brief.action_moment, '回头瞬间')
})

test('content workbench edit model derives keyframe roles and titles', () => {
  assert.equal(frameRoleLabel(0, 1), '关键画面')
  assert.equal(frameRoleLabel(1, 4), '中间帧 1')
  assert.equal(keyframeFrameRoleLabel('first'), '首帧')
  assert.equal(normalizeKeyframeFrameRole('bad', 'middle'), 'middle')
  assert.equal(nextKeyframeFrameRole([{ ID: 1, order: 1 }]), 'last')
  assert.equal(keyframeOrderForRole('first', [{ ID: 1, order: 1 }, { ID: 2, order: 3 }]), 4)
  assert.equal(keyframeTitleForRole('last', { ID: 9, title: '雨夜特写' }, ''), '尾帧 · 雨夜特写')

  const draft = keyframeEditDraftFromRecord({
    ID: 2,
    title: '尾帧',
    order: 3,
    prompt: 'end frame',
    metadata_json: JSON.stringify({ frame_role: 'last' }),
  })

  assert.equal(draft.frame_role, 'last')
  assert.equal(draft.prompt, 'end frame')
})

test('content workbench edit model tracks keyframe generation jobs', () => {
  const keyframe = { ID: 12, title: '首帧' }
  const jobs = [
    {
      ID: 1,
      status: 'running',
      extra_params: JSON.stringify({ keyframe_id: 12 }),
      CreatedAt: '2026-01-01T00:00:00Z',
    },
    {
      ID: 2,
      status: 'succeeded',
      output_resource_id: 42,
      extra_params: JSON.stringify({ keyframeId: 12 }),
      UpdatedAt: '2026-01-02T00:00:00Z',
    },
  ] as any

  assert.equal(keyframeHasRunningJob(keyframe, jobs), true)
  assert.equal(keyframeHasOutput(keyframe, jobs), true)
  assert.equal(keyframeOutputResourceId(keyframe, jobs), 42)
  assert.equal(keyframeGenerationStatusLabel(keyframe, jobs), '已有生成结果 #42')
})

test('content workbench edit model builds continuity prompt for adjacent keyframes', () => {
  const prompt = buildKeyframeGenerationPrompt({
    row: {
      title: '雨夜追逐',
      moment: { ID: 1, action_text: '林夏听见脚步声', location_text: '巷口' },
    },
    unit: { ID: 7, title: '雨夜特写', prompt: '角色警觉回头', shot_size: 'close_up' },
    keyframe: { ID: 12, title: '尾帧', prompt: '角色定格在霓虹下' },
    sequence: [
      { ID: 11, title: '首帧', prompt: '角色进入巷口' },
      { ID: 12, title: '尾帧', prompt: '角色定格在霓虹下' },
    ],
    visualPlan: '缓慢推进',
    storyboardBrief: '确认悬疑落点',
  })

  assert.match(prompt, /所属制作项：雨夜特写/)
  assert.match(prompt, /前一帧连续性：首帧/)
  assert.match(prompt, /当前制作项视觉调度/)
})

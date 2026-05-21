import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentWorkbenchProposalDefaults,
  contentWorkbenchProposalSnapshot,
  contentWorkbenchProposalUnitKey,
  contentWorkbenchProposalUnitTitle,
  normalizeContentWorkbenchProposalText,
} from './contentWorkbenchDraftProposal'

test('content workbench proposal helpers build stable titles and keys', () => {
  assert.equal(contentWorkbenchProposalUnitTitle({}, 2), '制作项 3')
  assert.equal(contentWorkbenchProposalUnitTitle({ title: '  纸条特写  ' }, 0), '纸条特写')
  assert.equal(contentWorkbenchProposalUnitKey({ title: '  纸条   特写  ' }, 1), '纸条 特写-1')
  assert.equal(normalizeContentWorkbenchProposalText('  A   B  '), 'a b')
})

test('content workbench proposal helpers summarize snapshot fields', () => {
  assert.equal(contentWorkbenchProposalSnapshot({
    title: '纸条特写',
    kind: 'shot',
    duration_sec: 3,
    description: '纸条从伞骨滑出。',
    prompt: '雨水打湿字迹。',
    shot: {
      shot_size: 'extreme_close_up',
      camera_angle: 'top_down',
      camera_movement: 'dolly_in',
    },
  }), '纸条特写 / shot / 纸条从伞骨滑出。 / 雨水打湿字迹。 / 3s / extreme_close_up / top_down / dolly_in')
})

test('content workbench proposal helpers map AI snapshot into create defaults', () => {
  assert.deepEqual(contentWorkbenchProposalDefaults({
    title: '林夏反应',
    kind: 'shot',
    duration_sec: '5',
    description: '林夏低头看见纸条。',
    prompt: '中近景林夏停步。',
    shot: {
      shot_size: 'medium_close',
      camera_angle: 'eye_level',
      camera_motion: 'static',
    },
  }), {
    title: '林夏反应',
    kind: 'shot',
    duration_sec: 5,
    description: '林夏低头看见纸条。',
    prompt: '中近景林夏停步。',
    shot_size: 'medium_close',
    camera_angle: 'eye_level',
    camera_motion: 'static',
    status: 'candidate',
  })
})

test('content workbench proposal helpers preserve visual planning metadata', () => {
  const defaults = contentWorkbenchProposalDefaults({
    title: '纸条特写',
    kind: 'shot',
    description: '纸条从伞骨滑出。',
    visual_plan: {
      space: '伞面占据前景。',
      beats: ['纸条滑出', '落入水洼'],
    },
    storyboard_brief: {
      purpose: '确认纸条是剧情证据。',
      keyframe_suggestions: ['首帧：伞骨夹缝', '尾帧：纸条落地'],
    },
  })

  assert.equal(typeof defaults.metadata_json, 'string')
  const metadata = JSON.parse(defaults.metadata_json ?? '{}')
  assert.equal(metadata.visual_plan.space, '伞面占据前景。')
  assert.deepEqual(metadata.visual_plan.beats, ['纸条滑出', '落入水洼'])
  assert.equal(metadata.storyboard_brief.purpose, '确认纸条是剧情证据。')
})

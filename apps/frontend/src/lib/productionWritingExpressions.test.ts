import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSpeakerOptions,
  buildWritingExpressionLines,
  writingExpressionPayload,
} from './productionWritingExpressions'

test('production writing expressions prefer persisted expression rows', () => {
  const lines = buildWritingExpressionLines(
    { ID: 10, title: '情节', action_text: '推门进入', script_block_id: 20 },
    { ID: 20, kind: 'dialogue', speaker: '张三', content: '张三：走吧' },
    [{ ID: 30, kind: 'shot', title: '镜头推进' }],
    [{ ID: 40, kind: 'dialogue', speaker: '李四', text: '先等等', note: '压低声音', intent: '阻止', order: 1 }],
  )

  assert.equal(lines.length, 1)
  assert.deepEqual(lines[0]?.editTarget, { kind: 'writingExpressions', id: 40 })
  assert.equal(lines[0]?.speaker, '李四')
  assert.equal(lines[0]?.persisted, true)
})

test('production writing expressions build fallback lines from moment script and content units', () => {
  const lines = buildWritingExpressionLines(
    { ID: 10, title: '情节', action_text: '推门进入', mood: '克制', script_block_id: 20 },
    { ID: 20, kind: 'dialogue', speaker: '张三', content: '张三：走吧' },
    [{ ID: 30, kind: 'shot', title: '镜头推进', description: '镜头贴近门把手' }],
  )

  assert.deepEqual(lines.map((line) => line.type), ['action', 'action', 'dialogue', 'visual'])
  assert.equal(lines[0]?.editTarget.kind, 'fallback')
  assert.equal(lines[2]?.speaker, '张三')
  assert.equal(lines[3]?.intent, '镜头描述')
})

test('production writing expressions normalize write payloads and speaker choices', () => {
  assert.deepEqual(writingExpressionPayload({
    scene_moment_id: 10,
    script_block_id: undefined,
    order: 2,
    kind: 'dialogue',
    speaker: ' 张三 ',
    text: ' 走吧 ',
    note: ' 压低声音 ',
    intent: ' 推进 ',
  }), {
    scene_moment_id: 10,
    script_block_id: null,
    order: 2,
    kind: 'dialogue',
    speaker: '张三',
    text: '走吧',
    note: '压低声音',
    intent: '推进',
  })

  const speakers = buildSpeakerOptions(
    { ID: 10 },
    [{ ID: 20, kind: 'person', name: '张三' }, { ID: 21, kind: 'person', name: '李四' }],
    {
      contentUnitById: new Map(),
      creativeReferenceById: new Map([[20, { ID: 20, kind: 'person', name: '张三' }]]),
      usagesByOwnerKey: new Map([['scene_moment:10', [{ ID: 100, creative_reference_id: 20 }]]]),
    },
  )

  assert.deepEqual(speakers.map((speaker) => speaker.label), ['张三 · 当前情节', '李四 · 设定'])
})

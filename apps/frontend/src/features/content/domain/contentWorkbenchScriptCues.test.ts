import assert from 'node:assert/strict'
import test from 'node:test'

import { scriptBlockCue, scriptBlockKindLabel, unitSoundCue } from './contentWorkbenchScriptCues'

test('content workbench script cues summarize script blocks', () => {
  assert.equal(scriptBlockCue({ ID: 1, kind: 'dialogue', speaker: '林夏', content: '你还是来了。' }), '对白：林夏：你还是来了。')
  assert.equal(scriptBlockCue({ ID: 2, kind: 'dialogue', speaker: '顾言' }), '对白：顾言')
  assert.equal(scriptBlockCue({ ID: 3, kind: 'action', content: '纸条从伞骨夹缝里滑出，被雨水打湿。' }), '动作文本：纸条从伞骨夹缝里滑出，被雨水打湿。')
  assert.equal(scriptBlockCue(null), '')
})

test('content workbench script cues derive sound cues from unit kinds', () => {
  const scriptBlock = { ID: 1, kind: 'dialogue', content: '你还是来了。' }
  assert.equal(unitSoundCue({ ID: 2, kind: 'voiceover' }, scriptBlock), '旁白：你还是来了。')
  assert.equal(unitSoundCue({ ID: 3, kind: 'dialogue_audio' }, scriptBlock), '对白音频：你还是来了。')
  assert.equal(unitSoundCue({ ID: 4, kind: 'sound', prompt: '雨声加重' }), '音效：雨声加重')
  assert.equal(unitSoundCue({ ID: 5, kind: 'music_beat', description: '低频鼓点推进' }), '音乐/节拍：低频鼓点推进')
  assert.equal(unitSoundCue({ ID: 6, kind: 'subtitle' }, scriptBlock), '字幕：你还是来了。')
  assert.equal(unitSoundCue({ ID: 7, kind: 'shot' }, null, [{ ID: 8, name: '雨声' }, { ID: 9, title: '脚步声' }, { ID: 10, title: '风声' }]), '音频：雨声、脚步声')
})

test('content workbench script cues keep script block kind labels stable', () => {
  assert.equal(scriptBlockKindLabel('scene_heading'), '场景标题')
  assert.equal(scriptBlockKindLabel('parenthetical'), '括注')
  assert.equal(scriptBlockKindLabel('transition'), '转场文本')
  assert.equal(scriptBlockKindLabel('unknown'), '剧本块')
})

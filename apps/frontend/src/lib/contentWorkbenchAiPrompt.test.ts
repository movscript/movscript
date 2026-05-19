import assert from 'node:assert/strict'
import test from 'node:test'

import { buildContentWorkbenchAiSuggestPrompt } from './contentWorkbenchAiPrompt'

test('content workbench AI prompt carries current scene context', () => {
  const prompt = buildContentWorkbenchAiSuggestPrompt({
    momentTitle: '旧伞纸条滑落',
    sceneMomentId: 402,
    momentScope: '制作 · 雨夜重逢 / 编排段 · 秘密浮现',
    existingUnits: [],
  })

  assert.match(prompt, /当前情节：旧伞纸条滑落/)
  assert.match(prompt, /情节 ID：402/)
  assert.match(prompt, /情节上下文：制作 · 雨夜重逢/)
  assert.match(prompt, /当前情节还没有制作项/)
})

test('content workbench AI prompt lists existing units for snapshot comparison', () => {
  const prompt = buildContentWorkbenchAiSuggestPrompt({
    momentTitle: '旧伞纸条滑落',
    existingUnits: [{
      title: '纸条特写',
      kind: 'shot',
      status: 'confirmed',
      prompt: '特写纸条从伞骨滑落。',
    }],
  })

  assert.match(prompt, /1\. 纸条特写 \/ shot \/ confirmed \/ 特写纸条从伞骨滑落。/)
})

test('content workbench AI prompt forbids operation-style patches', () => {
  const prompt = buildContentWorkbenchAiSuggestPrompt({
    momentTitle: '旧伞纸条滑落',
  })

  assert.match(prompt, /不要输出 action、operation、patch/)
  assert.match(prompt, /完整草案快照和当前快照做对比/)
})

test('content workbench AI prompt defines the draft envelope contract', () => {
  const prompt = buildContentWorkbenchAiSuggestPrompt({
    momentTitle: '旧伞纸条滑落',
    sceneMomentId: 402,
  })

  assert.match(prompt, /content_unit_proposal/)
  assert.match(prompt, /movscript\.content_unit_proposal\.v1/)
  assert.match(prompt, /\{"scene_moment_id": 402, "proposal": \{"units": \[\.\.\.\]\}\}/)
  assert.match(prompt, /unit\.timing/)
  assert.match(prompt, /不要在 content_unit_proposal 里创建 production 级 preview_timeline/)
})

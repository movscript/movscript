import assert from 'node:assert/strict'
import test from 'node:test'

import { getProductionAnalysisText, scopeScriptTextForProduction } from './productionAnalysisText'

test('production analysis text scopes linked script to the production episode', () => {
  const scoped = scopeScriptTextForProduction(
    '第 1 集：开端\n第一集正文\n\n第 2 集：变化\n第二集正文',
    { ID: 10, name: '第 2 集制作' },
    '完整剧本',
  )

  assert.equal(scoped.scoped, true)
  assert.equal(scoped.episodeOrder, 2)
  assert.match(scoped.text, /第二集正文/)
  assert.doesNotMatch(scoped.text, /第一集正文/)
})

test('production analysis text serializes selected segment context', () => {
  const text = getProductionAnalysisText({ scope: 'segmentAnalysis', entityId: 1 }, {
    manualText: '',
    linkedVersion: null,
    selectedSegment: null,
    production: { ID: 99, name: '制作' },
    segments: [{ ID: 1, title: '发现段', summary: '人物发现问题', content: '段落正文' }],
    sceneMoments: [{ ID: 10, segment_id: 1, title: '推门', action_text: '推门进入' }],
    creativeReferences: [{ ID: 20, name: '张三', kind: 'person', description: '主角' }],
    assetSlots: [
      { ID: 30, owner_type: 'scene_moment', owner_id: 10, creative_reference_id: 20, name: '门把手', kind: 'prop', description: '需要特写' },
    ],
    contentUnits: [{ ID: 40, segment_id: 1, scene_moment_id: 10, title: '门把手特写', kind: 'shot', description: '镜头贴近门把手' }],
  })

  assert.match(text, /编排段：发现段/)
  assert.match(text, /情节：/)
  assert.match(text, /相关设定资料：/)
  assert.match(text, /相关素材需求：/)
})

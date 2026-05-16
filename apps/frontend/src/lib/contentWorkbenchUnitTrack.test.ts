import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchUnitTrack } from './contentWorkbenchUnitTrack'

test('content workbench unit track explains empty production track', () => {
  const summary = buildContentWorkbenchUnitTrack([])

  assert.equal(summary.total, 0)
  assert.equal(summary.title, '暂无制作项轨道')
  assert.equal(summary.detail, '先创建或让 AI 规划制作项，轨道会显示每个生成目标的准备度。')
})

test('content workbench unit track surfaces blockers across units', () => {
  const summary = buildContentWorkbenchUnitTrack([
    {
      id: 1,
      title: '雨夜全景',
      kind: 'shot',
      durationSec: 4,
      status: 'draft',
      hasPrompt: true,
      assetSlotCount: 2,
      missingSlotCount: 1,
      keyframeCount: 0,
      selected: true,
    },
    {
      id: 2,
      title: '旁白推进',
      kind: 'narration',
      durationSec: 6,
      status: 'confirmed',
      hasPrompt: false,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 1,
    },
  ])

  assert.equal(summary.title, '制作轨道存在阻塞')
  assert.equal(summary.total, 2)
  assert.equal(summary.durationSec, 10)
  assert.equal(summary.blockedCount, 2)
  assert.equal(summary.needsPromptCount, 1)
  assert.equal(summary.missingAssetCount, 1)
  assert.equal(summary.keyframeCount, 1)
  assert.equal(summary.selectedId, '1')
  assert.deepEqual(summary.items[0].blockers, ['缺素材', '缺关键帧'])
  assert.deepEqual(summary.items[1].blockers, ['缺提示'])
})

test('content workbench unit track reports executable track when units are ready', () => {
  const summary = buildContentWorkbenchUnitTrack([
    {
      id: 'ready-1',
      title: '特写',
      durationSec: 3,
      status: 'confirmed',
      hasPrompt: true,
      assetSlotCount: 1,
      missingSlotCount: 0,
      keyframeCount: 2,
    },
  ])

  assert.equal(summary.title, '制作轨道可执行')
  assert.equal(summary.readyCount, 1)
  assert.equal(summary.blockedCount, 0)
  assert.equal(summary.items[0].readiness, 100)
  assert.equal(summary.items[0].tone, 'ready')
})

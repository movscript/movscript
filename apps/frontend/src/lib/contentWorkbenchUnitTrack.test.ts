import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchUnitTrack } from './contentWorkbenchUnitTrack.ts'

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
      summary: '雨夜巷口建立空间',
      keyframeTitles: ['雨夜全景'],
      missingAssetTitles: ['雨夜窄巷'],
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
      summary: '交代人物心境',
      scriptCue: '对白：林夏：我听见雨停了',
      soundCue: '配音：交代人物心境',
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
  assert.equal(summary.items[0].order, 1)
  assert.equal(summary.items[0].startSec, 0)
  assert.equal(summary.items[0].endSec, 4)
  assert.equal(summary.items[0].timeSource, 'estimated')
  assert.equal(summary.items[0].summary, '雨夜巷口建立空间')
  assert.deepEqual(summary.items[0].keyframeTitles, ['雨夜全景'])
  assert.deepEqual(summary.items[0].missingAssetTitles, ['雨夜窄巷'])
  assert.equal(summary.items[1].order, 2)
  assert.equal(summary.items[1].startSec, 4)
  assert.equal(summary.items[1].endSec, 10)
  assert.equal(summary.items[1].scriptCue, '对白：林夏：我听见雨停了')
  assert.equal(summary.items[1].soundCue, '配音：交代人物心境')
  assert.equal(summary.items[1].requiresKeyframe, false)
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

test('content workbench unit track does not require keyframes for non-visual units', () => {
  const summary = buildContentWorkbenchUnitTrack([
    {
      id: 'voice-1',
      title: '心声旁白',
      kind: 'narration',
      durationSec: 5,
      status: 'confirmed',
      hasPrompt: true,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 0,
    },
  ])

  assert.equal(summary.title, '制作轨道可执行')
  assert.equal(summary.items[0].requiresKeyframe, false)
  assert.equal(summary.items[0].readiness, 100)
  assert.deepEqual(summary.items[0].blockers, [])
  assert.equal(summary.items[0].labels[2], '无需关键帧')
})

test('content workbench unit track prefers preview timeline timing when present', () => {
  const summary = buildContentWorkbenchUnitTrack([
    {
      id: 1,
      title: '真实时间线项',
      kind: 'shot',
      startSec: 12,
      durationSec: 4,
      status: 'confirmed',
      hasPrompt: true,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 1,
    },
    {
      id: 2,
      title: '后续估算项',
      kind: 'narration',
      durationSec: 3,
      status: 'confirmed',
      hasPrompt: true,
      assetSlotCount: 0,
      missingSlotCount: 0,
      keyframeCount: 0,
    },
  ])

  assert.equal(summary.durationSec, 19)
  assert.equal(summary.items[0].startSec, 12)
  assert.equal(summary.items[0].endSec, 16)
  assert.equal(summary.items[0].timeSource, 'preview')
  assert.equal(summary.items[1].startSec, 16)
  assert.equal(summary.items[1].endSec, 19)
  assert.equal(summary.items[1].timeSource, 'estimated')
})

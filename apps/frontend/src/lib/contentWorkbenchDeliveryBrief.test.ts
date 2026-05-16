import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchDeliveryBrief } from './contentWorkbenchDeliveryBrief'

test('content workbench delivery brief waits for a selected unit', () => {
  const brief = buildContentWorkbenchDeliveryBrief({
    hasSelectedUnit: false,
    hasPrompt: false,
    assetSlotCount: 0,
    missingSlotCount: 0,
    keyframeCount: 0,
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
  })

  assert.equal(brief.tone, 'empty')
  assert.equal(brief.title, '等待选择制作项')
  assert.deepEqual(brief.blockers, ['未选择制作项'])
})

test('content workbench delivery brief lists production blockers', () => {
  const brief = buildContentWorkbenchDeliveryBrief({
    hasSelectedUnit: true,
    unitTitle: '纸条特写',
    hasPrompt: true,
    assetSlotCount: 2,
    missingSlotCount: 1,
    keyframeCount: 0,
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 2,
  })

  assert.equal(brief.tone, 'blocked')
  assert.equal(brief.title, '交付包仍有阻塞')
  assert.equal(brief.progress, 20)
  assert.deepEqual(brief.blockers, [
    '补齐 1 个素材需求',
    '添加至少一张画面锚点',
    '补齐生成上下文门禁',
    '处理 2 个 AI 草案',
  ])
})

test('content workbench delivery brief allows generation when all inputs are ready', () => {
  const brief = buildContentWorkbenchDeliveryBrief({
    hasSelectedUnit: true,
    unitTitle: '纸条特写',
    hasPrompt: true,
    assetSlotCount: 2,
    missingSlotCount: 0,
    keyframeCount: 3,
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
  })

  assert.equal(brief.tone, 'ready')
  assert.equal(brief.progress, 100)
  assert.deepEqual(brief.blockers, [])
  assert.deepEqual(brief.metrics.map((metric) => metric.value), ['可用', '2 项', '3 帧', '可用', '已处理'])
})

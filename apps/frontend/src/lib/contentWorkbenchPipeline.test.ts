import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchPipeline } from './contentWorkbenchPipeline'

test('content workbench pipeline identifies the first production blocker', () => {
  const summary = buildContentWorkbenchPipeline({
    unitCount: 0,
    keyframeCount: 0,
    missingSlotCount: 0,
    generationContextReady: false,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(summary.title, '生产链路仍有阻塞')
  assert.equal(summary.currentKey, 'production')
  assert.equal(summary.steps[0].tone, 'current')
  assert.equal(summary.steps[1].tone, 'blocked')
  assert.equal(summary.blockedCount, 6)
})

test('content workbench pipeline moves the current blocker to AI review drafts', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewDraftCount: 2,
    runningJobCount: 0,
    completedJobCount: 1,
  })

  assert.equal(summary.currentKey, 'ai_review')
  assert.equal(summary.blockedCount, 1)
  assert.equal(summary.steps.find((step) => step.key === 'ai_review')?.tone, 'current')
  assert.equal(summary.steps.find((step) => step.key === 'generation_plan')?.tone, 'done')
})

test('content workbench pipeline reports generation readiness when all gates are clear', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(summary.title, '生产链路可进入生成')
  assert.equal(summary.blockedCount, 0)
  assert.equal(summary.currentKey, 'generation_plan')
  assert.equal(summary.steps.every((step) => step.tone === 'done' || step.tone === 'pending'), true)
})

test('content workbench pipeline continues from generation into preview delivery', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 0,
    deliveryVersionCount: 0,
  })

  assert.equal(summary.title, '生产链路待交付')
  assert.equal(summary.currentKey, 'preview_delivery')
  assert.equal(summary.steps.at(-1)?.label, '预览交付')
  assert.equal(summary.steps.at(-1)?.tone, 'pending')
})

test('content workbench pipeline marks delivery records as complete', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 3,
    deliveryVersionCount: 1,
  })

  assert.equal(summary.title, '生产链路已交付')
  assert.equal(summary.currentKey, 'preview_delivery')
  assert.equal(summary.steps.at(-1)?.value, '1 版本')
  assert.equal(summary.steps.every((step) => step.tone === 'done'), true)
})

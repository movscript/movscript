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
  assert.equal(brief.progress, 0)
  assert.deepEqual(brief.blockers, ['生成检查仍有 4 项阻塞'])
})

test('content workbench delivery brief allows generation when core inputs are ready', () => {
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
  assert.equal(brief.title, '交付包可进入生成')
  assert.equal(brief.progress, 25)
  assert.deepEqual(brief.blockers, ['执行生成任务'])
  assert.deepEqual(brief.metrics.map((metric) => metric.value), ['已通过', '待执行', '待挂载', '待整理'])
})

test('content workbench delivery brief does not block non-visual units on keyframes', () => {
  const brief = buildContentWorkbenchDeliveryBrief({
    hasSelectedUnit: true,
    unitTitle: '心声旁白',
    hasPrompt: true,
    assetSlotCount: 0,
    missingSlotCount: 0,
    keyframeCount: 0,
    requiresKeyframe: false,
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
  })

  assert.equal(brief.tone, 'ready')
  assert.deepEqual(brief.metrics.map((metric) => metric.value), ['已通过', '待执行', '待挂载', '待整理'])
})

test('content workbench delivery brief moves completed generation into preview', () => {
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
    completedJobCount: 1,
  })

  assert.equal(brief.tone, 'ready')
  assert.equal(brief.title, '交付包待预览')
  assert.equal(brief.progress, 50)
  assert.deepEqual(brief.blockers, ['挂载预览检查'])
})

test('content workbench delivery brief reports closed delivery loop', () => {
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
    completedJobCount: 1,
    previewItemCount: 1,
    deliveryVersionCount: 1,
  })

  assert.equal(brief.tone, 'ready')
  assert.equal(brief.title, '交付包已闭环')
  assert.equal(brief.progress, 100)
  assert.deepEqual(brief.blockers, [])
})

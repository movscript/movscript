import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchPipeline } from '@/features/content/domain/contentWorkbenchPipeline'

test('content workbench pipeline identifies the first production action', () => {
  const summary = buildContentWorkbenchPipeline({
    unitCount: 0,
    keyframeCount: 0,
    missingSlotCount: 0,
    generationContextReady: false,
    pendingReviewWorkspaceCount: 0,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(summary.title, '下一步：制作')
  assert.equal(summary.currentKey, 'production')
  assert.equal(summary.steps[0].state, 'current')
  assert.equal(summary.steps[1].state, 'blocked')
  assert.equal(summary.blockedCount, 6)
})

test('content workbench pipeline moves the current blocker to AI review workspaces', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewWorkspaceCount: 2,
    runningJobCount: 0,
    completedJobCount: 1,
  })

  assert.equal(summary.currentKey, 'ai_review')
  assert.equal(summary.blockedCount, 1)
  assert.equal(summary.steps.find((step) => step.key === 'ai_review')?.state, 'current')
  assert.equal(summary.steps.find((step) => step.key === 'generation_taskGraph')?.state, 'done')
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
    pendingReviewWorkspaceCount: 0,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(summary.title, '下一步：启动生成')
  assert.equal(summary.blockedCount, 0)
  assert.equal(summary.currentKey, 'generation_taskGraph')
  assert.equal(summary.steps.every((step) => step.state === 'done' || step.state === 'pending'), true)
})

test('content workbench pipeline continues from generation into preview', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewWorkspaceCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 0,
  })

  assert.equal(summary.title, '下一步：预览检查')
  assert.equal(summary.currentKey, 'preview')
  assert.equal(summary.steps.at(-1)?.label, '预览检查')
  assert.equal(summary.steps.at(-1)?.state, 'pending')
})

test('content workbench pipeline marks preview records as complete', () => {
  const summary = buildContentWorkbenchPipeline({
    productionTitle: '雨夜重逢制作',
    segmentTitle: '重逢前奏',
    sceneMomentTitle: '旧伞纸条滑落',
    selectedUnitTitle: '纸条特写',
    unitCount: 2,
    keyframeCount: 4,
    missingSlotCount: 0,
    generationContextReady: true,
    pendingReviewWorkspaceCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 3,
  })

  assert.equal(summary.title, '生产链路已预览')
  assert.equal(summary.currentKey, 'preview')
  assert.equal(summary.steps.at(-1)?.value, '3 预览')
  assert.equal(summary.steps.every((step) => step.state === 'done'), true)
})

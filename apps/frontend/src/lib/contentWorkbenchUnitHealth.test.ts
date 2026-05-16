import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContentWorkbenchUnitHealth } from './contentWorkbenchUnitHealth'

test('content workbench unit health waits for selected unit', () => {
  const health = buildContentWorkbenchUnitHealth({
    hasSelectedUnit: false,
    hasPrompt: false,
    assetSlotCount: 0,
    missingSlotCount: 0,
    keyframeCount: 0,
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(health.tone, 'empty')
  assert.equal(health.score, 0)
  assert.deepEqual(health.checks, [])
})

test('content workbench unit health identifies hard generation blockers', () => {
  const health = buildContentWorkbenchUnitHealth({
    hasSelectedUnit: true,
    hasPrompt: false,
    assetSlotCount: 2,
    missingSlotCount: 1,
    keyframeCount: 0,
    generationContextReady: false,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 1,
    runningJobCount: 0,
    completedJobCount: 0,
  })

  assert.equal(health.tone, 'blocked')
  assert.equal(health.title, '制作项不可执行')
  assert.equal(health.score, 0)
  assert.deepEqual(health.checks.filter((check) => check.tone === 'blocked').map((check) => check.key), [
    'prompt',
    'assets',
    'keyframes',
    'generation_context',
  ])
})

test('content workbench unit health separates core readiness from preview delivery', () => {
  const health = buildContentWorkbenchUnitHealth({
    hasSelectedUnit: true,
    hasPrompt: true,
    assetSlotCount: 2,
    missingSlotCount: 0,
    keyframeCount: 3,
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 0,
    deliveryVersionCount: 0,
  })

  assert.equal(health.tone, 'ready')
  assert.equal(health.title, '制作项可进入生产')
  assert.equal(health.score, 95)
  assert.equal(health.checks.find((check) => check.key === 'delivery')?.done, false)
})

test('content workbench unit health reports closed loop after delivery', () => {
  const health = buildContentWorkbenchUnitHealth({
    hasSelectedUnit: true,
    hasPrompt: true,
    assetSlotCount: 2,
    missingSlotCount: 0,
    keyframeCount: 3,
    generationContextReady: true,
    generationContextLoading: false,
    generationContextError: false,
    pendingReviewDraftCount: 0,
    runningJobCount: 0,
    completedJobCount: 1,
    previewItemCount: 1,
    deliveryVersionCount: 1,
  })

  assert.equal(health.tone, 'done')
  assert.equal(health.score, 100)
  assert.equal(health.title, '制作项已闭环')
})

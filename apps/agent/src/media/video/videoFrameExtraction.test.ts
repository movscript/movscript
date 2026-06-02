import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFrameSamplingPlan } from './videoFrameExtraction.js'

test('buildFrameSamplingPlan keeps overview sampling bounded and away from hard edges', () => {
  const plan = buildFrameSamplingPlan({ count: 4 }, { durationSec: 10 })

  assert.equal(plan.mode, 'overview')
  assert.equal(plan.maxFrames, 8)
  assert.deepEqual(plan.timestampsSec, [0.8, 3.6, 6.4, 9.2])
  assert.equal(plan.requestedFrameCount, 4)
  assert.equal(plan.returnedFrameCount, 4)
})

test('buildFrameSamplingPlan supports exact timestamp inspection with max frame budget', () => {
  const plan = buildFrameSamplingPlan({
    timestampsSec: [0, 1.23456, 20, 21, 22],
    maxFrames: 3,
  }, { durationSec: 20 })

  assert.equal(plan.mode, 'timestamps')
  assert.deepEqual(plan.timestampsSec, [0, 1.235, 20])
  assert.equal(plan.requestedFrameCount, 5)
  assert.equal(plan.returnedFrameCount, 3)
  assert.match(plan.warnings.join('\n'), /returned the first 3/)
})

test('buildFrameSamplingPlan samples a range by fps and downsamples long requests', () => {
  const plan = buildFrameSamplingPlan({
    mode: 'range',
    startSec: 10,
    endSec: 14,
    fps: 2,
    maxFrames: 5,
  }, { durationSec: 30 })

  assert.equal(plan.mode, 'range')
  assert.equal(plan.startSec, 10)
  assert.equal(plan.endSec, 14)
  assert.equal(plan.fps, 2)
  assert.deepEqual(plan.timestampsSec, [10, 11, 12, 13, 14])
  assert.equal(plan.requestedFrameCount, 9)
  assert.equal(plan.returnedFrameCount, 5)
  assert.match(plan.warnings.join('\n'), /downsampled to 5/)
})

test('buildFrameSamplingPlan samples a burst around a center second', () => {
  const plan = buildFrameSamplingPlan({
    centerSec: 12,
    windowSec: 2,
    intervalSec: 0.5,
    maxFrames: 8,
  }, { durationSec: 20 })

  assert.equal(plan.mode, 'burst')
  assert.equal(plan.centerSec, 12)
  assert.equal(plan.windowSec, 2)
  assert.equal(plan.startSec, 11)
  assert.equal(plan.endSec, 13)
  assert.equal(plan.intervalSec, 0.5)
  assert.deepEqual(plan.timestampsSec, [11, 11.5, 12, 12.5, 13])
})

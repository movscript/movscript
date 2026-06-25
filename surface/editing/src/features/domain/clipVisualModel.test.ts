import test from 'node:test'
import assert from 'node:assert/strict'

import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'

import {
  clipPositionPercent,
  clipScaleFromPercent,
  clipScalePercent,
  cssObjectFitForClip,
  normalizeClipVisualTransformPatch,
  previewClipFrameStyle,
} from './clipVisualModel'

test('clip visual model clamps scale and position controls', () => {
  assert.equal(clipScalePercent(clipFixture({ scale: 0.1 })), 25)
  assert.equal(clipScalePercent(clipFixture({ scale: 8 })), 400)
  assert.equal(clipScaleFromPercent(125), 1.25)
  assert.equal(clipPositionPercent(-20), 0)
  assert.equal(clipPositionPercent(140), 100)
  assert.equal(clipPositionPercent(undefined), 50)
})

test('clip visual model converts UI patches into normalized clip transforms', () => {
  assert.deepEqual(
    normalizeClipVisualTransformPatch({ scale: 2, xPercent: 120, yPercent: -10 }),
    { scale: 2, xPercent: 100, yPercent: 0 },
  )
})

test('clip visual model derives preview frame and object-fit styles', () => {
  assert.deepEqual(
    previewClipFrameStyle(clipFixture({ scale: 1.5, xPercent: 25, yPercent: 75 })),
    {
      left: '25%',
      top: '75%',
      transform: 'translate(-50%, -50%) scale(1.5)',
    },
  )
  assert.equal(cssObjectFitForClip(clipFixture({ fit: 'crop' })), 'cover')
  assert.equal(cssObjectFitForClip(clipFixture({ fit: 'none' })), 'none')
  assert.equal(cssObjectFitForClip(clipFixture({ fit: 'contain' })), 'contain')
})

function clipFixture(patch: Partial<ElectronMediaPipelineClip>): ElectronMediaPipelineClip {
  return {
    id: 'clip',
    assetType: 'video',
    timelineStartMs: 0,
    durationMs: 1000,
    sourceStartMs: 0,
    sourceEndMs: 1000,
    fit: 'contain',
    ...patch,
  }
}

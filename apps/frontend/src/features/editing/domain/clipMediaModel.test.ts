import test from 'node:test'
import assert from 'node:assert/strict'

import type { ElectronMediaPipelineAssetDescriptor } from '@/shared/contracts/electronApiMedia'

import {
  assetAspectRatio,
  clipAssetDurationMs,
  defaultClipDurationMs,
  normalizeClipSourceStartMs,
  numberMetadata,
} from './clipMediaModel'

test('clip media model normalizes positive metadata numbers only', () => {
  assert.equal(numberMetadata('12.5'), 12.5)
  assert.equal(numberMetadata(42), 42)
  assert.equal(numberMetadata(0), undefined)
  assert.equal(numberMetadata('bad'), undefined)
})

test('clip media model derives aspect ratio and duration from media metadata', () => {
  const asset = assetFixture({
    width: '1920',
    height: 1080,
    duration: '2.5',
  })

  assert.equal(assetAspectRatio(asset), 16 / 9)
  assert.equal(clipAssetDurationMs(asset), 2500)
})

test('clip media model clamps source starts for timed assets but not images', () => {
  assert.equal(normalizeClipSourceStartMs(9900, 10000, 'video'), 9800)
  assert.equal(normalizeClipSourceStartMs(9900, 10000, 'image'), 9900)
})

test('clip media model keeps stable default durations by asset type', () => {
  assert.equal(defaultClipDurationMs(assetFixture({ durationMs: 1234 }, 'video')), 1234)
  assert.equal(defaultClipDurationMs(assetFixture({}, 'audio')), 10000)
  assert.equal(defaultClipDurationMs(assetFixture({}, 'text')), 3000)
  assert.equal(defaultClipDurationMs(assetFixture({}, 'image')), 5000)
})

function assetFixture(
  metadata: Record<string, unknown>,
  assetType: ElectronMediaPipelineAssetDescriptor['assetType'] = 'video',
): ElectronMediaPipelineAssetDescriptor {
  return {
    id: `asset_${assetType}`,
    assetType,
    label: assetType,
    uri: `file://${assetType}`,
    metadata,
  }
}

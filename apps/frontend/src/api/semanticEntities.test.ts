import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve('src/api/semanticEntities.ts'), 'utf8')

test('asset slot candidate config supports resource-based candidate creation', () => {
  assert.match(source, /cfg\('assetSlotCandidates'[\s\S]*num\('resource_id', 'Resource ID', false, true, '创建时可直接填资源 ID/)
  assert.match(source, /创建时需要填写 asset_slot_id，并提供 candidate_asset_slot_id 或 resource_id/)
  assert.match(source, /传入 resource_id 时会自动创建候选素材位/)
})

test('official asset slot and keyframe configs hide direct resource adoption fields', () => {
  const keyframesBlock = source.match(/cfg\('keyframes'[\s\S]*?\n    \]\)/)?.[0] ?? ''
  const assetSlotsBlock = source.match(/cfg\('assetSlots'[\s\S]*?\n    \]\)/)?.[0] ?? ''

  assert.doesNotMatch(keyframesBlock, /num\('resource_id'/)
  assert.doesNotMatch(assetSlotsBlock, /num\('resource_id'/)
  assert.doesNotMatch(assetSlotsBlock, /num\('locked_asset_slot_id'/)
})

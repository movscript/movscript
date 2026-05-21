import assert from 'node:assert/strict'
import test from 'node:test'
import {
  byOrder,
  clampProgress,
  dedupeRecords,
  firstText,
  formatDuration,
  normalizeEntityTitleKey,
  numberOf,
  titleOfRecord,
} from './contentWorkbenchRecordUtils.ts'

test('content workbench record utils preserve page formatting semantics', () => {
  assert.equal(firstText('', null, false, 'fallback'), 'false')
  assert.equal(normalizeEntityTitleKey('  Rain Night  '), 'rainnight')
  assert.equal(titleOfRecord({ ID: 7, slot_key: 'hero-slot' }), 'hero-slot')
  assert.equal(titleOfRecord(null), '未选择')
  assert.equal(numberOf('4.5'), 4.5)
  assert.equal(formatDuration(4.4), '4s')
  assert.equal(formatDuration(0), '未设时长')
  assert.equal(clampProgress(Number.NaN), 0)
  assert.deepEqual(dedupeRecords([{ ID: 1 }, { ID: 1 }, { ID: 2 }]), [{ ID: 1 }, { ID: 2 }])
  assert.deepEqual([
    { ID: 3 },
    { ID: 2, order: 10 },
    { ID: 1, order: 1 },
  ].sort(byOrder).map((record) => record.ID), [1, 3, 2])
})

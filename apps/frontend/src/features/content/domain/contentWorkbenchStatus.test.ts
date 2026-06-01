import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apiErrorMessage,
  assetSlotWorkStatus,
  contentUnitWorkStatus,
  normalizeAssetSlotStatus,
  priorityLabel,
  statusLabel,
} from '@/features/content/domain/contentWorkbenchStatus.ts'

test('content workbench status helpers preserve labels and readiness semantics', () => {
  assert.equal(statusLabel('blocked'), '补信息')
  assert.equal(priorityLabel('medium'), '正常处理')
  assert.equal(normalizeAssetSlotStatus('bad'), 'missing')
  assert.equal(assetSlotWorkStatus({ status: 'candidate' }), 'review')
  assert.equal(assetSlotWorkStatus({ status: 'candidate', resource_id: 4 }), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, []), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, [{ status: 'missing' }]), 'blocked')
})

test('content workbench status helpers unwrap backend error payloads', () => {
  assert.equal(apiErrorMessage({ response: { data: { message: '后端错误' } } }, 'fallback'), '后端错误')
  assert.equal(apiErrorMessage(new Error('本地错误'), 'fallback'), '本地错误')
  assert.equal(apiErrorMessage({}, 'fallback'), 'fallback')
})

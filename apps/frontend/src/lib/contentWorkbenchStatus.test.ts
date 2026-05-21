import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apiErrorMessage,
  assetSlotWorkStatus,
  contentUnitWorkStatus,
  decisionVariant,
  normalizeAssetSlotStatus,
  priorityLabel,
  resourceFileUrl,
  statusLabel,
  statusVariant,
} from './contentWorkbenchStatus.ts'

test('content workbench status helpers preserve labels and readiness semantics', () => {
  assert.equal(statusLabel('blocked'), '阻塞')
  assert.equal(statusVariant('ready'), 'success')
  assert.equal(priorityLabel('medium'), '中')
  assert.equal(decisionVariant('warning'), 'warning')
  assert.equal(normalizeAssetSlotStatus('bad'), 'missing')
  assert.equal(assetSlotWorkStatus({ status: 'candidate' }), 'review')
  assert.equal(assetSlotWorkStatus({ status: 'candidate', resource_id: 4 }), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, []), 'ready')
  assert.equal(contentUnitWorkStatus({ status: 'confirmed' }, [{ status: 'missing' }]), 'blocked')
  assert.equal(resourceFileUrl(12), '/api/v1/resources/12/file')
})

test('content workbench status helpers unwrap backend error payloads', () => {
  assert.equal(apiErrorMessage({ response: { data: { message: '后端错误' } } }, 'fallback'), '后端错误')
  assert.equal(apiErrorMessage(new Error('本地错误'), 'fallback'), '本地错误')
  assert.equal(apiErrorMessage({}, 'fallback'), 'fallback')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlockingCatalogIssue } from './catalogIssueBlocking.js'

test('isBlockingCatalogIssue blocks catalog errors except the transitional config file issue', () => {
  assert.equal(isBlockingCatalogIssue({ level: 'warning', resourceId: 'pack.a' }), false)
  assert.equal(isBlockingCatalogIssue({ level: 'error', resourceId: 'movscript.config_file.base' }), false)
  assert.equal(isBlockingCatalogIssue({ level: 'error', resourceId: 'pack.a' }), true)
})

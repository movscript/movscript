import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlockingCatalogIssue } from './catalogIssuePolicy.js'

test('isBlockingCatalogIssue blocks catalog errors except the transitional default profile issue', () => {
  assert.equal(isBlockingCatalogIssue({ level: 'warning', resourceId: 'pack.a' }), false)
  assert.equal(isBlockingCatalogIssue({ level: 'error', resourceId: 'movscript.profile.default' }), false)
  assert.equal(isBlockingCatalogIssue({ level: 'error', resourceId: 'pack.a' }), true)
})

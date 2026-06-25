import assert from 'node:assert/strict'
import test from 'node:test'
import { adminHref } from './adminRoutes'

test('adminHref prefixes admin basename when current path is mounted under admin', () => {
  assert.equal(adminHref('/usage-logs?user_id=7', '/admin/models'), '/admin/usage-logs?user_id=7')
  assert.equal(adminHref('debug?tab=jobs', '/admin'), '/admin/debug?tab=jobs')
})

test('adminHref leaves hrefs relative to the normal root mount', () => {
  assert.equal(adminHref('/usage-logs?user_id=7', '/models'), '/usage-logs?user_id=7')
  assert.equal(adminHref('debug?tab=jobs', '/'), '/debug?tab=jobs')
})

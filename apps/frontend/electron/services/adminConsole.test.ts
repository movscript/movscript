import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAdminConsolePath, resolveAdminConsoleURL } from './adminConsole'

test('normalizeAdminConsolePath accepts root, admin, and nested admin paths', () => {
  assert.equal(normalizeAdminConsolePath(''), '')
  assert.equal(normalizeAdminConsolePath('/admin'), '')
  assert.equal(normalizeAdminConsolePath('/admin/models'), '/models')
  assert.equal(normalizeAdminConsolePath('debug?tab=jobs'), '/debug?tab=jobs')
})

test('resolveAdminConsoleURL builds admin URLs from backend origins', () => {
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766' }), 'http://localhost:8766/admin')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766/api/v1', path: '/admin/models' }), 'http://localhost:8766/admin/models')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'https://api.example.com/', path: 'debug?tab=jobs' }), 'https://api.example.com/admin/debug?tab=jobs')
})

test('resolveAdminConsoleURL rejects unsupported protocols', () => {
  assert.throws(() => resolveAdminConsoleURL({ baseURL: 'file:///tmp/app' }), /http or https/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { adminConsoleURL } from './adminConsole'

test('adminConsoleURL builds admin root from backend base URL', () => {
  assert.equal(adminConsoleURL('http://localhost:8766'), 'http://localhost:8766/admin')
  assert.equal(adminConsoleURL('http://localhost:8766/'), 'http://localhost:8766/admin')
})

test('adminConsoleURL appends admin subpaths safely', () => {
  assert.equal(adminConsoleURL('http://localhost:8766/api/v1', '/models'), 'http://localhost:8766/admin/models')
  assert.equal(adminConsoleURL('http://localhost:8766', '/admin/models'), 'http://localhost:8766/admin/models')
  assert.equal(adminConsoleURL('https://api.example.com', 'debug?tab=jobs'), 'https://api.example.com/admin/debug?tab=jobs')
})

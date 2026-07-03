import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAdminConsolePath, resolveAdminConsoleURL } from './adminConsole'

test('normalizeAdminConsolePath accepts root, admin, and nested admin paths', () => {
  assert.equal(normalizeAdminConsolePath(''), '')
  assert.equal(normalizeAdminConsolePath('/admin'), '')
  assert.equal(normalizeAdminConsolePath('/admin/models'), '/models')
  assert.equal(normalizeAdminConsolePath('debug?tab=jobs'), '/debug?tab=jobs')
})

test('resolveAdminConsoleURL builds Electron-hosted admin URLs with API target', () => {
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766' }), 'movscript-admin://app/?gatewayBaseURL=http%3A%2F%2Flocalhost%3A8766')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766/api/v1', path: '/admin/models' }), 'movscript-admin://app/models?gatewayBaseURL=http%3A%2F%2Flocalhost%3A8766')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'https://api.example.com/', path: 'debug?tab=jobs' }), 'movscript-admin://app/debug?tab=jobs&gatewayBaseURL=https%3A%2F%2Fapi.example.com')
})

test('resolveAdminConsoleURL can target a dev admin renderer', () => {
  assert.equal(
    resolveAdminConsoleURL(
      { baseURL: 'http://localhost:8766', path: '/models' },
      { rendererURL: 'http://127.0.0.1:5174' },
    ),
    'http://127.0.0.1:5174/models?gatewayBaseURL=http%3A%2F%2Flocalhost%3A8766',
  )
})

test('resolveAdminConsoleURL passes admin auth through URL hash', () => {
  const url = resolveAdminConsoleURL({
    baseURL: 'http://localhost:8766',
    authSession: {
      token: 'session-token',
      user: { ID: 1, username: 'admin', system_role: 'super_admin' },
      current_org_id: 2,
      api_base_url: 'http://localhost:8765',
      theme: 'dark',
      language: 'zh-CN',
    },
  })
  assert.match(url, /^movscript-admin:\/\/app\/\?gatewayBaseURL=http%3A%2F%2Flocalhost%3A8766#authSession=/)
  assert.equal(url.includes('session-token'), false)
  assert.equal(url.includes('zh-CN'), false)
  const parsed = new URL(url)
  const encoded = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('authSession')
  assert.ok(encoded)
  const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  assert.equal(session.api_base_url, 'http://localhost:8765')
  assert.equal(session.theme, 'dark')
  assert.equal(session.language, 'zh-CN')
})

test('resolveAdminConsoleURL passes local admin auth without a token', () => {
  const url = resolveAdminConsoleURL({
    baseURL: 'http://localhost:8766',
    authSession: {
      user: { ID: 1, username: 'Local Workspace', system_role: 'super_admin' },
      org_memberships: [{ org_id: 1, org_name: 'Local Workspace', role: 'owner' }],
      current_org_id: 1,
      api_base_url: 'http://localhost:8766',
      theme: 'light',
      language: 'zh-CN',
    },
  })
  const encoded = new URLSearchParams(new URL(url).hash.replace(/^#/, '')).get('authSession')
  assert.ok(encoded)
  const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  assert.equal(session.token, undefined)
  assert.equal(session.user.system_role, 'super_admin')
  assert.equal(session.api_base_url, 'http://localhost:8766')
})

test('resolveAdminConsoleURL rejects unsupported protocols', () => {
  assert.throws(() => resolveAdminConsoleURL({ baseURL: 'file:///tmp/app' }), /http or https/)
})

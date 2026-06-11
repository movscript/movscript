import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  backendErrorMessage,
  needsModelSetupAction,
  normalizeAdminConsoleBaseURL,
  normalizeAdminConsolePath,
  normalizeBackendHTTPError,
  parseJSONBody,
  resolveAdminConsoleURL,
  resolveAPIErrorResponseIntent,
  stringErrorValue,
} from '../dist/backend/index.js'

test('core backend errors normalize HTTP error payloads', () => {
  assert.deepEqual(normalizeBackendHTTPError('POST', '/jobs', 400, {
    error: 'bad request',
    code: 'INVALID_INPUT',
    field: 'prompt',
    suggested_fix: { prompt: 'required' },
  }), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body: {
      error: 'bad request',
      code: 'INVALID_INPUT',
      field: 'prompt',
      suggested_fix: { prompt: 'required' },
    },
    code: 'INVALID_INPUT',
    field: 'prompt',
    suggested_fix: { prompt: 'required' },
  })
  assert.deepEqual(parseJSONBody('{"ok":true}'), { ok: true })
  assert.equal(parseJSONBody('not json'), 'not json')
  assert.equal(backendErrorMessage({ error: 'backend failed' }, 'raw'), 'backend failed')
})

test('core backend classifies model setup actionable errors', () => {
  assert.equal(needsModelSetupAction('no model config found - configure a backend model config first'), true)
  assert.equal(needsModelSetupAction(new Error('no text-capable model configured and enabled')), true)
  assert.equal(needsModelSetupAction({ error: { message: 'model config id=3 is disabled' } }), true)
  assert.equal(needsModelSetupAction({ message: 'credential for model config id=2 is disabled' }), true)
  assert.equal(needsModelSetupAction('没有可用的 video 模型配置，请先在管理后台配置可用模型'), true)
  assert.equal(needsModelSetupAction('MCP server is unavailable'), false)
  assert.equal(needsModelSetupAction({ error: 'project not found' }), false)
})

test('core backend resolves admin console URLs without frontend runtime state', () => {
  assert.equal(normalizeAdminConsoleBaseURL(' http://localhost:8766/api/v1/ '), 'http://localhost:8766')
  assert.equal(normalizeAdminConsolePath(''), '')
  assert.equal(normalizeAdminConsolePath('/admin'), '')
  assert.equal(normalizeAdminConsolePath('/admin/models'), '/models')
  assert.equal(normalizeAdminConsolePath('debug?tab=jobs'), '/debug?tab=jobs')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766' }), 'http://localhost:8766/admin')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'http://localhost:8766/api/v1', path: '/admin/models' }), 'http://localhost:8766/admin/models')
  assert.equal(resolveAdminConsoleURL({ baseURL: 'https://api.example.com/', path: 'debug?tab=jobs' }), 'https://api.example.com/admin/debug?tab=jobs')
  assert.throws(() => resolveAdminConsoleURL({ baseURL: 'file:///tmp/app' }), /http or https/)
})

test('core backend resolves API error response intents without translating display copy', () => {
  assert.deepEqual(resolveAPIErrorResponseIntent({ code: 'AUTH_REQUIRED', message: '请先登录' }), {
    type: 'translation',
    key: 'apiErrors.authRequired',
    defaultRaw: '请先登录',
    useFallbackDefault: true,
  })
  assert.deepEqual(resolveAPIErrorResponseIntent({ error: { message: '目标对象不存在' } }), {
    type: 'raw',
    raw: '目标对象不存在',
  })
  assert.deepEqual(resolveAPIErrorResponseIntent({ message: 'missing required credential: api_key' }), {
    type: 'translation',
    key: 'apiErrors.missingCredentialField',
    detail: 'api_key',
  })
  assert.deepEqual(resolveAPIErrorResponseIntent({
    message: 'keep backend generation detail',
    debug: { code: 'GENERATION_CONTEXT_MISSING_RESOURCE' },
  }), {
    type: 'raw',
    raw: 'keep backend generation detail',
  })
  assert.deepEqual(resolveAPIErrorResponseIntent({}), { type: 'fallback' })
  assert.equal(stringErrorValue({ error: { detail: 'nested detail' } }), 'nested detail')
})

test('core backend actionable error rules stay independent from frontend runtime', () => {
  const source = readFileSync(new URL('../src/backend/actionableErrors.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/backend/adminConsole.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/backend/apiErrorIntent.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})

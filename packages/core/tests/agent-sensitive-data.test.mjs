import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatAgentTraceDebugData,
  hasSensitiveTextSecret,
  hasSensitiveURLSecret,
  redactAgentTraceDebugData,
  redactAgentTraceDebugText,
  stripSensitiveURLSecrets,
} from '../dist/agent/index.js'

test('core sensitive data redaction removes secret-like headers and credentials', () => {
  const redacted = redactAgentTraceDebugData({
    request: {
      headers: {
        authorization: 'Bearer sk-live-secret',
        'x-trace-id': 'trace_123',
        cookie: 'session=secret',
      },
      body: {
        model: 'model_config:debug',
        messages: [{ role: 'user', content: '保留真实调试消息' }],
        api_key: 'provider-secret',
        input_tokens: 123,
      },
    },
  })

  assert.equal(redacted.request.headers.authorization, '[已脱敏]')
  assert.equal(redacted.request.headers.cookie, '[已脱敏]')
  assert.equal(redacted.request.headers['x-trace-id'], 'trace_123')
  assert.equal(redacted.request.body.api_key, '[已脱敏]')
  assert.equal(redacted.request.body.input_tokens, 123)
  assert.equal(redacted.request.body.messages[0]?.content, '保留真实调试消息')
})

test('core sensitive data helpers detect provider keys and inline token assignments', () => {
  assert.equal(hasSensitiveTextSecret('gpt-5.1'), false)
  assert.equal(hasSensitiveTextSecret('claude-sonnet-4-5'), false)
  assert.equal(hasSensitiveTextSecret('sk-proj-exampleSecretValue123456789'), true)
  assert.equal(hasSensitiveTextSecret('authorization: Bearer direct-secret-token'), true)
  assert.equal(hasSensitiveTextSecret('https://api.example.test/v1?api_key=secret'), true)
})

test('core sensitive data redacts URLs, raw JSON strings, fallback strings, and circular payloads', () => {
  const formatted = formatAgentTraceDebugData({
    event: {
      data: {
        response: {
          bodyText: '{"id":"chatcmpl_1","api_key":"provider-secret","choices":[{"message":{"content":"保留模型回复"}}]}',
        },
      },
    },
    response: {
      directUrl: 'https://cdn.example.test/private/result.png?token=secret-token&width=1024&signature=private-signature',
    },
  })

  assert.match(formatted, /\[已脱敏\]/)
  assert.match(formatted, /保留模型回复/)
  assert.match(formatted, /width=1024/)
  assert.doesNotMatch(formatted, /provider-secret/)
  assert.doesNotMatch(formatted, /secret-token/)
  assert.doesNotMatch(formatted, /private-signature/)

  const payload = { id: 'trace_1' }
  payload.self = payload
  assert.match(formatAgentTraceDebugData(payload), /循环引用/)

  const fallback = {
    id: 1n,
    toString() {
      return 'api_key=fallback-secret https://user:pass@gateway.example.test/v1'
    },
  }
  assert.doesNotMatch(formatAgentTraceDebugData(fallback), /fallback-secret|user:pass/)
})

test('core sensitive data text and URL helpers redact without hiding normal content', () => {
  const text = redactAgentTraceDebugText('Authorization: Bearer provider-secret api_key=plain-secret prompt=保留调试文本')
  assert.match(text, /Authorization: Bearer \[已脱敏\]/)
  assert.match(text, /api_key=\[已脱敏\]/)
  assert.match(text, /prompt=保留调试文本/)
  assert.doesNotMatch(text, /provider-secret/)
  assert.doesNotMatch(text, /plain-secret/)

  const url = 'https://user:pass@api.example.test/v1?api_key=secret&project=demo&signature=sig'
  const stripped = stripSensitiveURLSecrets(url)
  assert.equal(hasSensitiveURLSecret(url), true)
  assert.equal(hasSensitiveURLSecret(stripped), false)
  assert.match(stripped, /project=demo/)
  assert.doesNotMatch(stripped, /user:pass@/)
  assert.doesNotMatch(stripped, /api_key|signature/)
})

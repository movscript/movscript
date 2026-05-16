import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAgentTraceDebugData, redactAgentTraceDebugData } from './agentTraceDebugData'

test('redactAgentTraceDebugData removes secret-like headers and credentials', () => {
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
  }) as {
    request: {
      headers: Record<string, unknown>
      body: { messages: Array<{ content: string }>; api_key: string; input_tokens: number }
    }
  }

  assert.equal(redacted.request.headers.authorization, '[已脱敏]')
  assert.equal(redacted.request.headers.cookie, '[已脱敏]')
  assert.equal(redacted.request.headers['x-trace-id'], 'trace_123')
  assert.equal(redacted.request.body.api_key, '[已脱敏]')
  assert.equal(redacted.request.body.input_tokens, 123)
  assert.equal(redacted.request.body.messages[0]?.content, '保留真实调试消息')
})

test('formatAgentTraceDebugData redacts signed URL query secrets', () => {
  const formatted = formatAgentTraceDebugData({
    response: {
      directUrl: 'https://cdn.example.test/private/result.png?token=secret-token&width=1024&signature=private-signature',
    },
  })

  assert.match(formatted, /token=%5B%E5%B7%B2%E8%84%B1%E6%95%8F%5D/)
  assert.match(formatted, /signature=%5B%E5%B7%B2%E8%84%B1%E6%95%8F%5D/)
  assert.match(formatted, /width=1024/)
  assert.doesNotMatch(formatted, /secret-token/)
  assert.doesNotMatch(formatted, /private-signature/)
})

test('formatAgentTraceDebugData handles circular debug payloads', () => {
  const payload: { id: string; self?: unknown } = { id: 'trace_1' }
  payload.self = payload

  assert.match(formatAgentTraceDebugData(payload), /循环引用/)
})

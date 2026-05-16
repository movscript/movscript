import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAgentTraceDebugData, redactAgentTraceDebugData, redactAgentTraceDebugText } from './agentTraceDebugData'

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

  assert.match(formatted, /token=\[已脱敏\]/)
  assert.match(formatted, /signature=\[已脱敏\]/)
  assert.match(formatted, /width=1024/)
  assert.doesNotMatch(formatted, /secret-token/)
  assert.doesNotMatch(formatted, /private-signature/)
})

test('formatAgentTraceDebugData redacts secret-like keys inside nested JSON strings', () => {
  const formatted = formatAgentTraceDebugData({
    event: {
      data: {
        response: {
          bodyText: '{"id":"chatcmpl_1","api_key":"provider-secret","choices":[{"message":{"content":"保留模型回复"}}]}',
        },
      },
    },
  })

  assert.match(formatted, /\[已脱敏\]/)
  assert.match(formatted, /保留模型回复/)
  assert.doesNotMatch(formatted, /provider-secret/)
})

test('formatAgentTraceDebugData redacts duplicated run trace event response bodies', () => {
  const formatted = formatAgentTraceDebugData({
    run: {
      traceEvents: [{
        data: {
          response: {
            bodyText: '{"api_key":"duplicated-secret","choices":[{"message":{"content":"debug reply"}}]}',
          },
        },
      }],
    },
    events: [{
      data: {
        response: {
          bodyText: '{"api_key":"event-secret","choices":[{"message":{"content":"event reply"}}]}',
        },
      },
    }],
  })

  assert.match(formatted, /debug reply/)
  assert.match(formatted, /event reply/)
  assert.doesNotMatch(formatted, /duplicated-secret/)
  assert.doesNotMatch(formatted, /event-secret/)
})

test('formatAgentTraceDebugData handles circular debug payloads', () => {
  const payload: { id: string; self?: unknown } = { id: 'trace_1' }
  payload.self = payload

  assert.match(formatAgentTraceDebugData(payload), /循环引用/)
})

test('redactAgentTraceDebugText redacts model detail URL and raw JSON body strings', () => {
  const url = redactAgentTraceDebugText('https://model-gateway.example.test/chat?api_key=provider-secret&request_id=req_1')
  assert.match(url, /api_key=\[已脱敏\]/)
  assert.match(url, /request_id=req_1/)
  assert.doesNotMatch(url, /provider-secret/)

  const rawBody = redactAgentTraceDebugText('{"id":"chatcmpl_1","api_key":"provider-secret","choices":[{"message":{"content":"保留模型回复"}}]}')
  assert.match(rawBody, /"\[已脱敏\]"/)
  assert.match(rawBody, /保留模型回复/)
  assert.doesNotMatch(rawBody, /provider-secret/)
})

test('redactAgentTraceDebugText redacts inline text secrets without hiding normal content', () => {
  const text = redactAgentTraceDebugText('Authorization: Bearer provider-secret api_key=plain-secret prompt=保留调试文本')

  assert.match(text, /Authorization: Bearer \[已脱敏\]/)
  assert.match(text, /api_key=\[已脱敏\]/)
  assert.match(text, /prompt=保留调试文本/)
  assert.doesNotMatch(text, /provider-secret/)
  assert.doesNotMatch(text, /plain-secret/)
})

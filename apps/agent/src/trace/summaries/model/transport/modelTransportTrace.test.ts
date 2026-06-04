import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeModelHTTPTrace } from './modelTransportTrace.js'
import type { RuntimeModelHTTPTrace } from '../../../../model/config/modelConfig.js'

describe('model transport trace domain', () => {
  test('summarizes model HTTP payloads while retaining full response bodies', () => {
    const trace: RuntimeModelHTTPTrace = {
      latencyMs: 42,
      request: {
        url: 'https://model.example/v1/chat/completions',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'gpt-test',
          messages: [
            { role: 'system', content: 'rules' },
            { role: 'user', content: 'hello' },
          ],
          tools: [{ type: 'function', function: { name: 'lookup' } }],
        },
      },
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: { 'content-type': 'application/json' },
        bodyText: '{"id":"chatcmpl_1","choices":[{"message":{"content":"reply"}}]}',
        parsedBody: { id: 'chatcmpl_1', choices: [{ message: { content: 'reply' } }] },
        content: 'reply',
      },
    }

    const summary = summarizeModelHTTPTrace(trace) as any

    assert.equal(summary.request.url, trace.request.url)
    assert.equal(summary.request.body.model, 'gpt-test')
    assert.equal(summary.request.body.messageCount, 2)
    assert.equal(summary.request.body.toolCount, 1)
    assert.equal(summary.request.body.contentMode, 'summary')
    assert.match(summary.request.body.bodyHash, /^sha256:/)
    assert.equal(typeof summary.request.body.bodyChars, 'number')
    assert.equal(summary.request.body.messages, undefined)
    assert.equal(summary.request.body.tools, undefined)
    assert.equal(summary.response.status, 200)
    assert.equal(summary.response.contentChars, 5)
    assert.equal(summary.response.parsedBody.id, 'chatcmpl_1')
    assert.equal(summary.response.parsedBody.choiceCount, 1)
    assert.match(summary.response.bodyTextHash, /^sha256:/)
    assert.equal(summary.response.bodyTextChars, trace.response?.bodyText.length)
    assert.equal(summary.response.bodyText, trace.response?.bodyText)
    assert.equal(summary.response.content, 'reply')
  })

  test('summarizes OpenAI Responses sdk_body shapes using submitted body counts', () => {
    const trace: RuntimeModelHTTPTrace = {
      latencyMs: 10,
      request: {
        url: 'https://model.example/v1/responses',
        method: 'POST',
        headers: {},
        body: {
          model: 'gateway-wrapper',
          messages: [],
          sdk_body: {
            model: 'gpt-responses',
            input: [{ role: 'user', content: 'hello' }],
            tools: [{ type: 'function', name: 'lookup' }],
          },
        },
      },
    }

    const summary = summarizeModelHTTPTrace(trace) as any

    assert.equal(summary.request.body.model, 'gpt-responses')
    assert.equal(summary.request.body.messageCount, 1)
    assert.equal(summary.request.body.toolCount, 1)
    assert.equal(summary.request.body.sdk_body, undefined)
    assert.equal(summary.response, undefined)
  })
})

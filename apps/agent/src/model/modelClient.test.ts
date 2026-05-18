import assert from 'node:assert/strict'
import test from 'node:test'
import { callModel } from './modelClient.js'
import type { ConfiguredRuntimeModelConfig, RuntimeModelTraceCallback } from './modelConfig.js'

const CONFIG: ConfiguredRuntimeModelConfig = {
  provider: 'backend-model-config',
  modelConfigId: 21,
  model: 'model_config:21',
  useForChat: true,
  useForPlanner: true,
  updatedAt: new Date(0).toISOString(),
}

test('callModel retries empty assistant gateway responses with exponential backoff', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls < 3) {
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'test-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 3, initialDelayMs: 0 },
    })

    assert.equal(calls, 3)
    assert.equal(result.content, 'recovered')
    assert.equal(result.finish_reason, 'stop')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel normalizes only object-shaped gateway tool calls', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              ['not', 'a', 'record'],
              { id: 'call_bad', type: 'function', function: ['also', 'bad'] },
              { id: 'call_ok', type: 'function', function: { name: 'movscript_get_context', arguments: '{"ok":true}' } },
            ],
          },
          finish_reason: 'tool_calls',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'test-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 1, initialDelayMs: 0 },
    })

    assert.equal(result.finish_reason, 'tool_calls')
    assert.deepEqual(result.tool_calls, [{
      id: 'call_ok',
      type: 'function',
      function: { name: 'movscript_get_context', arguments: '{"ok":true}' },
    }])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel stops retrying empty assistant responses after the configured attempts', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    await assert.rejects(
      callModel({
        config: CONFIG,
        auth: { backendAuthToken: 'test-token' },
        messages: [{ role: 'user', content: 'hello' }],
        retry: { maxAttempts: 2, initialDelayMs: 0 },
      }),
      /backend model gateway returned no assistant content and no tool calls/,
    )

    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries direct HTTP 429 gateway responses with exponential backoff', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'user requests-per-minute limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }), { status: 429 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'after retry' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'test-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'after retry')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel keeps failed HTTP response bodies in trace events before retrying', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const traceEvents: Parameters<RuntimeModelTraceCallback>[0][] = []
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'user requests-per-minute limit exceeded',
            type: 'rate_limit_exceeded',
          },
        }), {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'content-type': 'application/json', 'x-request-id': 'rate-limit-1' },
        })
      }
      return new Response(JSON.stringify({
        id: 'chatcmpl_recovered',
        choices: [{
          message: { role: 'assistant', content: 'after retry' },
          finish_reason: 'stop',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'secret-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
      onTrace: (event) => traceEvents.push(event),
    })

    const failedResponse = traceEvents.find((event) => event.phase === 'response' && event.trace.response?.status === 429)
    const failedError = traceEvents.find((event) => event.phase === 'error' && event.trace.response?.status === 429)
    const retry = traceEvents.find((event) => event.phase === 'retry')

    assert.equal(calls, 2)
    assert.equal(result.content, 'after retry')
    assert.equal(traceEvents[0]?.phase, 'request')
    assert.equal(failedResponse?.trace.request.headers.Authorization, undefined)
    assert.equal(failedResponse?.trace.response?.status, 429)
    assert.equal(failedResponse?.trace.response?.headers['x-request-id'], 'rate-limit-1')
    assert.match(failedResponse?.trace.response?.bodyText ?? '', /requests-per-minute/)
    assert.match(JSON.stringify(failedResponse?.trace.response?.parsedBody ?? {}), /rate_limit_exceeded/)
    assert.match(failedError?.error ?? '', /HTTP 429/)
    assert.match(failedError?.trace.response?.bodyText ?? '', /requests-per-minute/)
    assert.equal(retry?.retry?.nextAttempt, 2)
    assert.match(retry?.retry?.reason ?? '', /HTTP 429/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries backend 502 responses that wrap provider rate limits', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const retryEvents: Array<{ retry?: { attempt: number; nextAttempt: number; maxAttempts: number; delayMs: number; reason: string } }> = []
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'openai chat stream HTTP 429: {"error":{"message":"user requests-per-minute limit exceeded","type":"rate_limit_exceeded"}}',
            type: 'server_error',
            param: 'stream',
            code: 'provider_error',
          },
        }), { status: 502 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'provider recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'test-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
      onTrace: (event) => {
        if (event.phase === 'retry') retryEvents.push({ retry: event.retry })
      },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'provider recovered')
    assert.deepEqual(retryEvents.map((event) => event.retry?.nextAttempt), [2])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel retries backend 502 responses that wrap upstream rate_limit_error', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'openai chat stream HTTP 429: {"error":{"message":"Upstream rate limit exceeded, please retry later","type":"rate_limit_error","param":"","code":null}}',
            type: 'server_error',
            param: 'stream',
            code: 'provider_error',
          },
        }), { status: 502 })
      }
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'upstream recovered' },
          finish_reason: 'stop',
        }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await callModel({
      config: CONFIG,
      auth: { backendAuthToken: 'test-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 2, initialDelayMs: 0 },
    })

    assert.equal(calls, 2)
    assert.equal(result.content, 'upstream recovered')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel stops retrying rate limited gateway responses after the configured attempts', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({
        error: {
          message: 'user requests-per-minute limit exceeded',
          type: 'rate_limit_exceeded',
        },
      }), { status: 429 })
    }) as typeof fetch

    await assert.rejects(
      callModel({
        config: CONFIG,
        auth: { backendAuthToken: 'test-token' },
        messages: [{ role: 'user', content: 'hello' }],
        retry: { maxAttempts: 3, initialDelayMs: 0 },
      }),
      /backend model gateway HTTP 429/,
    )

    assert.equal(calls, 3)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel sends OpenAI Responses requests and normalizes function calls', async () => {
  const originalFetch = globalThis.fetch
  let capturedURL = ''
  let capturedBody: Record<string, any> | undefined
  try {
    
    globalThis.fetch = (async (url, init) => {
      capturedURL = requestURL(url)
      capturedBody = JSON.parse(await requestBodyText(url, init)) as Record<string, any>
      return new Response(JSON.stringify({
        id: 'resp_1',
        object: 'response',
        output: [{
          type: 'function_call',
          call_id: 'call_search',
          name: 'movscript_search',
          arguments: '{"query":"雨夜"}',
        }],
        usage: {
          input_tokens: 17,
          output_tokens: 5,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: {
        ...CONFIG,
        modelConfigId: undefined,
        model: 'gpt-direct-test',
        apiKind: 'openai_responses',
        baseURL: 'https://model.example/v1',
        apiKey: 'direct-openai-key',
      },
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'Search the project.' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'previous_call',
            type: 'function',
            function: { name: 'movscript_context', arguments: '{"scope":"thread"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'previous_call', content: '{"ok":true}' },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'movscript_search',
          description: 'Search project context.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      }],
      toolChoice: { type: 'function', function: { name: 'movscript_search' } },
      jsonMode: true,
      retry: { maxAttempts: 1 },
    })

    assert.equal(capturedURL, 'https://model.example/v1/responses')
    assert.equal(capturedBody?.model, 'gpt-direct-test')
    assert.equal(capturedBody?.text?.format?.type, 'json_object')
    assert.deepEqual(capturedBody?.tools, [{
      type: 'function',
      name: 'movscript_search',
      description: 'Search project context.',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
    }])
    assert.deepEqual(capturedBody?.tool_choice, { type: 'function', name: 'movscript_search' })
    assert.deepEqual(capturedBody?.input?.at(-2), {
      type: 'function_call',
      call_id: 'previous_call',
      name: 'movscript_context',
      arguments: '{"scope":"thread"}',
    })
    assert.deepEqual(capturedBody?.input?.at(-1), {
      type: 'function_call_output',
      call_id: 'previous_call',
      output: '{"ok":true}',
    })
    assert.equal(result.content, null)
    assert.equal(result.finish_reason, 'tool_calls')
    assert.deepEqual(result.tool_calls, [{
      id: 'call_search',
      type: 'function',
      function: { name: 'movscript_search', arguments: '{"query":"雨夜"}' },
    }])
    assert.deepEqual(result.usage, { input_tokens: 17, output_tokens: 5 })
    assert.equal(result.trace.request.headers.Authorization, undefined)
    assert.equal(result.trace.request.url, 'https://model.example/v1/responses')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel sends OpenAI Chat Completions requests and hides direct API keys from traces', async () => {
  const originalFetch = globalThis.fetch
  let capturedURL = ''
  let capturedHeaders: Record<string, string> = {}
  let capturedBody: Record<string, any> | undefined
  try {
    
    globalThis.fetch = (async (url, init) => {
      capturedURL = requestURL(url)
      capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      capturedBody = JSON.parse(await requestBodyText(url, init)) as Record<string, any>
      return new Response(JSON.stringify({
        id: 'chatcmpl_1',
        choices: [{
          message: {
            role: 'assistant',
            content: 'chat ok',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 3,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: {
        ...CONFIG,
        modelConfigId: undefined,
        model: 'gpt-chat-direct',
        apiKind: 'openai_chat_completions',
        baseURL: 'https://openai.example/v1',
        apiKey: 'direct-openai-chat-key',
      },
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{
        type: 'function',
        function: {
          name: 'movscript_lookup',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
      }],
      jsonMode: true,
      retry: { maxAttempts: 1 },
    })

    assert.equal(capturedURL, 'https://openai.example/v1/chat/completions')
    assert.equal(capturedHeaders.authorization, 'Bearer direct-openai-chat-key')
    assert.equal(capturedBody?.model, 'gpt-chat-direct')
    assert.equal(capturedBody?.response_format?.type, 'json_object')
    assert.equal(capturedBody?.tool_choice, 'auto')
    assert.deepEqual(capturedBody?.tools?.[0]?.function?.name, 'movscript_lookup')
    assert.equal(result.content, 'chat ok')
    assert.deepEqual(result.usage, { input_tokens: 11, output_tokens: 3 })
    assert.equal(result.trace.request.headers.Authorization, undefined)
    assert.equal(result.trace.request.headers.authorization, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel sends Anthropic Messages requests and normalizes tool use blocks', async () => {
  const originalFetch = globalThis.fetch
  let capturedURL = ''
  let capturedHeaders: Record<string, string> = {}
  let capturedBody: Record<string, any> | undefined
  try {
    
    globalThis.fetch = (async (url, init) => {
      capturedURL = requestURL(url)
      capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      capturedBody = JSON.parse(await requestBodyText(url, init)) as Record<string, any>
      return new Response(JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          id: 'toolu_1',
          name: 'movscript_lookup',
          input: { id: 'scene-1' },
        }],
        usage: {
          input_tokens: 13,
          output_tokens: 4,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await callModel({
      config: {
        ...CONFIG,
        modelConfigId: undefined,
        model: 'claude-direct-test',
        apiKind: 'anthropic_messages',
        baseURL: 'https://anthropic.example',
        apiKey: 'direct-anthropic-key',
      },
      messages: [
        { role: 'system', content: 'Use concise answers.' },
        { role: 'user', content: 'lookup scene' },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'movscript_lookup',
          description: 'Lookup scene data.',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
      }],
      toolChoice: { type: 'function', function: { name: 'movscript_lookup' } },
      retry: { maxAttempts: 1 },
    })

    assert.equal(capturedURL, 'https://anthropic.example/v1/messages')
    assert.equal(capturedHeaders['x-api-key'], 'direct-anthropic-key')
    assert.equal(capturedBody?.model, 'claude-direct-test')
    assert.equal(capturedBody?.system, 'Use concise answers.')
    assert.equal(capturedBody?.messages?.[0]?.role, 'user')
    assert.equal(capturedBody?.tools?.[0]?.name, 'movscript_lookup')
    assert.deepEqual(capturedBody?.tool_choice, { type: 'tool', name: 'movscript_lookup' })
    assert.equal(result.content, null)
    assert.equal(result.finish_reason, 'tool_calls')
    assert.deepEqual(result.tool_calls, [{
      id: 'toolu_1',
      type: 'function',
      function: { name: 'movscript_lookup', arguments: '{"id":"scene-1"}' },
    }])
    assert.deepEqual(result.usage, { input_tokens: 13, output_tokens: 4 })
    assert.equal(result.trace.request.headers.Authorization, undefined)
    assert.equal(result.trace.request.headers.authorization, undefined)
    assert.equal(result.trace.request.url, 'https://anthropic.example/v1/messages')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('callModel rejects direct provider calls without a direct API key', async () => {
  const traceEvents: Parameters<RuntimeModelTraceCallback>[0][] = []
  await assert.rejects(
    callModel({
      config: {
        ...CONFIG,
        modelConfigId: undefined,
        model: 'gpt-direct-test',
        apiKind: 'openai_responses',
        baseURL: 'https://api.openai.com/v1',
      },
      auth: { backendAuthToken: 'backend-user-token' },
      messages: [{ role: 'user', content: 'hello' }],
      retry: { maxAttempts: 1 },
      onTrace: (event) => traceEvents.push(event),
    }),
    /openai_responses requires an API key in model settings/,
  )

  const requestEvent = traceEvents.find((event) => event.phase === 'request')
  const errorEvent = traceEvents.find((event) => event.phase === 'error')

  assert.equal(requestEvent?.trace.request.url, 'https://api.openai.com/v1/responses')
  assert.equal(requestEvent?.trace.request.headers.Authorization, undefined)
  assert.equal(requestEvent?.trace.request.body.model, 'gpt-direct-test')
  assert.match(errorEvent?.error ?? '', /openai_responses requires an API key in model settings/)
  assert.equal(errorEvent?.trace.request.url, 'https://api.openai.com/v1/responses')
})

function requestURL(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

async function requestBodyText(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<string> {
  if (typeof init?.body === 'string') return init.body
  if (input instanceof Request) return input.clone().text()
  return ''
}

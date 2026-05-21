import assert from 'node:assert/strict'
import test from 'node:test'

import { isLocalAgentNotFoundError, LocalAgentClient, LocalAgentHTTPError, type AgentMessage, type AgentRun, type AgentThread } from './localAgentClient'

test('runMessage reports when a saved thread id is reused', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_existing')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_existing') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_existing/runs') return jsonResponse(messageRunFixture('run_1', 'thread_existing', 'completed'))
    if (url.pathname === '/runs/run_1') return jsonResponse(runFixture('run_1', 'thread_existing', 'completed'))
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').runMessage({
      threadId: 'thread_existing',
      message: 'continue',
    }, { timeoutMs: 1, pollMs: 1 })

    assert.equal(result.thread.id, 'thread_existing')
    assert.equal(result.sourceMessage?.id, 'msg_1')
    assert.deepEqual(result.threadResolution, {
      requestedThreadId: 'thread_existing',
      threadId: 'thread_existing',
      reusedExistingThread: true,
      createdNewThread: false,
      missingRequestedThread: false,
    })
    assert.deepEqual(requests.slice(0, 3), [
      'GET /threads/thread_existing',
      'POST /threads/thread_existing/runs',
      'GET /runs/run_1',
    ])
  })
})

test('runMessage reports when a missing saved thread id is replaced by a new thread', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_new')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_missing') return new Response('missing', { status: 404 })
    if (url.pathname === '/threads' && init?.method === 'POST') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_new') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_new/runs') return jsonResponse(messageRunFixture('run_1', 'thread_new', 'completed'))
    if (url.pathname === '/runs/run_1') return jsonResponse(runFixture('run_1', 'thread_new', 'completed'))
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').runMessage({
      threadId: 'thread_missing',
      message: 'continue',
      title: 'Recovered thread',
    }, { timeoutMs: 1, pollMs: 1 })

    assert.equal(result.thread.id, 'thread_new')
    assert.deepEqual(result.threadResolution, {
      requestedThreadId: 'thread_missing',
      threadId: 'thread_new',
      reusedExistingThread: false,
      createdNewThread: true,
      missingRequestedThread: true,
    })
    assert.deepEqual(requests.slice(0, 4), [
      'GET /threads/thread_missing',
      'POST /threads',
      'POST /threads/thread_new/runs',
      'GET /runs/run_1',
    ])
  })
})

test('runMessage only replaces saved thread ids for not-found responses', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_broken') return new Response('backend failed', { status: 500 })
    if (url.pathname === '/threads' && init?.method === 'POST') return jsonResponse(threadFixture('thread_new'))
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(
      () => new LocalAgentClient('http://local.test').runMessage({
        threadId: 'thread_broken',
        message: 'continue',
      }, { timeoutMs: 1, pollMs: 1 }),
      /local agent returned 500: backend failed/,
    )

    assert.deepEqual(requests, ['GET /threads/thread_broken'])
  })
})

test('local agent client unwraps JSON error response bodies', async () => {
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/model-config' && init?.method === 'POST') {
      return new Response(JSON.stringify({ error: 'model must be a non-empty string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    await assert.rejects(async () => {
      try {
        await new LocalAgentClient('http://local.test').saveModelConfig({ model: '' })
      } catch (error) {
        assert.ok(error instanceof LocalAgentHTTPError)
        assert.equal(error.status, 400)
        assert.equal(error.responseText, '{"error":"model must be a non-empty string"}')
        assert.equal(error.message, 'local agent returned 400: model must be a non-empty string')
        throw error
      }
    }, /local agent returned 400: model must be a non-empty string/)
  })
})

test('local agent not found detection uses structured HTTP status when available', () => {
  assert.equal(isLocalAgentNotFoundError(new LocalAgentHTTPError(404, '{"error":"missing"}', 'missing')), true)
  assert.equal(isLocalAgentNotFoundError(new LocalAgentHTTPError(500, 'backend failed', 'backend failed')), false)
  assert.equal(isLocalAgentNotFoundError(new Error('local agent returned 404: legacy')), true)
})

test('listRunsByThread reads the thread-scoped run projection endpoint', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_1/runs') {
      return jsonResponse({
        threadId: 'thread_1',
        runs: [runFixture('run_1', 'thread_1', 'completed')],
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').listRunsByThread('thread_1')

    assert.equal(result.threadId, 'thread_1')
    assert.deepEqual(result.runs.map((run) => run.id), ['run_1'])
    assert.deepEqual(requests, ['GET /threads/thread_1/runs'])
  })
})

test('getThreadRuntime reads the combined thread runtime snapshot endpoint', async () => {
  const requests: string[] = []
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_1/runtime') {
      return jsonResponse({
        thread: threadFixture('thread_1'),
        runs: [runFixture('run_1', 'thread_1', 'completed')],
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').getThreadRuntime('thread_1')

    assert.equal(result.thread.id, 'thread_1')
    assert.deepEqual(result.runs.map((run) => run.id), ['run_1'])
    assert.deepEqual(requests, ['GET /threads/thread_1/runtime'])
  })
})

test('runMessageStream reports thread resolution on the streaming path', async () => {
  const requests: string[] = []
  const runBodies: Array<Record<string, unknown>> = []
  const thread = threadFixture('thread_stream')
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_missing') return new Response('missing', { status: 404 })
    if (url.pathname === '/threads' && init?.method === 'POST') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_stream') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_stream/runs') {
      runBodies.push(parseJSONBody(init?.body))
      return jsonResponse({ run, message: messageFixture('msg_stream', 'thread_stream', 'continue') })
    }
    if (url.pathname === '/threads/thread_stream/stream') {
      return new Response(`data: ${JSON.stringify({ type: 'done', threadId: 'thread_stream', run })}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').runMessageStream({
      threadId: 'thread_missing',
      message: 'continue',
    }, { timeoutMs: 1000, pollMs: 1 })

    assert.equal(result.run.id, 'run_stream')
    assert.equal(result.sourceMessage?.id, 'msg_stream')
    assert.equal(result.thread.id, 'thread_stream')
    assert.deepEqual(result.threadResolution, {
      requestedThreadId: 'thread_missing',
      threadId: 'thread_stream',
      reusedExistingThread: false,
      createdNewThread: true,
      missingRequestedThread: true,
    })
    assert.ok(requests.includes('GET /threads/thread_stream/stream'))
    assert.equal(requests.includes('GET /runs/run_stream/stream'), false)
    assert.equal(runBodies[0]?.message, 'continue')
  })
})

test('runMessageStream falls back to run stream when thread stream is unavailable', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_stream')
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_stream') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_stream/runs') {
      return jsonResponse({ run, message: messageFixture('msg_stream', 'thread_stream', 'continue') })
    }
    if (url.pathname === '/threads/thread_stream/stream') return new Response('not found', { status: 404 })
    if (url.pathname === '/runs/run_stream') return jsonResponse(run)
    if (url.pathname === '/runs/run_stream/stream') {
      return new Response(`data: ${JSON.stringify({ type: 'done', run })}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').runMessageStream({
      threadId: 'thread_stream',
      message: 'continue',
    }, { timeoutMs: 1000, pollMs: 1 })

    assert.equal(result.run.id, 'run_stream')
    assert.ok(requests.includes('GET /threads/thread_stream/stream'))
    assert.ok(requests.includes('GET /runs/run_stream/stream'))
  })
})

test('streamThread reads thread-scoped runtime stream events', async () => {
  const requests: string[] = []
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_stream/stream') {
      return new Response(`data: ${JSON.stringify({ type: 'run', threadId: 'thread_stream', run })}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const events: Array<{ type: string; threadId: string }> = []
    await new LocalAgentClient('http://local.test').streamThread('thread_stream', {
      onStreamEvent: (event) => events.push({ type: event.type, threadId: event.threadId }),
    })

    assert.deepEqual(events, [{ type: 'run', threadId: 'thread_stream' }])
    assert.deepEqual(requests, ['GET /threads/thread_stream/stream'])
  })
})

test('streamRun reconnects after a per-request stream timeout', async () => {
  const requests: string[] = []
  let streamRequests = 0
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/runs/run_reconnect') {
      const status = streamRequests >= 2 ? 'completed' : 'in_progress'
      return jsonResponse(runFixture('run_reconnect', 'thread_stream', status))
    }
    if (url.pathname === '/runs/run_reconnect/stream') {
      streamRequests += 1
      if (streamRequests === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
        })
      }
      const run = runFixture('run_reconnect', 'thread_stream', 'completed')
      return new Response(`data: ${JSON.stringify({ type: 'done', run })}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').streamRun('run_reconnect', {
      timeoutMs: 100,
      streamRequestTimeoutMs: 1,
      pollMs: 1,
    })

    assert.equal(result.status, 'completed')
    assert.equal(streamRequests, 2)
    assert.deepEqual(requests.filter((request) => request === 'GET /runs/run_reconnect/stream'), [
      'GET /runs/run_reconnect/stream',
      'GET /runs/run_reconnect/stream',
    ])
  })
})

test('trace reads preserve pagination and kind filters', async () => {
  const requests: string[] = []
  await withFetch(async (input) => {
    const url = new URL(String(input))
    requests.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/runs/run_trace/trace') {
      return jsonResponse({
        runId: 'run_trace',
        events: [traceEvent('trace_1')],
        hasMore: false,
        total: 1,
      })
    }
    if (url.pathname === '/runs/run_trace/trace/summary') {
      return jsonResponse({
        runId: 'run_trace',
        total: 1,
        byKind: { tool_call: 1 },
        latestEvent: traceEvent('trace_1'),
      })
    }
    if (url.pathname === '/runs/run_trace/trace/debug-view') {
      return jsonResponse({
        schema: 'movscript.agent-trace-debug-view.v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
        runId: 'run_trace',
        run: runFixture('run_trace', 'thread_1', 'completed'),
        trace: { loaded: 1, total: 1, hasMore: false },
        coverage: {
          loadedLabel: '1 / 1',
          hasUnloadedTrace: false,
          modelCallsLabel: '0',
          promptDetailsLabel: '0',
          messageWritesLabel: '0',
          toolDetailsLabel: '1 / 1',
          httpResponsesLabel: '0',
          requestPayloadsLabel: '0',
          httpResponseBodiesLabel: '0',
          issues: [],
        },
        readinessChecklist: [],
        modelCalls: [],
        modelCallContexts: [],
        skillTimeline: {
          timeline: [],
          currentActiveSkillIds: [],
          currentLoadedSkillIds: [],
          currentUnloadedSkillIds: [],
          currentAvailableSkillIds: [],
        },
        promptDetails: [],
        messageWrites: [],
        toolCalls: [],
        attentionEvents: [],
        pendingActions: [],
        fieldGuide: [],
        events: [traceEvent('trace_1')],
        reportText: 'AgentRun 调试摘要\n',
        bundle: { schema: 'movscript.agent-run-debug-bundle.v1' },
      })
    }
    if (url.pathname === '/runs/run_trace/generation-view') {
      return jsonResponse({
        schema: 'movscript.agent-run-generation-view.v1',
        generatedAt: '2026-01-01T00:00:00.000Z',
        runId: 'run_trace',
        jobs: [{
          jobId: 50,
          jobType: 'image',
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 88,
        }],
        latestJob: {
          jobId: 50,
          jobType: 'image',
          status: 'succeeded',
          stage: 'completed',
          terminal: true,
          outputResourceId: 88,
        },
        outputResourceIds: [88],
        outputResources: [],
        metadataByResourceId: { 88: { jobId: 50, modelDisplay: 'Replay Model' } },
        active: 0,
        terminal: 1,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        timeout: 0,
      })
    }
    return new Response('not found', { status: 404 })
  }, async () => {
    const client = new LocalAgentClient('http://local.test')
    const page = await client.getRunTraceEvents('run_trace', {
      cursor: 'trace_0',
      limit: 25,
      kind: 'tool_call',
    })
    const summary = await client.getRunTraceSummary('run_trace')
    const debugView = await client.getRunTraceDebugView('run_trace')
    const generationView = await client.getRunGenerationView('run_trace')

    assert.equal(page.events[0].id, 'trace_1')
    assert.equal(page.events[0].durationMs, 42)
    assert.equal(summary.latestEvent?.durationMs, 42)
    assert.equal(summary.total, 1)
    assert.equal(debugView.schema, 'movscript.agent-trace-debug-view.v1')
    assert.equal(debugView.events[0].id, 'trace_1')
    assert.equal(generationView.schema, 'movscript.agent-run-generation-view.v1')
    assert.equal(generationView.jobs[0]?.jobId, 50)
    assert.deepEqual(requests, [
      '/runs/run_trace/trace?cursor=trace_0&limit=25&kind=tool_call',
      '/runs/run_trace/trace/summary',
      '/runs/run_trace/trace/debug-view',
      '/runs/run_trace/generation-view',
    ])
  })
})

function threadFixture(id: string): AgentThread {
  return {
    id,
    title: id,
    archived: false,
    status: 'completed',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:01.000Z',
    messages: [],
  }
}

function runFixture(id: string, threadId: string, status: AgentRun['status']): AgentRun {
  return {
    id,
    threadId,
    status,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 6,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:01.000Z',
  }
}

function messageFixture(id: string, threadId: string, content: string): AgentMessage {
  return {
    id,
    threadId,
    role: 'user',
    content,
    createdAt: '2026-05-16T00:00:00.000Z',
  }
}

function messageRunFixture(id: string, threadId: string, status: AgentRun['status']) {
  return {
    run: runFixture(id, threadId, status),
    message: messageFixture('msg_1', threadId, 'continue'),
  }
}

function traceEvent(id: string) {
  return {
    id,
    runId: 'run_trace',
    kind: 'tool_call',
    title: 'Tool call',
    status: 'completed',
    durationMs: 42,
    createdAt: '2026-05-16T00:00:00.000Z',
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createAbortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError')
  } catch {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    return error
  }
}

function parseJSONBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  const parsed = JSON.parse(body) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

async function withFetch(fetchImpl: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchImpl,
  })
  try {
    await fn()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    })
  }
}

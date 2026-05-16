import assert from 'node:assert/strict'
import test from 'node:test'

import { LocalAgentClient, type AgentRun, type AgentThread } from './localAgentClient'

test('runMessage reports when a saved thread id is reused', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_existing')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_existing') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_existing/messages') return jsonResponse({ id: 'message_1' })
    if (url.pathname === '/runs') return jsonResponse(runFixture('run_1', 'thread_existing', 'completed'))
    if (url.pathname === '/runs/run_1') return jsonResponse(runFixture('run_1', 'thread_existing', 'completed'))
    return new Response('not found', { status: 404 })
  }, async () => {
    const result = await new LocalAgentClient('http://local.test').runMessage({
      threadId: 'thread_existing',
      message: 'continue',
    }, { timeoutMs: 1, pollMs: 1 })

    assert.equal(result.thread.id, 'thread_existing')
    assert.deepEqual(result.threadResolution, {
      requestedThreadId: 'thread_existing',
      threadId: 'thread_existing',
      reusedExistingThread: true,
      createdNewThread: false,
      missingRequestedThread: false,
    })
    assert.deepEqual(requests.slice(0, 3), [
      'GET /threads/thread_existing',
      'POST /threads/thread_existing/messages',
      'POST /runs',
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
    if (url.pathname === '/threads/thread_new/messages') return jsonResponse({ id: 'message_1' })
    if (url.pathname === '/runs') return jsonResponse(runFixture('run_1', 'thread_new', 'completed'))
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
      'POST /threads/thread_new/messages',
      'POST /runs',
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

test('runMessageStream reports thread resolution on the streaming path', async () => {
  const requests: string[] = []
  const thread = threadFixture('thread_stream')
  const run = runFixture('run_stream', 'thread_stream', 'completed')
  await withFetch(async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/threads/thread_missing') return new Response('missing', { status: 404 })
    if (url.pathname === '/threads' && init?.method === 'POST') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_stream') return jsonResponse(thread)
    if (url.pathname === '/threads/thread_stream/messages') return jsonResponse({ id: 'message_1' })
    if (url.pathname === '/runs') return jsonResponse(run)
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
      threadId: 'thread_missing',
      message: 'continue',
    }, { timeoutMs: 1000, pollMs: 1 })

    assert.equal(result.run.id, 'run_stream')
    assert.equal(result.thread.id, 'thread_stream')
    assert.deepEqual(result.threadResolution, {
      requestedThreadId: 'thread_missing',
      threadId: 'thread_stream',
      reusedExistingThread: false,
      createdNewThread: true,
      missingRequestedThread: true,
    })
    assert.ok(requests.includes('GET /runs/run_stream/stream'))
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
    return new Response('not found', { status: 404 })
  }, async () => {
    const client = new LocalAgentClient('http://local.test')
    const page = await client.getRunTraceEvents('run_trace', {
      cursor: 'trace_0',
      limit: 25,
      kind: 'tool_call',
    })
    const summary = await client.getRunTraceSummary('run_trace')

    assert.equal(page.events[0].id, 'trace_1')
    assert.equal(page.events[0].durationMs, 42)
    assert.equal(summary.latestEvent?.durationMs, 42)
    assert.equal(summary.total, 1)
    assert.deepEqual(requests, [
      '/runs/run_trace/trace?cursor=trace_0&limit=25&kind=tool_call',
      '/runs/run_trace/trace/summary',
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

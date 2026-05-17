import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { createAgentRequestListener, normalizeTraceQuery } from './server.js'
import type { AgentServerContext } from './bootstrap/agentServerContext.js'

test('normalizeTraceQuery accepts bounded pagination and known trace kind', () => {
  const result = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?cursor=trace_1&limit=25&kind=model_call'))

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.query, {
    cursor: 'trace_1',
    limit: 25,
    kind: 'model_call',
  })
})

test('normalizeTraceQuery normalizes edge-case pagination limits', () => {
  const zero = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?limit=0'))
  const fractional = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?limit=2.8'))
  const infinite = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?limit=Infinity'))
  const oversized = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?limit=9007199254740992'))

  assert.equal(zero.ok, true)
  assert.equal(fractional.ok, true)
  assert.equal(infinite.ok, true)
  assert.equal(oversized.ok, true)
  if (!zero.ok || !fractional.ok || !infinite.ok || !oversized.ok) return
  assert.equal(zero.query.limit, 1)
  assert.equal(fractional.query.limit, 2)
  assert.equal(infinite.query.limit, undefined)
  assert.equal(oversized.query.limit, Number.MAX_SAFE_INTEGER - 1)
})

test('normalizeTraceQuery rejects unknown trace kind', () => {
  const result = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?kind=unknown_kind'))

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /invalid trace kind/)
})

test('trace read endpoints return 404 for missing runs instead of surfacing facade errors', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      getRun: () => undefined,
      getRunTracePage: () => {
        calls.push('page')
        throw new Error('should not read trace page for missing run')
      },
      getRunTraceSummary: () => {
        calls.push('summary')
        throw new Error('should not read trace summary for missing run')
      },
    },
  } as unknown as AgentServerContext)

  const page = await dispatch(handler, 'GET', '/runs/missing/trace')
  const summary = await dispatch(handler, 'GET', '/runs/missing/trace/summary')

  assert.equal(page.statusCode, 404)
  assert.equal(JSON.parse(page.body).error, 'run not found')
  assert.equal(summary.statusCode, 404)
  assert.equal(JSON.parse(summary.body).error, 'run not found')
  assert.deepEqual(calls, [])
})

test('JSON request bodies report client errors instead of internal errors', async () => {
  const handler = createAgentRequestListener({} as unknown as AgentServerContext)

  const invalid = await dispatch(handler, 'POST', '/model-config', '{not-json')
  const oversized = await dispatch(handler, 'POST', '/model-config', 'x'.repeat(1024 * 1024 + 1))
  const nonObjectModelConfig = await dispatch(handler, 'POST', '/model-config', '[]')
  const nonObjectDraft = await dispatch(handler, 'POST', '/draft', '[]')

  assert.equal(invalid.statusCode, 400)
  assert.equal(JSON.parse(invalid.body).error, 'invalid JSON request body')
  assert.equal(oversized.statusCode, 413)
  assert.equal(JSON.parse(oversized.body).error, 'request body too large')
  assert.equal(nonObjectModelConfig.statusCode, 400)
  assert.equal(JSON.parse(nonObjectModelConfig.body).error, 'model config body must be an object')
  assert.equal(nonObjectDraft.statusCode, 400)
  assert.equal(JSON.parse(nonObjectDraft.body).error, 'draft body must be an object')
})

test('write endpoints reject non-object request bodies before touching runtime dependencies', async () => {
  const handler = createAgentRequestListener({} as unknown as AgentServerContext)
  const cases: Array<{ method: string; path: string; label: string }> = [
    { method: 'PATCH', path: '/drafts/draft_1', label: 'draft update body' },
    { method: 'POST', path: '/drafts/draft_1/patch', label: 'draft patch body' },
    { method: 'POST', path: '/drafts/draft_1/apply-preview', label: 'apply preview body' },
    { method: 'POST', path: '/drafts/draft_1/apply-simulate', label: 'apply simulate body' },
    { method: 'POST', path: '/drafts/draft_1/apply', label: 'draft apply body' },
    { method: 'POST', path: '/drafts/draft_1/reject', label: 'draft rejection body' },
    { method: 'POST', path: '/threads', label: 'thread body' },
    { method: 'PATCH', path: '/threads/thread_1', label: 'thread update body' },
    { method: 'POST', path: '/threads/thread_1/messages', label: 'message body' },
    { method: 'POST', path: '/runs', label: 'run body' },
    { method: 'POST', path: '/runs/tool', label: 'tool run body' },
    { method: 'POST', path: '/runs/preview', label: 'run preview body' },
    { method: 'POST', path: '/plans', label: 'plan body' },
    { method: 'POST', path: '/plans/plan_1/dispatch', label: 'plan dispatch body' },
    { method: 'PATCH', path: '/tasks/task_1', label: 'task update body' },
    { method: 'POST', path: '/runs/run_1/approve', label: 'approval body' },
    { method: 'POST', path: '/runs/run_1/cancel', label: 'cancel body' },
    { method: 'POST', path: '/runs/run_1/cancel-tree', label: 'cancel tree body' },
    { method: 'POST', path: '/runs/run_1/reject', label: 'rejection body' },
    { method: 'POST', path: '/runs/run_1/input', label: 'input answer body' },
    { method: 'POST', path: '/memories', label: 'memory body' },
  ]

  for (const entry of cases) {
    const response = await dispatch(handler, entry.method, entry.path, '[]')
    assert.equal(response.statusCode, 400, entry.path)
    assert.equal(JSON.parse(response.body).error, `${entry.label} must be an object`, entry.path)
  }
})

test('public agent project id boundaries reject invalid project scopes', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      getCapabilities: async (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'capabilities', input })
        return { ok: true }
      },
      listDrafts: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'drafts', input })
        return []
      },
      createLocalDraft: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'draft', input })
        return { id: 'draft_1', ...input }
      },
    },
  } as unknown as AgentServerContext)

  for (const invalidProjectId of ['0', '42.5']) {
    const capabilities = await dispatch(handler, 'GET', `/capabilities?projectId=${invalidProjectId}`)
    const drafts = await dispatch(handler, 'GET', `/drafts?projectId=${invalidProjectId}`)
    const draft = await dispatch(handler, 'POST', '/draft', JSON.stringify({ projectId: Number(invalidProjectId), kind: 'project_proposal' }))

    assert.equal(capabilities.statusCode, 400)
    assert.equal(JSON.parse(capabilities.body).error, 'projectId must be a positive safe integer')
    assert.equal(drafts.statusCode, 400)
    assert.equal(JSON.parse(drafts.body).error, 'projectId must be a positive safe integer')
    assert.equal(draft.statusCode, 400)
    assert.equal(JSON.parse(draft.body).error, 'draft projectId must be a positive safe integer')
  }
  await dispatch(handler, 'GET', '/capabilities?projectId=42')
  await dispatch(handler, 'GET', '/drafts?projectId=42')
  await dispatch(handler, 'POST', '/draft', JSON.stringify({ projectId: 42, kind: 'project_proposal' }))

  assert.deepEqual(calls.map((call) => [call.endpoint, call.input.projectId, call.input.currentProjectId]), [
    ['capabilities', undefined, 42],
    ['drafts', 42, undefined],
    ['draft', 42, undefined],
  ])
})

test('draft creation drops invalid numeric business reference ids', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      createLocalDraft: (input: Record<string, unknown>) => {
        calls.push(input)
        return { id: 'draft_1', ...input }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/draft', JSON.stringify({
    kind: 'note',
    content: 'Draft',
    source: {
      entityType: 'scene_moment',
      entityId: 0,
      pageEntityType: 'production',
      pageEntityId: 7.5,
      pageKey: 'production',
    },
  }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls[0]?.source, {
    entityType: 'scene_moment',
    pageEntityType: 'production',
    pageKey: 'production',
  })
})

test('public agent query limit boundaries are normalized before runtime calls', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      listDrafts: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'drafts', input })
        return []
      },
      listMemorySummaries: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'memories', input })
        return []
      },
    },
  } as unknown as AgentServerContext)

  for (const limit of ['0', '2.8', 'Infinity', '999']) {
    await dispatch(handler, 'GET', `/drafts?limit=${limit}`)
    await dispatch(handler, 'GET', `/memories?projectId=42&limit=${limit}`)
  }

  assert.deepEqual(calls.map((call) => [call.endpoint, call.input.limit]), [
    ['drafts', 1],
    ['memories', 1],
    ['drafts', 2],
    ['memories', 2],
    ['drafts', undefined],
    ['memories', undefined],
    ['drafts', 100],
    ['memories', 100],
  ])
})

function dispatch(
  handler: ReturnType<typeof createAgentRequestListener>,
  method: string,
  path: string,
  body?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter() as unknown as IncomingMessage & {
      method?: string
      url?: string
      headers: Record<string, string>
      setEncoding: (encoding: BufferEncoding) => void
      destroy: () => void
    }
    req.method = method
    req.url = path
    req.headers = { host: '127.0.0.1' }
    ;(req as any).setEncoding = () => {}
    ;(req as any).destroy = () => {}

    const resBody = new PassThrough()
    let statusCode = 0
    const res = {
      writeHead(code: number) {
        statusCode = code
      },
      setHeader() {},
      end(chunk?: string) {
        if (chunk) resBody.end(chunk)
        else resBody.end()
      },
      write(chunk: string) {
        resBody.write(chunk)
      },
      writableEnded: false,
    } as unknown as ServerResponse

    let output = ''
    resBody.setEncoding('utf8')
    resBody.on('data', (chunk) => {
      output += chunk
    })
    resBody.on('end', () => resolve({ statusCode, body: output }))
    resBody.on('error', reject)

    void handler(req, res)
    if (body !== undefined) req.emit('data', body)
    req.emit('end')
  })
}

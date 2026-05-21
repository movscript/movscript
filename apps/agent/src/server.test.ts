import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { createAgentRequestListener, normalizeTraceQuery } from './server.js'
import type { AgentServerContext } from './bootstrap/agentServerContext.js'
import { RuntimeModelConfigStore } from './model/modelConfig.js'

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
      getRunTraceDebugView: () => {
        calls.push('debug-view')
        throw new Error('should not read trace debug view for missing run')
      },
      getRunDebugLedger: () => {
        calls.push('debug-ledger')
        throw new Error('should not read debug ledger for missing run')
      },
      getRunDebugEvidence: () => {
        calls.push('debug-evidence')
        throw new Error('should not read debug evidence for missing run')
      },
      getRunGenerationView: () => {
        calls.push('generation-view')
        throw new Error('should not read generation view for missing run')
      },
    },
  } as unknown as AgentServerContext)

  const page = await dispatch(handler, 'GET', '/runs/missing/trace')
  const summary = await dispatch(handler, 'GET', '/runs/missing/trace/summary')
  const debugView = await dispatch(handler, 'GET', '/runs/missing/trace/debug-view')
  const debugLedger = await dispatch(handler, 'GET', '/runs/missing/debug-ledger')
  const debugEvidence = await dispatch(handler, 'GET', '/runs/missing/debug-evidence/trace_1%3Amodel_request')
  const generationView = await dispatch(handler, 'GET', '/runs/missing/generation-view')

  assert.equal(page.statusCode, 404)
  assert.equal(JSON.parse(page.body).error, 'run not found')
  assert.equal(summary.statusCode, 404)
  assert.equal(JSON.parse(summary.body).error, 'run not found')
  assert.equal(debugView.statusCode, 404)
  assert.equal(JSON.parse(debugView.body).error, 'run not found')
  assert.equal(debugLedger.statusCode, 404)
  assert.equal(JSON.parse(debugLedger.body).error, 'run not found')
  assert.equal(debugEvidence.statusCode, 404)
  assert.equal(JSON.parse(debugEvidence.body).error, 'run not found')
  assert.equal(generationView.statusCode, 404)
  assert.equal(JSON.parse(generationView.body).error, 'run not found')
  assert.deepEqual(calls, [])
})

test('debug ledger endpoints return compact ledger and evidence payloads', async () => {
  const handler = createAgentRequestListener({
    agentRuntime: {
      getRun: (runId: string) => ({ id: runId, threadId: 'thread_1', status: 'completed', steps: [], policy: {}, createdAt: '2026-05-21T00:00:00.000Z', updatedAt: '2026-05-21T00:00:00.000Z' }),
      getRunDebugLedger: (runId: string) => ({
        schema: 'movscript.agent.run-debug-ledger.v1',
        runId,
        generatedAt: '2026-05-21T00:00:00.000Z',
        budget: { maxChars: 32000, estimatedChars: 100, truncated: false },
        run: { status: 'completed', warnings: [] },
        context: {
          activeSkillIds: [],
          availableToolNames: [],
          droppedSummary: { count: 0, totalOriginalChars: 0, totalRenderedChars: 0, samples: [] },
          layers: [],
        },
        modelCalls: [],
        toolCalls: [],
        decisions: [],
        attention: [],
        evidenceIndex: [{ evidenceId: 'trace_1:model_request', eventId: 'trace_1', kind: 'model_request', label: '模型请求负载', chars: 2, preview: '{}', fetchPath: `/runs/${runId}/debug-evidence/trace_1%3Amodel_request` }],
      }),
      getRunDebugEvidence: (runId: string, evidenceId: string) => ({
        schema: 'movscript.agent.run-debug-evidence.v1',
        runId,
        evidenceId,
        eventId: 'trace_1',
        kind: 'model_request',
        chars: 16,
        value: { model: 'gpt-test' },
      }),
    },
  } as unknown as AgentServerContext)

  const ledger = await dispatch(handler, 'GET', '/runs/run_1/debug-ledger')
  const evidence = await dispatch(handler, 'GET', '/runs/run_1/debug-evidence/trace_1%3Amodel_request')

  assert.equal(ledger.statusCode, 200)
  assert.equal(JSON.parse(ledger.body).schema, 'movscript.agent.run-debug-ledger.v1')
  assert.equal(JSON.parse(ledger.body).budget.estimatedChars, 100)
  assert.equal(evidence.statusCode, 200)
  assert.equal(JSON.parse(evidence.body).evidenceId, 'trace_1:model_request')
  assert.deepEqual(JSON.parse(evidence.body).value, { model: 'gpt-test' })
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

test('model config endpoint reports invalid config input as client errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-config-server-'))
  try {
    const handler = createAgentRequestListener({
      modelConfigStore: new RuntimeModelConfigStore(join(dir, 'model-config.json')),
    } as unknown as AgentServerContext)

    const invalidModel = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: '' }))
    const invalidRoutes = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.5', useForChat: false, useForPlanner: false }))
    const sensitiveModel = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'sk-proj-exampleSecretValue123456789', apiKind: 'openai_responses' }))
    const sensitiveBaseURL = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.5', apiKind: 'openai_responses', baseURL: 'https://api.openai.com/v1?api_key=secret' }))

    assert.equal(invalidModel.statusCode, 400)
    assert.equal(JSON.parse(invalidModel.body).error, 'model must be a non-empty string')
    assert.equal(invalidRoutes.statusCode, 400)
    assert.equal(JSON.parse(invalidRoutes.body).error, 'runtime model config must enable at least one route')
    assert.equal(sensitiveModel.statusCode, 400)
    assert.equal(JSON.parse(sensitiveModel.body).error, 'model must not include API keys, bearer tokens, or secret URL credentials')
    assert.equal(sensitiveBaseURL.statusCode, 400)
    assert.equal(JSON.parse(sensitiveBaseURL.body).error, 'baseURL must not include secret URL credentials')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('model config endpoint can clear saved config', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-config-clear-'))
  try {
    const filePath = join(dir, 'model-config.json')
    const modelConfigStore = new RuntimeModelConfigStore(filePath)
    const handler = createAgentRequestListener({
      modelConfigStore,
    } as unknown as AgentServerContext)

    const saved = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.5' }))
    const cleared = await dispatch(handler, 'DELETE', '/model-config')

    assert.equal(saved.statusCode, 200)
    assert.equal(cleared.statusCode, 200)
    assert.equal(JSON.parse(cleared.body).configured, false)
    assert.equal(modelConfigStore.getEffectiveConfig(), undefined)
    assert.equal(existsSync(filePath), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('write endpoints reject non-object request bodies before touching runtime dependencies', async () => {
  const handler = createAgentRequestListener({} as unknown as AgentServerContext)
  const cases: Array<{ method: string; path: string; label: string }> = [
    { method: 'PATCH', path: '/drafts/draft_1', label: 'draft update body' },
    { method: 'POST', path: '/drafts/draft_1/apply-preview', label: 'apply preview body' },
    { method: 'POST', path: '/drafts/draft_1/apply-simulate', label: 'apply simulate body' },
    { method: 'POST', path: '/drafts/draft_1/apply', label: 'draft apply body' },
    { method: 'POST', path: '/drafts/draft_1/reject', label: 'draft rejection body' },
    { method: 'POST', path: '/threads', label: 'thread body' },
    { method: 'PATCH', path: '/threads/thread_1', label: 'thread update body' },
    { method: 'POST', path: '/threads/thread_1/messages', label: 'message body' },
    { method: 'POST', path: '/threads/thread_1/runs', label: 'thread run body' },
    { method: 'POST', path: '/runs', label: 'run body' },
    { method: 'POST', path: '/runs/tool', label: 'tool run body' },
    { method: 'POST', path: '/runs/preview', label: 'run preview body' },
    { method: 'POST', path: '/agent-profiles/default', label: 'default agent profile body' },
    { method: 'POST', path: '/agent-tools/default-policy', label: 'default tool policy body' },
    { method: 'POST', path: '/agent-skills/default-policy', label: 'default skill policy body' },
    { method: 'POST', path: '/agent-catalog/skills/install-bundle', label: 'agent skill bundle body' },
    { method: 'POST', path: '/agent-catalog/skills/uninstall-bundle', label: 'agent skill bundle uninstall body' },
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

test('thread run endpoint appends a user message and creates a run bound to that message', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => ({ id: threadId, status: 'idle', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z', messages: [] }),
      addMessage: (threadId: string, input: Record<string, unknown>) => {
        calls.push({ endpoint: 'message', input: { threadId, ...input } })
        return { id: 'msg_bound', threadId, role: 'user', content: input.content, createdAt: '2026-05-19T00:00:00.000Z' }
      },
      createRun: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'run', input })
        return { id: 'run_bound', threadId: input.threadId, status: 'queued' }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/threads/thread_1/runs', JSON.stringify({
    message: 'Continue safely',
    clientInput: { visibleMessage: 'Continue safely', attachments: [] },
    policy: { maxIterations: 2 },
    sourceMessageId: 'ignored_client_source',
  }))

  assert.equal(response.statusCode, 201)
  assert.deepEqual(JSON.parse(response.body), {
    run: { id: 'run_bound', threadId: 'thread_1', status: 'queued' },
    message: {
      id: 'msg_bound',
      threadId: 'thread_1',
      role: 'user',
      content: 'Continue safely',
      createdAt: '2026-05-19T00:00:00.000Z',
    },
  })
  assert.deepEqual(calls, [
    {
      endpoint: 'message',
      input: {
        threadId: 'thread_1',
        role: 'user',
        content: 'Continue safely',
        clientInput: { visibleMessage: 'Continue safely', attachments: [] },
      },
    },
    {
      endpoint: 'run',
      input: {
        clientInput: { visibleMessage: 'Continue safely', attachments: [] },
        policy: { maxIterations: 2 },
        threadId: 'thread_1',
        sourceMessageId: 'msg_bound',
        role: 'planner',
      },
    },
  ])
})

test('thread run endpoint appends runtime input to an active run instead of creating a parallel run', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => ({
        id: threadId,
        status: 'running',
        activeRunId: 'run_active',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
        messages: [],
      }),
      getRun: (runId: string) => ({ id: runId, threadId: 'thread_1', status: 'in_progress' }),
      addMessage: (threadId: string, input: Record<string, unknown>) => {
        calls.push({ endpoint: 'message', input: { threadId, ...input } })
        return {
          id: 'msg_runtime_input',
          threadId,
          role: 'user',
          content: input.content,
          runId: input.runId,
          metadata: input.metadata,
          createdAt: '2026-05-19T00:00:01.000Z',
        }
      },
      createRun: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'run', input })
        return { id: 'unexpected_run' }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/threads/thread_1/runs', JSON.stringify({
    message: '先别继续，改成图片方案',
  }))

  assert.equal(response.statusCode, 202)
  const body = JSON.parse(response.body)
  assert.deepEqual(body.runtimeInput, {
    accepted: true,
    runId: 'run_active',
    messageId: 'msg_runtime_input',
    status: 'accepted',
  })
  assert.equal(body.run.id, 'run_active')
  assert.deepEqual(calls, [
    {
      endpoint: 'message',
      input: {
        threadId: 'thread_1',
        role: 'user',
        content: '先别继续，改成图片方案',
        runId: 'run_active',
        metadata: {
          kind: 'runtime_input',
          targetRunId: 'run_active',
          mode: 'soft',
          status: 'accepted',
        },
      },
    },
  ])
})

test('thread runs endpoint lists only runs from the requested thread', async () => {
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => threadId === 'thread_1'
        ? { id: threadId, messages: [], createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      listRunsByThread: () => [
        { id: 'run_1', threadId: 'thread_1', status: 'completed' },
      ],
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/runs')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    threadId: 'thread_1',
    runs: [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
  })
})

test('thread runtime endpoint returns a consistent thread and run snapshot', async () => {
  const thread = {
    id: 'thread_1',
    messages: [{ id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'Continue', createdAt: '2026-05-19T00:00:00.000Z' }],
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
  }
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => threadId === 'thread_1' ? thread : undefined,
      listRunsByThread: () => [
        { id: 'run_1', threadId: 'thread_1', status: 'completed' },
      ],
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/runtime')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    schema: 'movscript.agent.thread-runtime-snapshot.v1',
    updatedAt: '2026-05-19T00:00:01.000Z',
    thread,
    runs: [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
    current: {
      runId: 'run_1',
      runStatus: 'completed',
    },
    interactions: {
      actionableRunIds: [],
      pendingApprovalRefs: [],
      pendingInputRequestRefs: [],
    },
  })
})

test('thread runtime endpoint indexes pending interaction runs for frontend reconstruction', async () => {
  const thread = {
    id: 'thread_1',
    activeRunId: 'run_completed',
    messages: [],
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
  }
  const pendingRun = {
    id: 'run_pending',
    threadId: 'thread_1',
    status: 'requires_action',
    updatedAt: '2026-05-19T00:00:03.000Z',
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_pending',
      title: 'Confirm',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  }
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => threadId === 'thread_1' ? thread : undefined,
      listRunsByThread: () => [
        { id: 'run_completed', threadId: 'thread_1', status: 'completed', updatedAt: '2026-05-19T00:00:02.000Z' },
        pendingRun,
      ],
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/runtime')
  const body = JSON.parse(response.body)

  assert.equal(response.statusCode, 200)
  assert.equal(body.schema, 'movscript.agent.thread-runtime-snapshot.v1')
  assert.equal(body.current.runId, 'run_pending')
  assert.equal(body.current.runStatus, 'requires_action')
  assert.deepEqual(body.interactions.actionableRunIds, ['run_pending'])
  assert.deepEqual(body.interactions.pendingInputRequestRefs, [{ runId: 'run_pending', requestId: 'input_1' }])
  assert.equal(body.updatedAt, '2026-05-19T00:00:03.000Z')
})

test('thread runs endpoint returns not found for missing threads', async () => {
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: () => undefined,
      listRunsByThread: () => [],
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/missing/runs')

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'thread not found')
})

test('thread runtime endpoint returns not found for missing threads', async () => {
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: () => undefined,
      listRunsByThread: () => [],
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/missing/runtime')

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'thread not found')
})

test('thread stream endpoint delegates thread-scoped runtime stream events', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: (threadId: string) => threadId === 'thread_1'
        ? { id: threadId, messages: [], createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      subscribeThreadStream: (threadId: string, listener: (event: unknown) => void) => {
        calls.push(`subscribe:${threadId}`)
        listener({ type: 'run', threadId, run: { id: 'run_1', threadId, status: 'completed' } })
        return () => calls.push(`unsubscribe:${threadId}`)
      },
    },
  } as unknown as AgentServerContext)
  const req = new EventEmitter() as IncomingMessage & { method?: string; url?: string; headers: Record<string, string> }
  req.method = 'GET'
  req.url = '/threads/thread_1/stream'
  req.headers = { host: '127.0.0.1' }
  let statusCode = 0
  let output = ''
  const res = {
    setHeader() {},
    writeHead(code: number) {
      statusCode = code
    },
    write(chunk: string) {
      output += chunk
    },
    end() {},
    writableEnded: false,
  } as unknown as ServerResponse

  await handler(req, res)
  req.emit('close')

  assert.equal(statusCode, 200)
  assert.match(output, /: connected/)
  assert.match(output, /event: run/)
  assert.match(output, /"threadId":"thread_1"/)
  assert.deepEqual(calls, ['subscribe:thread_1', 'unsubscribe:thread_1'])
})

test('thread stream endpoint returns not found for missing threads', async () => {
  const handler = createAgentRequestListener({
    agentRuntime: {
      getThread: () => undefined,
      subscribeThreadStream: () => {
        throw new Error('should not subscribe missing thread')
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/missing/stream')

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'thread not found')
})

test('agent skill bundle install endpoint writes plugin skills and reloads catalog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-server-'))
  const calls: string[] = []
  try {
    const handler = createAgentRequestListener({
      pluginCatalog: { skillsDir: dir },
      agentRuntime: {
        reloadAgentCatalog: () => {
          calls.push('reload')
          return { status: 'reloaded' }
        },
      },
    } as unknown as AgentServerContext)

    const response = await dispatch(handler, 'POST', '/agent-catalog/skills/install-bundle', JSON.stringify({
      pluginId: 'studio.example/plugin',
      files: [{
        path: 'agent-skills/SKILL.md',
        content: '---\nname: Example Skill\ndescription: Example skill.\n---\nUse this skill.',
      }],
    }))
    const body = JSON.parse(response.body)

    assert.equal(response.statusCode, 200)
    assert.equal(body.status, 'installed')
    assert.equal(body.pluginId, 'studio.example/plugin')
    assert.deepEqual(body.installedFiles, ['plugins/studio.example_plugin/SKILL.md'])
    assert.deepEqual(body.catalog, { status: 'reloaded' })
    assert.deepEqual(calls, ['reload'])
    assert.match(readFileSync(join(dir, 'plugins', 'studio.example_plugin', 'SKILL.md'), 'utf8'), /Example Skill/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('agent skill bundle uninstall endpoint removes plugin skills and reloads catalog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-uninstall-server-'))
  const calls: string[] = []
  try {
    const handler = createAgentRequestListener({
      pluginCatalog: { skillsDir: dir },
      agentRuntime: {
        reloadAgentCatalog: () => {
          calls.push('reload')
          return { status: 'reloaded' }
        },
      },
    } as unknown as AgentServerContext)

    await dispatch(handler, 'POST', '/agent-catalog/skills/install-bundle', JSON.stringify({
      pluginId: 'studio.example/plugin',
      files: [{
        path: 'agent-skills/SKILL.md',
        content: '---\nname: Example Skill\ndescription: Example skill.\n---\nUse this skill.',
      }],
    }))

    const response = await dispatch(handler, 'POST', '/agent-catalog/skills/uninstall-bundle', JSON.stringify({
      pluginId: 'studio.example/plugin',
    }))
    const body = JSON.parse(response.body)

    assert.equal(response.statusCode, 200)
    assert.equal(body.status, 'uninstalled')
    assert.equal(body.pluginId, 'studio.example/plugin')
    assert.equal(body.removed, true)
    assert.deepEqual(body.catalog, { status: 'reloaded' })
    assert.deepEqual(calls, ['reload', 'reload'])
    assert.equal(existsSync(join(dir, 'plugins', 'studio.example_plugin', 'SKILL.md')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('inspect endpoint lists installed skill bundle plugins', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-inspect-server-'))
  try {
    const handler = createAgentRequestListener({
      mcpEndpoint: 'mock',
      client: {
        initialize: async () => {},
        listResources: async () => [],
        listTools: async () => [],
      },
      pluginCatalog: {
        skillsDir: dir,
        toolsDir: join(dir, 'tools'),
        layeredSkills: [],
        layeredTools: [],
        warnings: [],
      },
      agentRuntime: {
        reloadAgentCatalog: () => ({ status: 'reloaded' }),
        listRegisteredTools: () => [],
        listSkillCatalog: () => [],
        listProfileCatalog: () => [],
        getDefaultAgentManifest: () => ({ schema: 'movscript.agent.current', id: 'manifest_1', version: '1.0.0', name: 'Manifest', permissions: [], tools: [] }),
      },
      updates: {},
    } as unknown as AgentServerContext)

    await dispatch(handler, 'POST', '/agent-catalog/skills/install-bundle', JSON.stringify({
      pluginId: 'studio.example/plugin',
      files: [{
        path: 'agent-skills/SKILL.md',
        content: '---\nname: Example Skill\ndescription: Example skill.\n---\nUse this skill.',
      }],
    }))

    const response = await dispatch(handler, 'GET', '/inspect')
    const body = JSON.parse(response.body)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(body.pluginCatalog.skillPlugins, [
      { pluginId: 'studio.example_plugin', path: 'plugins/studio.example_plugin' },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('default profile endpoint saves requested runtime profile', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      setDefaultAgentProfile: (input: Record<string, unknown>) => {
        calls.push(input)
        return { schema: 'movscript.agent.current', id: 'manifest_1', version: '1.0.0', name: 'Manifest', tools: [], metadata: { profileId: input.profileId } }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/agent-profiles/default', JSON.stringify({ profileId: 'profile_writer' }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ profileId: 'profile_writer' }])
  assert.equal(JSON.parse(response.body).metadata.profileId, 'profile_writer')
})

test('default tool policy endpoint saves requested runtime tool overrides', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      setDefaultToolPolicy: (input: Record<string, unknown>) => {
        calls.push(input)
        return { schema: 'movscript.agent.current', id: 'manifest_1', version: '1.0.0', name: 'Manifest', tools: input.toolGrants, metadata: { defaultToolGrants: input.toolGrants } }
      },
    },
  } as unknown as AgentServerContext)

  const toolGrants = [{ name: 'movscript_validate_draft', mode: 'deny' }]
  const response = await dispatch(handler, 'POST', '/agent-tools/default-policy', JSON.stringify({ toolGrants }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ toolGrants }])
  assert.deepEqual(JSON.parse(response.body).metadata.defaultToolGrants, toolGrants)
})

test('default skill policy endpoint saves requested runtime skill overrides', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    agentRuntime: {
      setDefaultSkillPolicy: (input: Record<string, unknown>) => {
        calls.push(input)
        return { skills: new Map([['skill_a', { id: 'skill_a', enabled: false }]]) }
      },
    },
  } as unknown as AgentServerContext)

  const skills = [{ id: 'skill_a', enabled: false }]
  const response = await dispatch(handler, 'POST', '/agent-skills/default-policy', JSON.stringify({ skills }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ skills }])
  assert.deepEqual(JSON.parse(response.body).skills, [{ id: 'skill_a', enabled: false }])
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
    const draft = await dispatch(handler, 'POST', '/draft', JSON.stringify({ projectId: Number(invalidProjectId), kind: 'project_standards_proposal' }))

    assert.equal(capabilities.statusCode, 400)
    assert.equal(JSON.parse(capabilities.body).error, 'projectId must be a positive safe integer')
    assert.equal(drafts.statusCode, 400)
    assert.equal(JSON.parse(drafts.body).error, 'projectId must be a positive safe integer')
    assert.equal(draft.statusCode, 400)
    assert.equal(JSON.parse(draft.body).error, 'draft projectId must be a positive safe integer')
  }
  await dispatch(handler, 'GET', '/capabilities?projectId=42')
  await dispatch(handler, 'GET', '/drafts?projectId=42')
  await dispatch(handler, 'POST', '/draft', JSON.stringify({ projectId: 42, kind: 'project_standards_proposal' }))

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

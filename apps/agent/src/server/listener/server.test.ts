import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { createAgentRequestListener, normalizeDebugEvidenceRefQuery, normalizeTraceQuery } from './server.js'
import { normalizeThreadListQuery, paginatedThreadSummaries } from './server-listener/normalizers.js'
import { DEFAULT_MAX_JSON_BODY_BYTES } from '../core/http.js'
import type { AgentServerContext } from '../../bootstrap/server/agentServerContext.js'
import { RuntimeModelConfigStore } from '../../model/config/modelConfig.js'
import { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'
import { MCPToolProviderRegistry } from '../../adapters/mcp/providers/mcpToolProviderRegistry.js'
import type { AgentThreadSummary } from '../../state/shared/types.js'

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

test('normalizeDebugEvidenceRefQuery accepts ref selectors and rejects unknown evidence kind', () => {
  const result = normalizeDebugEvidenceRefQuery(new URL('http://127.0.0.1/runs/run_1/debug-evidence-refs?kind=tool_result&refKey=tool_result%3Acall_1%3Asha256%3Aabc&resultHash=sha256%3Aabc'))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.query, {
    kind: 'tool_result',
    refKey: 'tool_result:call_1:sha256:abc',
    resultHash: 'sha256:abc',
  })

  const invalid = normalizeDebugEvidenceRefQuery(new URL('http://127.0.0.1/runs/run_1/debug-evidence-refs?kind=unknown'))
  assert.equal(invalid.ok, false)
  if (invalid.ok) return
  assert.match(invalid.error, /invalid debug evidence kind/)
})

test('thread history pagination hides provisional sessions unless explicitly requested', () => {
  const active = threadSummaryFixture('thread_active')
  const provisional = threadSummaryFixture('thread_provisional', { lifecycle: 'provisional' })
  const hidden = paginatedThreadSummaries([provisional, active], normalizeThreadListQuery(new URL('http://127.0.0.1/threads')))
  const withProvisional = paginatedThreadSummaries([provisional, active], normalizeThreadListQuery(new URL('http://127.0.0.1/threads?includeProvisional=true')))

  assert.deepEqual(hidden.threads.map((thread) => thread.id), ['thread_active'])
  assert.equal(hidden.total, 1)
  assert.deepEqual(withProvisional.threads.map((thread) => thread.id), ['thread_provisional', 'thread_active'])
  assert.equal(withProvisional.total, 2)
})

function threadSummaryFixture(id: string, overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 0,
    ...overrides,
  }
}

test('telemetry endpoints expose runtime snapshot and prometheus-compatible metrics', async () => {
  const telemetry = new RuntimeTelemetryRegistry()
  telemetry.recordSpan({
    runId: 'run_1',
    threadId: 'thread_1',
    kind: 'tool_call',
    name: 'Tool call: movscript_focus_get',
    status: 'completed',
    durationMs: 45,
    toolName: 'movscript_focus_get',
  })
  const handler = createAgentRequestListener({ telemetry } as unknown as AgentServerContext)

  const snapshot = await dispatch(handler, 'GET', '/runtime/telemetry')
  const metrics = await dispatch(handler, 'GET', '/metrics')

  assert.equal(snapshot.statusCode, 200)
  assert.equal(JSON.parse(snapshot.body).summary.spanCount, 1)
  assert.equal(metrics.statusCode, 200)
  assert.match(metrics.body, /movscript_agent_trace_span_duration_ms_count\{kind="tool_call",status="completed",tool_name="movscript_focus_get"\} 1/)
})

test('runtime health endpoints split liveness, compatibility, and heavier capabilities', async () => {
  const toolProviderRegistry = new MCPToolProviderRegistry('http://127.0.0.1:18765/mcp')
  const handler = createAgentRequestListener({
    mcpEndpoint: 'http://127.0.0.1:18765/mcp',
    toolProviderRegistry,
    paths: {
      runtimeDataDir: '/tmp/agent-runtime',
      memoryPath: '/tmp/agent-memory.json',
      runtimeLogPath: '/tmp/agent-runtime-log/events.jsonl',
      workspacePath: '/tmp/agent-workspaces.json',
      toolResultPath: '/tmp/agent-tool-results.json',
      catalogStatePath: '/tmp/agent-catalog.json',
      modelConfigPath: '/tmp/agent-model-config.json',
    },
    pluginCatalog: {
      skillsDir: '/tmp/skills',
      toolsDir: '/tmp/tools',
      builtinSkillsDir: '/tmp/builtin-skills',
      builtinToolsDir: '/tmp/builtin-tools',
      layeredSkills: [{ id: 'skill_1' }],
      layeredTools: [{ name: 'tool_1' }],
      warnings: ['catalog warning'],
    },
    updates: {
      current: { policyVersion: 'test-policy' },
      policy: { channel: 'stable' },
    },
    backendApplyClient: { isEnabled: () => true },
    modelConfigStore: {
      getPublicConfig: () => {
        throw new Error('health must not read model config')
      },
      getEffectiveConfig: () => {
        throw new Error('health must not compute model capabilities')
      },
    },
  } as unknown as AgentServerContext)

  const livez = await dispatch(handler, 'GET', '/livez')
  const compat = await dispatch(handler, 'GET', '/runtime/compat')
  const legacyHealth = await dispatch(handler, 'GET', '/health')
  const capabilities = await dispatch(handler, 'GET', '/runtime/capabilities')

  assert.equal(livez.statusCode, 200)
  assert.deepEqual(JSON.parse(livez.body), { ok: true })

  assert.equal(compat.statusCode, 200)
  const compatBody = JSON.parse(compat.body)
  assert.equal(compatBody.ok, true)
  assert.equal(compatBody.service, 'movscript-agent')
  assert.equal(compatBody.mcpEndpoint, undefined)
  assert.equal(compatBody.runtime.apiVersion, 1)
  assert.equal(compatBody.runtime.features.includes('runtime-compat'), true)
  assert.equal(compatBody.runtime.features.includes('dynamic-tool-providers'), true)
  assert.equal(compatBody.runtime.endpoints.includes('/livez'), true)
  assert.equal(compatBody.runtime.endpoints.includes('/runtime/tool-providers'), true)
  assert.equal(compatBody.pluginCatalog, undefined)

  assert.equal(legacyHealth.statusCode, 200)
  const healthBody = JSON.parse(legacyHealth.body)
  assert.equal(healthBody.ok, true)
  assert.equal(healthBody.paths.runtimeDataDir, '/tmp/agent-runtime')
  assert.equal(healthBody.workspacePath, '/tmp/agent-workspaces.json')
  assert.equal(healthBody.modelConfigPath, '/tmp/agent-model-config.json')
  assert.equal(healthBody.modelConfig, undefined)
  assert.equal(healthBody.modelCapabilities, undefined)
  assert.equal(healthBody.pluginCatalog, undefined)

  assert.equal(capabilities.statusCode, 200)
  const capabilitiesBody = JSON.parse(capabilities.body)
  assert.equal(capabilitiesBody.pluginCatalog.skillCount, 1)
  assert.equal(capabilitiesBody.pluginCatalog.toolCount, 1)
  assert.equal(capabilitiesBody.paths.workspacePath, '/tmp/agent-workspaces.json')
  assert.equal(capabilitiesBody.toolProviders.length, 1)
  assert.equal(capabilitiesBody.toolProviders[0].providerId, 'default')
})

test('runtime tool provider endpoints register, heartbeat, and remove providers', async () => {
  const toolProviderRegistry = new MCPToolProviderRegistry()
  const handler = createAgentRequestListener({
    toolProviderRegistry,
  } as unknown as AgentServerContext)

  const registered = await dispatch(handler, 'POST', '/runtime/tool-providers', JSON.stringify({
    providerId: 'desktop-main',
    endpoint: 'http://127.0.0.1:18765/mcp',
    label: 'Desktop MCP',
  }))
  assert.equal(registered.statusCode, 200)
  const registeredBody = JSON.parse(registered.body)
  assert.equal(registeredBody.provider.providerId, 'desktop-main')
  assert.equal(registeredBody.provider.endpoint, 'http://127.0.0.1:18765/mcp')

  const listed = await dispatch(handler, 'GET', '/runtime/tool-providers')
  assert.equal(listed.statusCode, 200)
  assert.equal(JSON.parse(listed.body).providers.length, 1)

  const heartbeat = await dispatch(handler, 'POST', '/runtime/tool-providers/desktop-main/heartbeat')
  assert.equal(heartbeat.statusCode, 200)
  assert.equal(JSON.parse(heartbeat.body).provider.providerId, 'desktop-main')

  const removed = await dispatch(handler, 'DELETE', '/runtime/tool-providers/desktop-main')
  assert.equal(removed.statusCode, 200)
  assert.equal(JSON.parse(removed.body).removed, true)
})

test('trace read endpoints return 404 for missing runs instead of surfacing facade errors', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
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
      findRunDebugEvidenceRefs: () => {
        calls.push('debug-evidence-refs')
        throw new Error('should not read debug evidence refs for missing run')
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
  const debugEvidenceRefs = await dispatch(handler, 'GET', '/runs/missing/debug-evidence-refs?resultHash=sha256%3Amissing')
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
  assert.equal(debugEvidenceRefs.statusCode, 404)
  assert.equal(JSON.parse(debugEvidenceRefs.body).error, 'run not found')
  assert.equal(debugEvidence.statusCode, 404)
  assert.equal(JSON.parse(debugEvidence.body).error, 'run not found')
  assert.equal(generationView.statusCode, 404)
  assert.equal(JSON.parse(generationView.body).error, 'run not found')
  assert.deepEqual(calls, [])
})

test('debug ledger endpoints return compact ledger and evidence payloads', async () => {
  const handler = createAgentRequestListener({
    runtimeRouter: {
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
        evidenceIndex: [{ evidenceId: 'trace_1:model_request', eventId: 'trace_1', kind: 'model_request', label: '模型请求负载', chars: 2, preview: '{}', fetchPath: `/runs/${runId}/debug-evidence/trace_1%3Amodel_request`, resultHashes: ['sha256:model_request'] }],
      }),
      findRunDebugEvidenceRefs: (runId: string, query: { resultHash?: string }) => query.resultHash === 'sha256:model_request'
        ? [{
            evidenceId: 'trace_1:model_request',
            eventId: 'trace_1',
            kind: 'model_request',
            label: '模型请求负载',
            chars: 2,
            preview: '{}',
            fetchPath: `/runs/${runId}/debug-evidence/trace_1%3Amodel_request`,
            resultHashes: [query.resultHash],
          }]
        : [],
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
  const refs = await dispatch(handler, 'GET', '/runs/run_1/debug-evidence-refs?resultHash=sha256%3Amodel_request')
  const evidence = await dispatch(handler, 'GET', '/runs/run_1/debug-evidence/trace_1%3Amodel_request')

  assert.equal(ledger.statusCode, 200)
  assert.equal(JSON.parse(ledger.body).schema, 'movscript.agent.run-debug-ledger.v1')
  assert.equal(JSON.parse(ledger.body).budget.estimatedChars, 100)
  assert.equal(refs.statusCode, 200)
  assert.equal(JSON.parse(refs.body).evidenceRefs[0].evidenceId, 'trace_1:model_request')
  assert.equal(evidence.statusCode, 200)
  assert.equal(JSON.parse(evidence.body).evidenceId, 'trace_1:model_request')
  assert.deepEqual(JSON.parse(evidence.body).value, { model: 'gpt-test' })
})

test('JSON request bodies report client errors instead of internal errors', async () => {
  const handler = createAgentRequestListener({} as unknown as AgentServerContext)

  const invalid = await dispatch(handler, 'POST', '/model-config', '{not-json')
  const oversized = await dispatch(handler, 'POST', '/model-config', 'x'.repeat(DEFAULT_MAX_JSON_BODY_BYTES + 1))
  const nonObjectModelConfig = await dispatch(handler, 'POST', '/model-config', '[]')
  const nonObjectWorkspace = await dispatch(handler, 'POST', '/workspace', '[]')

  assert.equal(invalid.statusCode, 400)
  assert.equal(JSON.parse(invalid.body).error, 'invalid JSON request body')
  assert.equal(oversized.statusCode, 413)
  assert.equal(JSON.parse(oversized.body).error, 'request body too large')
  assert.equal(nonObjectModelConfig.statusCode, 400)
  assert.equal(JSON.parse(nonObjectModelConfig.body).error, 'model config body must be an object')
  assert.equal(nonObjectWorkspace.statusCode, 400)
  assert.equal(JSON.parse(nonObjectWorkspace.body).error, 'workspace body must be an object')
})

test('model config endpoint reports invalid config input as client errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-config-server-'))
  try {
    const handler = createAgentRequestListener({
      modelConfigStore: new RuntimeModelConfigStore(join(dir, 'model-config.json')),
    } as unknown as AgentServerContext)

    const invalidModel = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: '' }))
    const invalidRoutes = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.2', useForChat: false, useForPlanner: false }))
    const sensitiveModel = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'sk-proj-exampleSecretValue123456789', apiKind: 'openai_responses' }))
    const sensitiveBaseURL = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.2', apiKind: 'openai_responses', baseURL: 'https://api.openai.com/v1?api_key=secret' }))

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

    const saved = await dispatch(handler, 'POST', '/model-config', JSON.stringify({ model: 'gpt-5.2' }))
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
    { method: 'PATCH', path: '/workspaces/workspace_1', label: 'workspace update body' },
    { method: 'POST', path: '/workspaces/workspace_1/apply-preview', label: 'apply preview body' },
    { method: 'POST', path: '/workspaces/workspace_1/apply-simulate', label: 'apply simulate body' },
    { method: 'POST', path: '/workspaces/workspace_1/apply', label: 'workspace apply body' },
    { method: 'POST', path: '/workspaces/workspace_1/reject', label: 'workspace rejection body' },
    { method: 'POST', path: '/threads', label: 'thread body' },
    { method: 'PATCH', path: '/threads/thread_1', label: 'thread update body' },
    { method: 'POST', path: '/sessions/session_1/runs', label: 'session run body' },
    { method: 'POST', path: '/runs/preview', label: 'run preview body' },
    { method: 'POST', path: '/agent-config-files/active', label: 'active agent config file body' },
    { method: 'POST', path: '/agent-config-files/config_file_default/tool-permissions', label: 'config file tool permissions body' },
    { method: 'POST', path: '/agent-skills/instructions', label: 'skill instructions body' },
    { method: 'POST', path: '/plans', label: 'taskGraph body' },
    { method: 'POST', path: '/plans/task_graph_1/dispatch', label: 'taskGraph dispatch body' },
    { method: 'PATCH', path: '/tasks/task_1', label: 'task update body' },
    { method: 'POST', path: '/runs/run_1/cancel', label: 'cancel body' },
    { method: 'POST', path: '/runs/run_1/cancel-tree', label: 'cancel tree body' },
    { method: 'POST', path: '/runs/run_1/input', label: 'input answer body' },
    { method: 'POST', path: '/memories', label: 'memory body' },
  ]

  for (const entry of cases) {
    const response = await dispatch(handler, entry.method, entry.path, '[]')
    assert.equal(response.statusCode, 400, entry.path)
    assert.equal(JSON.parse(response.body).error, `${entry.label} must be an object`, entry.path)
  }
})

test('agent catalog reload rejects cross-site browser requests before reloading', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      reloadAgentCatalog: () => {
        calls.push('reload')
        return { status: 'reloaded' }
      },
    },
  } as unknown as AgentServerContext)

  const blocked = await dispatch(handler, 'POST', '/agent-catalog/reload', undefined, { 'sec-fetch-site': 'cross-site' })
  const allowed = await dispatch(handler, 'POST', '/agent-catalog/reload')

  assert.equal(blocked.statusCode, 403)
  assert.equal(JSON.parse(blocked.body).error, 'agent catalog reload rejects cross-site browser requests')
  assert.equal(allowed.statusCode, 200)
  assert.deepEqual(calls, ['reload'])
})

test('legacy direct run endpoints are not public runtime entrypoints', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      createRun: () => {
        calls.push('createRun')
        return { id: 'run_unexpected' }
      },
      createToolRun: () => {
        calls.push('createToolRun')
        return { id: 'run_tool_unexpected' }
      },
      approveRun: () => {
        calls.push('approveRun')
        return { id: 'run_approve_unexpected' }
      },
      rejectRun: () => {
        calls.push('rejectRun')
        return { id: 'run_reject_unexpected' }
      },
    },
    client: {
      callTool: () => {
        calls.push('callTool')
        return { ok: true }
      },
      initialize: () => {
        calls.push('initialize')
      },
    },
  } as unknown as AgentServerContext)

  const directRun = await dispatch(handler, 'POST', '/runs', JSON.stringify({ threadId: 'thread_1' }))
  const directToolRun = await dispatch(handler, 'POST', '/runs/tool', JSON.stringify({ toolCall: { name: 'movscript_focus_get' } }))
  const directContext = await dispatch(handler, 'GET', '/context')
  const directApprove = await dispatch(handler, 'POST', '/runs/run_1/approve', JSON.stringify({ approvedToolNames: ['movscript_focus_get'] }))
  const directReject = await dispatch(handler, 'POST', '/runs/run_1/reject', JSON.stringify({ approvalIds: ['approval_1'] }))

  assert.equal(directRun.statusCode, 404)
  assert.equal(directToolRun.statusCode, 404)
  assert.equal(directContext.statusCode, 404)
  assert.equal(directApprove.statusCode, 404)
  assert.equal(directReject.statusCode, 404)
  assert.deepEqual(calls, [])
})

test('thread write endpoints are not exposed to clients', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      addMessage: () => {
        calls.push('addMessage')
        return { id: 'unexpected' }
      },
      createRun: () => {
        calls.push('createRun')
        return { id: 'unexpected' }
      },
    },
  } as unknown as AgentServerContext)

  const message = await dispatch(handler, 'POST', '/threads/thread_1/messages', JSON.stringify({ content: 'Hi' }))
  const run = await dispatch(handler, 'POST', '/threads/thread_1/runs', JSON.stringify({ message: 'Hi' }))

  assert.equal(message.statusCode, 404)
  assert.equal(run.statusCode, 404)
  assert.deepEqual(calls, [])
})

test('thread message endpoint returns a paged message view with scan stats', async () => {
  const calls: Array<{ threadId: string; query: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      listThreadMessagesPage: (threadId: string, query: Record<string, unknown>) => {
        calls.push({ threadId, query })
        return {
          threadId,
          messages: [{
            id: 'msg_page_1',
            threadId,
            role: 'user',
            content: 'paged',
            createdAt: '2026-05-19T00:00:00.000Z',
          }],
          nextAfterOrdinal: 7,
          hasMore: true,
          scan: {
            durationMs: 3,
            bytesRead: 123,
            totalBytes: 456,
            linesRead: 5,
            eventsRead: 5,
            matchedEvents: 2,
            malformedLines: 0,
          },
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/messages?limit=1&afterOrdinal=4')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    threadId: 'thread_1',
    messages: [{
      id: 'msg_page_1',
      threadId: 'thread_1',
      role: 'user',
      content: 'paged',
      createdAt: '2026-05-19T00:00:00.000Z',
    }],
    nextAfterOrdinal: 7,
    hasMore: true,
    scan: {
      durationMs: 3,
      bytesRead: 123,
      totalBytes: 456,
      linesRead: 5,
      eventsRead: 5,
      matchedEvents: 2,
      malformedLines: 0,
    },
  })
  assert.deepEqual(calls, [{
    threadId: 'thread_1',
    query: { afterOrdinal: 4, limit: 1 },
  }])
})

test('session run endpoint resolves the active thread and appends runtime input without a client thread target', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getSession: (sessionId: string) => sessionId === 'session_1'
        ? {
            id: sessionId,
            activeThreadId: 'thread_active',
            interactiveThreadId: 'thread_root',
            rootThreadId: 'thread_root',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }
        : undefined,
      getThread: (threadId: string) => threadId === 'thread_active'
        ? {
            id: threadId,
            sessionId: 'session_1',
            status: 'running',
            activeRunId: 'run_active',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
            messages: [],
          }
        : undefined,
      getRun: (runId: string) => ({ id: runId, sessionId: 'session_1', threadId: 'thread_active', status: 'in_progress' }),
      addMessage: (threadId: string, input: Record<string, unknown>) => {
        calls.push({ endpoint: 'message', input: { threadId, ...input } })
        return {
          id: input.id ?? 'msg_runtime_input',
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

  const response = await dispatch(handler, 'POST', '/sessions/session_1/runs', JSON.stringify({
    message: '补一句新的约束',
    sourceMessageId: 'local_session_runtime_input',
  }))

  assert.equal(response.statusCode, 202)
  const body = JSON.parse(response.body)
  assert.equal(body.run.id, 'run_active')
  assert.equal(body.message.threadId, 'thread_active')
  assert.deepEqual(body.runtimeInput, {
    accepted: true,
    runId: 'run_active',
    messageId: 'local_session_runtime_input',
    deliveryStatus: 'accepted',
  })
  assert.deepEqual(calls, [
    {
      endpoint: 'message',
      input: {
        threadId: 'thread_active',
        id: 'local_session_runtime_input',
        role: 'user',
        content: '补一句新的约束',
        runId: 'run_active',
        metadata: {
          kind: 'runtime_input',
          targetRunId: 'run_active',
          mode: 'soft',
          deliveryStatus: 'accepted',
        },
      },
    },
  ])
})

test('thread runs endpoint lists only runs from the requested thread', async () => {
  const handler = createAgentRequestListener({
    runtimeRouter: {
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

test('thread delete endpoint physically deletes one thread history when no run is active', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getThread: (threadId: string) => threadId === 'thread_1'
        ? { id: threadId, messages: [], createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      listRunsByThread: () => [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
      deleteThread: (threadId: string) => {
        calls.push(`delete:${threadId}`)
        return {
          deleted: true,
          threadId,
          deletedRunIds: ['run_1'],
          deletedTaskGraphIds: [],
          deletedTaskIds: [],
          deletedRuntimeWorkIds: [],
          deletedRuntimeInteractionIds: [],
          deletedRuntimeContinuationIds: [],
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'DELETE', '/threads/thread_1')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    deleted: true,
    threadId: 'thread_1',
    deletedRunIds: ['run_1'],
    deletedTaskGraphIds: [],
    deletedTaskIds: [],
    deletedRuntimeWorkIds: [],
    deletedRuntimeInteractionIds: [],
    deletedRuntimeContinuationIds: [],
  })
  assert.deepEqual(calls, ['delete:thread_1'])
})

test('thread delete endpoint rejects active runs before deleting state', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getThread: (threadId: string) => ({ id: threadId, messages: [], createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }),
      listRunsByThread: () => [{ id: 'run_active', threadId: 'thread_1', status: 'in_progress' }],
      deleteThread: () => {
        calls.push('delete')
        return { deleted: true }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'DELETE', '/threads/thread_1')

  assert.equal(response.statusCode, 409)
  assert.deepEqual(JSON.parse(response.body), {
    error: 'active runs must be cancelled before deleting thread',
    runId: 'run_active',
  })
  assert.deepEqual(calls, [])
})

test('threads delete endpoint clears all history when no run is active', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      listRuns: () => [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
      deleteAllThreads: () => {
        calls.push('deleteAll')
        return {
          deleted: true,
          deletedThreadIds: ['thread_1'],
          deletedRunIds: ['run_1'],
          deletedTaskGraphIds: [],
          deletedTaskIds: [],
          deletedRuntimeWorkIds: [],
          deletedRuntimeInteractionIds: [],
          deletedRuntimeContinuationIds: [],
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'DELETE', '/threads')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    deleted: true,
    deletedThreadIds: ['thread_1'],
    deletedRunIds: ['run_1'],
    deletedTaskGraphIds: [],
    deletedTaskIds: [],
    deletedRuntimeWorkIds: [],
    deletedRuntimeInteractionIds: [],
    deletedRuntimeContinuationIds: [],
  })
  assert.deepEqual(calls, ['deleteAll'])
})

test('threads delete endpoint clears waiting history runs', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      listRuns: () => [{ id: 'run_active', threadId: 'thread_1', status: 'requires_action' }],
      deleteAllThreads: () => {
        calls.push('deleteAll')
        return {
          deleted: true,
          deletedThreadIds: ['thread_1'],
          deletedRunIds: ['run_active'],
          deletedTaskGraphIds: [],
          deletedTaskIds: [],
          deletedRuntimeWorkIds: [],
          deletedRuntimeInteractionIds: [],
          deletedRuntimeContinuationIds: [],
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'DELETE', '/threads')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    deleted: true,
    deletedThreadIds: ['thread_1'],
    deletedRunIds: ['run_active'],
    deletedTaskGraphIds: [],
    deletedTaskIds: [],
    deletedRuntimeWorkIds: [],
    deletedRuntimeInteractionIds: [],
    deletedRuntimeContinuationIds: [],
  })
  assert.deepEqual(calls, ['deleteAll'])
})

test('threads delete endpoint rejects executing runs before clearing history', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      listRuns: () => [{ id: 'run_active', threadId: 'thread_1', status: 'queued' }],
      deleteAllThreads: () => {
        calls.push('deleteAll')
        return { deleted: true }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'DELETE', '/threads')

  assert.equal(response.statusCode, 409)
  assert.deepEqual(JSON.parse(response.body), {
    error: 'active runs must be cancelled before deleting thread history',
    runId: 'run_active',
  })
  assert.deepEqual(calls, [])
})

test('threads list endpoint returns cursor-paginated summaries', async () => {
  const summaries = [
    { id: 'thread_3', title: 'Three', archived: false, createdAt: '2026-05-21T00:00:00.000Z', updatedAt: '2026-05-21T00:00:03.000Z', messageCount: 3 },
    { id: 'thread_2', title: 'Two', archived: false, createdAt: '2026-05-21T00:00:00.000Z', updatedAt: '2026-05-21T00:00:02.000Z', messageCount: 2 },
    { id: 'thread_1', title: 'One', archived: false, createdAt: '2026-05-21T00:00:00.000Z', updatedAt: '2026-05-21T00:00:01.000Z', messageCount: 1 },
  ]
  const handler = createAgentRequestListener({
    runtimeRouter: {
      listThreadSummaries: () => summaries,
    },
  } as unknown as AgentServerContext)

  const first = await dispatch(handler, 'GET', '/threads?limit=2')
  const firstBody = JSON.parse(first.body)
  const second = await dispatch(handler, 'GET', `/threads?limit=2&cursor=${firstBody.nextCursor}`)

  assert.equal(first.statusCode, 200)
  assert.deepEqual(firstBody.threads.map((thread: { id: string }) => thread.id), ['thread_3', 'thread_2'])
  assert.equal(firstBody.total, 3)
  assert.equal(firstBody.limit, 2)
  assert.equal(firstBody.hasMore, true)
  assert.equal(firstBody.nextCursor, 'thread_2')
  assert.equal(second.statusCode, 200)
  assert.deepEqual(JSON.parse(second.body), {
    threads: [summaries[2]],
    total: 3,
    limit: 2,
    hasMore: false,
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
    runtimeRouter: {
      getThreadRuntimeSnapshot: (threadId: string) => threadId === 'thread_1'
        ? {
          schema: 'movscript.agent.internal-thread-snapshot.v1',
          updatedAt: '2026-05-19T00:00:01.000Z',
          thread,
          runs: [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
          works: [],
          interactions: [],
          continuations: [],
          wakeEvents: [],
          current: {
            activeRunIds: [],
            waitingRunIds: [],
            runningWorkIds: [],
            pendingInteractionIds: [],
            readyContinuationIds: [],
            queuedWakeEventIds: [],
          },
        }
        : undefined,
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/runtime')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: 'thread_1' },
    cursor: 'runtime-snapshot:thread:thread_1:0',
    ordinal: 0,
    generatedAt: '2026-05-19T00:00:01.000Z',
    entities: {
      threads: [thread],
      messages: thread.messages,
      runs: [{ id: 'run_1', threadId: 'thread_1', status: 'completed' }],
      works: [],
      interactions: [],
      continuations: [],
      wakeEvents: [],
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
    runtimeRouter: {
      getThreadRuntimeSnapshot: (threadId: string) => threadId === 'thread_1'
        ? {
          schema: 'movscript.agent.internal-thread-snapshot.v1',
          updatedAt: '2026-05-19T00:00:03.000Z',
          thread,
          runs: [
            { id: 'run_completed', threadId: 'thread_1', status: 'completed', updatedAt: '2026-05-19T00:00:02.000Z' },
            pendingRun,
          ],
          works: [],
          interactions: [{
            id: 'interaction_input_1',
            threadId: 'thread_1',
            runId: 'run_pending',
            kind: 'input',
            status: 'pending',
            payload: { requestId: 'input_1' },
            createdAt: '2026-05-19T00:00:02.000Z',
            updatedAt: '2026-05-19T00:00:02.000Z',
          }],
          continuations: [],
          wakeEvents: [],
          current: {
            activeRunIds: [],
            waitingRunIds: ['run_pending'],
            runningWorkIds: [],
            pendingInteractionIds: ['interaction_input_1'],
            readyContinuationIds: [],
            queuedWakeEventIds: [],
          },
        }
        : undefined,
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/thread_1/runtime')
  const body = JSON.parse(response.body)

  assert.equal(response.statusCode, 200)
  assert.equal(body.schema, 'movscript.agent.runtime-snapshot.v2')
  assert.equal(body.protocolVersion, 'movscript.agent.protocol.v1')
  assert.deepEqual(body.scope, { type: 'thread', id: 'thread_1' })
  assert.deepEqual(body.entities.runs.map((run: { id: string }) => run.id), ['run_completed', 'run_pending'])
  assert.deepEqual(body.entities.interactions.map((interaction: { id: string }) => interaction.id), ['interaction_input_1'])
  assert.equal(body.generatedAt, '2026-05-19T00:00:03.000Z')
})

test('session runtime endpoint returns aggregate plan, child agent, and work state', async () => {
  const session = {
    id: 'session_1',
    rootThreadId: 'thread_root',
    activeThreadId: 'thread_child',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:05.000Z',
  }
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getSessionRuntimeSnapshot: (sessionId: string) => sessionId === 'session_1'
        ? {
          schema: 'movscript.agent.internal-session-snapshot.v1',
          updatedAt: '2026-05-19T00:00:05.000Z',
          session,
          threads: [
            { id: 'thread_root', sessionId: 'session_1', agentRole: 'root', messages: [] },
            { id: 'thread_child', sessionId: 'session_1', agentRole: 'worker', parentThreadId: 'thread_root', messages: [] },
          ],
          taskGraphs: [{
            taskGraph: { id: 'task_graph_1', sessionId: 'session_1', threadId: 'thread_root', rootRunId: 'run_root', status: 'running' },
            tasks: [{ id: 'task_1', taskGraphId: 'task_graph_1', ownerRunId: 'run_child', status: 'running' }],
            runs: [{ id: 'run_root', sessionId: 'session_1', threadId: 'thread_root', status: 'in_progress' }],
          }],
          runs: [
            { id: 'run_root', sessionId: 'session_1', threadId: 'thread_root', status: 'in_progress' },
            { id: 'run_child', sessionId: 'session_1', threadId: 'thread_child', parentRunId: 'run_root', status: 'queued' },
          ],
          works: [{ id: 'work_1', sessionId: 'session_1', threadId: 'thread_child', runId: 'run_child', kind: 'generation_job', status: 'waiting' }],
          interactions: [],
          continuations: [],
          wakeEvents: [],
          current: {
            activeThreadIds: ['thread_root'],
            activeRunIds: ['run_root', 'run_child'],
            waitingRunIds: [],
            runningWorkIds: ['work_1'],
            pendingInteractionIds: [],
            readyContinuationIds: [],
            queuedWakeEventIds: [],
          },
        }
        : undefined,
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/sessions/session_1/runtime')
  const body = JSON.parse(response.body)

  assert.equal(response.statusCode, 200)
  assert.equal(body.schema, 'movscript.agent.runtime-snapshot.v2')
  assert.equal(body.protocolVersion, 'movscript.agent.protocol.v1')
  assert.equal(body.entities.sessions[0].id, 'session_1')
  assert.deepEqual(body.entities.threads.map((thread: { id: string }) => thread.id), ['thread_root', 'thread_child'])
  assert.deepEqual(body.entities.taskGraphs.map((snapshot: { taskGraph: { id: string } }) => snapshot.taskGraph.id), ['task_graph_1'])
  assert.deepEqual(body.entities.works.map((work: { id: string }) => work.id), ['work_1'])
})

test('thread runs endpoint returns not found for missing threads', async () => {
  const handler = createAgentRequestListener({
    runtimeRouter: {
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
    runtimeRouter: {
      getThreadRuntimeSnapshot: () => undefined,
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/threads/missing/runtime')

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'thread not found')
})

test('thread timeline returns the latest page and paginates backward', async () => {
  const thread = {
    id: 'thread_1',
    sessionId: 'session_1',
    messages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'One', createdAt: '2026-05-19T00:00:01.000Z' },
      { id: 'msg_2', threadId: 'thread_1', role: 'user', content: 'Two', createdAt: '2026-05-19T00:00:02.000Z' },
      { id: 'msg_3', threadId: 'thread_1', role: 'assistant', content: 'Done', runId: 'run_2', createdAt: '2026-05-19T00:00:03.000Z' },
    ],
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:03.000Z',
  }
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getThread: (threadId: string) => threadId === 'thread_1' ? thread : undefined,
      listRunsByThread: () => [
        { id: 'run_2', threadId: 'thread_1', sessionId: 'session_1', status: 'completed', input: { sourceMessageId: 'msg_2' }, assistantMessageId: 'msg_3', createdAt: '2026-05-19T00:00:02.100Z', updatedAt: '2026-05-19T00:00:03.000Z' },
      ],
    },
  } as unknown as AgentServerContext)

  const latest = await dispatch(handler, 'GET', '/threads/thread_1/timeline?limit=2')
  const latestBody = JSON.parse(latest.body)

  assert.equal(latest.statusCode, 200)
  assert.deepEqual(latestBody.items.map((item: { id: string }) => item.id), ['message:msg_2', 'assistant:run_2'])
  assert.equal(latestBody.hasMoreBefore, true)
  assert.equal(typeof latestBody.nextBefore, 'string')

  const older = await dispatch(handler, 'GET', `/threads/thread_1/timeline?limit=2&before=${encodeURIComponent(latestBody.nextBefore)}`)
  const olderBody = JSON.parse(older.body)

  assert.equal(older.statusCode, 200)
  assert.deepEqual(olderBody.items.map((item: { id: string }) => item.id), ['message:msg_1'])
  assert.equal(olderBody.hasMoreBefore, false)
})

test('session timeline can project all session threads or one thread', async () => {
  const snapshot = {
    session: { id: 'session_1', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:04.000Z' },
    threads: [
      {
        id: 'thread_1',
        sessionId: 'session_1',
        messages: [{ id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'One', createdAt: '2026-05-19T00:00:01.000Z' }],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
      },
      {
        id: 'thread_2',
        sessionId: 'session_1',
        messages: [{ id: 'msg_2', threadId: 'thread_2', role: 'user', content: 'Two', createdAt: '2026-05-19T00:00:02.000Z' }],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:02.000Z',
      },
    ],
    runs: [],
    works: [],
    interactions: [],
    continuations: [],
    wakeEvents: [],
    taskGraphs: [],
    updatedAt: '2026-05-19T00:00:04.000Z',
  }
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getSessionRuntimeSnapshot: (sessionId: string) => sessionId === 'session_1' ? snapshot : undefined,
    },
  } as unknown as AgentServerContext)

  const all = await dispatch(handler, 'GET', '/sessions/session_1/timeline?limit=10')
  const oneThread = await dispatch(handler, 'GET', '/sessions/session_1/timeline?threadId=thread_2&limit=10')

  assert.deepEqual(JSON.parse(all.body).items.map((item: { threadId: string }) => item.threadId), ['thread_1', 'thread_2'])
  assert.deepEqual(JSON.parse(oneThread.body).items.map((item: { threadId: string }) => item.threadId), ['thread_2'])
})

test('thread timeline stream emits created and updated timeline events', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getThread: (threadId: string) => threadId === 'thread_1'
        ? { id: threadId, sessionId: 'session_1', messages: [], createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      getRun: (runId: string) => runId === 'run_1'
        ? { id: 'run_1', threadId: 'thread_1', sessionId: 'session_1', status: 'in_progress', createdAt: '2026-05-19T00:00:01.000Z', updatedAt: '2026-05-19T00:00:02.000Z' }
        : undefined,
      listRunsByThread: () => [],
      subscribeThreadStream: (threadId: string, listener: (event: unknown) => void) => {
        calls.push(`subscribe:${threadId}`)
        listener({
          type: 'assistant_progress',
          threadId,
          runId: 'run_1',
          traceEventId: 'trace_1',
          delta: 'Hel',
          accumulated: 'Hel',
          createdAt: '2026-05-19T00:00:02.000Z',
        })
        listener({
          type: 'assistant_message',
          threadId,
          runId: 'run_1',
          run: { id: 'run_1', threadId, sessionId: 'session_1', status: 'completed', assistantMessageId: 'msg_assistant', createdAt: '2026-05-19T00:00:01.000Z', updatedAt: '2026-05-19T00:00:03.000Z' },
          message: { id: 'msg_assistant', threadId, role: 'assistant', content: 'Hello', runId: 'run_1', createdAt: '2026-05-19T00:00:03.000Z' },
        })
        return () => calls.push(`unsubscribe:${threadId}`)
      },
    },
  } as unknown as AgentServerContext)
  const req = new EventEmitter() as IncomingMessage & { method?: string; url?: string; headers: Record<string, string> }
  req.method = 'GET'
  req.url = '/threads/thread_1/timeline/stream'
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
  assert.match(output, /event: timeline\.item\.created/)
  assert.match(output, /event: timeline\.item\.updated/)
  assert.match(output, /"id":"assistant:run_1"/)
  assert.match(output, /"content":"Hello"/)
  assert.deepEqual(calls, ['subscribe:thread_1', 'unsubscribe:thread_1'])
})

test('thread timeline stream asks clients to reset when Last-Event-ID is stale', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getThread: (threadId: string) => threadId === 'thread_1'
        ? {
            id: threadId,
            sessionId: 'session_1',
            messages: [{ id: 'msg_1', threadId, role: 'user', content: 'One', createdAt: '2026-05-19T00:00:02.000Z' }],
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:02.000Z',
          }
        : undefined,
      listRunsByThread: () => [],
      subscribeThreadStream: (threadId: string) => {
        calls.push(`subscribe:${threadId}`)
        return () => calls.push(`unsubscribe:${threadId}`)
      },
    },
  } as unknown as AgentServerContext)
  const req = new EventEmitter() as IncomingMessage & { method?: string; url?: string; headers: Record<string, string> }
  req.method = 'GET'
  req.url = '/threads/thread_1/timeline/stream'
  req.headers = { host: '127.0.0.1', 'last-event-id': '1:message:old' }
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
  assert.match(output, /event: timeline\.reset_required/)
  assert.match(output, /"reason":"missed_events"/)
  assert.deepEqual(calls, ['subscribe:thread_1', 'unsubscribe:thread_1'])
})

test('thread stream endpoint delegates thread-scoped runtime stream events', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
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
    runtimeRouter: {
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

test('session stream endpoint delegates session-scoped runtime stream events', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getSession: (sessionId: string) => sessionId === 'session_1'
        ? { id: sessionId, rootThreadId: 'thread_1', interactiveThreadId: 'thread_1', status: 'running', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      subscribeSessionStream: (sessionId: string, listener: (event: unknown) => void) => {
        calls.push(`subscribe:${sessionId}`)
        listener({ type: 'run', threadId: 'thread_1', run: { id: 'run_1', sessionId, threadId: 'thread_1', status: 'completed' } })
        return () => calls.push(`unsubscribe:${sessionId}`)
      },
    },
  } as unknown as AgentServerContext)
  const req = new EventEmitter() as IncomingMessage & { method?: string; url?: string; headers: Record<string, string> }
  req.method = 'GET'
  req.url = '/sessions/session_1/stream'
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
  assert.match(output, /"scope":\{"type":"session","id":"session_1"\}/)
  assert.match(output, /"threadId":"thread_1"/)
  assert.deepEqual(calls, ['subscribe:session_1', 'unsubscribe:session_1'])
})

test('session agent exits only after explicit stop and last subscriber disconnects', async () => {
  const calls: string[] = []
  let shutdownRequests = 0
  const handler = createAgentRequestListener({
    sessionRuntime: {
      paths: { sessionId: 'session_1' },
    },
    runtimeRouter: {
      getSession: (sessionId: string) => sessionId === 'session_1'
        ? { id: sessionId, rootThreadId: 'thread_1', interactiveThreadId: 'thread_1', status: 'running', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }
        : undefined,
      subscribeSessionStream: (sessionId: string) => {
        calls.push(`subscribe:${sessionId}`)
        return () => calls.push(`unsubscribe:${sessionId}`)
      },
      cancelRun: (runId: string) => {
        calls.push(`cancel:${runId}`)
        return { id: runId, sessionId: 'session_1', threadId: 'thread_1', status: 'cancelled' }
      },
    },
  } as unknown as AgentServerContext, {
    idleShutdownDelayMs: 0,
    onShutdownRequest: () => {
      shutdownRequests += 1
    },
  })
  const req = new EventEmitter() as IncomingMessage & { method?: string; url?: string; headers: Record<string, string> }
  req.method = 'GET'
  req.url = '/sessions/session_1/stream'
  req.headers = { host: '127.0.0.1' }
  const res = {
    setHeader() {},
    writeHead() {},
    write() {},
    end() {},
    writableEnded: false,
  } as unknown as ServerResponse

  await handler(req, res)
  const cancelResponse = await dispatch(handler, 'POST', '/runs/run_1/cancel', JSON.stringify({ reason: '用户停止了当前会话。' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.equal(cancelResponse.statusCode, 200)
  assert.equal(shutdownRequests, 0)

  req.emit('close')
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.equal(shutdownRequests, 1)
  assert.deepEqual(calls, ['subscribe:session_1', 'cancel:run_1', 'unsubscribe:session_1'])
})

test('session lease keeps stopped agent alive until the UI releases it', async () => {
  const calls: string[] = []
  let shutdownRequests = 0
  const handler = createAgentRequestListener({
    sessionRuntime: {
      paths: { sessionId: 'session_1' },
    },
    runtimeRouter: {
      cancelRun: (runId: string) => {
        calls.push(`cancel:${runId}`)
        return { id: runId, sessionId: 'session_1', threadId: 'thread_1', status: 'cancelled' }
      },
    },
  } as unknown as AgentServerContext, {
    idleShutdownDelayMs: 0,
    onShutdownRequest: () => {
      shutdownRequests += 1
    },
  })

  const lease = await dispatch(handler, 'POST', '/runtime/session/leases', JSON.stringify({
    leaseId: 'trace-page:test',
    ttlMs: 30_000,
    holder: 'trace-page',
  }))
  assert.equal(lease.statusCode, 200)
  assert.equal(JSON.parse(lease.body).activeLeases, 1)

  const cancelResponse = await dispatch(handler, 'POST', '/runs/run_1/cancel', JSON.stringify({ reason: '用户停止了当前会话。' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.equal(cancelResponse.statusCode, 200)
  assert.equal(shutdownRequests, 0)

  const release = await dispatch(handler, 'DELETE', '/runtime/session/leases/trace-page%3Atest')
  assert.equal(release.statusCode, 200)
  assert.equal(JSON.parse(release.body).released, true)
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.equal(shutdownRequests, 1)
  assert.deepEqual(calls, ['cancel:run_1'])
})

test('session stream endpoint returns not found for missing sessions', async () => {
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getSession: () => undefined,
      subscribeSessionStream: () => {
        throw new Error('should not subscribe missing session')
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'GET', '/sessions/missing/stream')

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'session not found')
})

test('run input endpoint preserves the client source message id', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      answerRunInputRequest: (runId: string, input: Record<string, unknown>) => {
        calls.push({ runId, ...input })
        return { id: runId, threadId: 'thread_1', status: 'queued' }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/runs/run_1/input', JSON.stringify({
    requestId: 'input_1',
    text: '继续',
    sourceMessageId: 'local_answer_1',
  }))

  assert.equal(response.statusCode, 202)
  assert.deepEqual(calls, [{
    runId: 'run_1',
    requestId: 'input_1',
    text: '继续',
    sourceMessageId: 'local_answer_1',
  }])
})

test('agent runtime no longer exposes pack install or uninstall endpoints', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      reloadAgentCatalog: () => {
        calls.push('reload')
        return { status: 'reloaded' }
      },
    },
  } as unknown as AgentServerContext)

  const installResponse = await dispatch(handler, 'POST', '/agent-catalog/packs/install', JSON.stringify({
    pluginId: 'studio.example/plugin',
    files: [{
      path: 'agent-skills/SKILL.md',
      content: '---\nname: Example Skill\ndescription: Example skill.\n---\nUse this skill.',
    }],
  }))
  const uninstallResponse = await dispatch(handler, 'POST', '/agent-catalog/packs/uninstall', JSON.stringify({
    pluginId: 'studio.example/plugin',
  }))

  assert.equal(installResponse.statusCode, 404)
  assert.equal(uninstallResponse.statusCode, 404)
  assert.deepEqual(calls, [])
})

test('inspect endpoint reports loaded catalog but not frontend-managed pack store plugins', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-inspect-server-'))
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
      runtimeRouter: {
        reloadAgentCatalog: () => ({ status: 'reloaded' }),
        listRegisteredTools: () => [],
        listSkillCatalog: () => [],
        listPackCatalog: () => [{ id: 'pack_1', version: '1.0.0', name: 'Pack', source: 'plugin', schemas: [], skills: [], tools: [] }],
        listConfigFileCatalog: () => [],
        getActiveAgentManifest: () => ({ schema: 'movscript.agent.current', id: 'config_file_active', version: '1.0.0', name: 'Manifest', permissions: [], tools: [], metadata: { configFileId: 'config_file_active' } }),
      },
      updates: {},
    } as unknown as AgentServerContext)

    const response = await dispatch(handler, 'GET', '/inspect')
    const body = JSON.parse(response.body)

    assert.equal(response.statusCode, 200)
    assert.equal(body.activeConfigFileId, 'config_file_active')
    assert.deepEqual(body.packs.map((pack: { id: string }) => pack.id), ['pack_1'])
    assert.equal(body.pluginCatalog.packPlugins, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('config file endpoint saves requested runtime config file', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      setActiveAgentConfigFile: (input: Record<string, unknown>) => {
        calls.push(input)
        return { schema: 'movscript.agent.current', id: 'manifest_1', version: '1.0.0', name: 'Manifest', tools: [], metadata: { configFileId: input.configFileId } }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/agent-config-files/active', JSON.stringify({ configFileId: 'config_file_writer' }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ configFileId: 'config_file_writer' }])
  assert.equal(JSON.parse(response.body).metadata.configFileId, 'config_file_writer')
})

test('config file management endpoints save and delete managed config files', async () => {
  const calls: Array<{ action: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      saveAgentConfigFile: (input: Record<string, unknown>) => {
        calls.push({ action: 'save', input })
        return { configFile: input.configFile, configFiles: [input.configFile], activeAgentManifest: { metadata: { configFileId: (input.configFile as Record<string, unknown>).id } } }
      },
      deleteAgentConfigFile: (input: Record<string, unknown>) => {
        calls.push({ action: 'delete', input })
        return { configFiles: [], activeAgentManifest: { metadata: { configFileId: 'movscript.config_file.base' } } }
      },
    },
  } as unknown as AgentServerContext)
  const configFile = {
    schema: 'movscript.agent.config_file.v1',
    id: 'config_file_storyboard',
    version: '1.0.0',
    name: 'Storyboard Config',
    enabledPackIds: [],
    skillIds: [],
    toolGrants: [],
  }

  const saveResponse = await dispatch(handler, 'POST', '/agent-config-files', JSON.stringify({ configFile, activate: true }))
  const deleteResponse = await dispatch(handler, 'DELETE', '/agent-config-files/config_file_storyboard')

  assert.equal(saveResponse.statusCode, 200)
  assert.equal(JSON.parse(saveResponse.body).configFile.id, 'config_file_storyboard')
  assert.equal(deleteResponse.statusCode, 200)
  assert.deepEqual(calls, [
    { action: 'save', input: { configFile, activate: true } },
    { action: 'delete', input: { configFileId: 'config_file_storyboard' } },
  ])
})

test('config file tool permissions endpoint saves requested runtime tool overrides for the target config file', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      saveConfigFileToolPermissions: (input: Record<string, unknown>) => {
        calls.push(input)
        return {
          schema: 'movscript.agent.current',
          id: 'manifest_1',
          version: '1.0.0',
          name: 'Manifest',
          tools: input.toolGrants,
          metadata: { toolPermissionOverridesByConfigFile: { config_file_default: input.toolGrants } },
        }
      },
    },
  } as unknown as AgentServerContext)

  const toolGrants = [{ name: 'workspace_apply_preview', mode: 'deny' }]
  const response = await dispatch(handler, 'POST', '/agent-config-files/config_file_default/tool-permissions', JSON.stringify({ toolGrants }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ configFileId: 'config_file_default', toolGrants }])
  assert.deepEqual(JSON.parse(response.body).metadata.toolPermissionOverridesByConfigFile.config_file_default, toolGrants)
})

test('skill instructions endpoint saves requested runtime skill overrides', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      saveSkillInstructions: (input: Record<string, unknown>) => {
        calls.push(input)
        return { skills: new Map([['skill_a', { id: 'skill_a', enabled: false }]]) }
      },
    },
  } as unknown as AgentServerContext)

  const skills = [{ id: 'skill_a', enabled: false, instructionTemplate: 'Edited instruction.' }]
  const response = await dispatch(handler, 'POST', '/agent-skills/instructions', JSON.stringify({ skills }))

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ skills }])
  assert.deepEqual(JSON.parse(response.body).skills, [{ id: 'skill_a', enabled: false }])
})

test('runtime recovery reconcile endpoint delegates to runtime router', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      reconcileRuntimeThreads: () => {
        calls.push('reconcile')
        return {
          checkedRunCount: 2,
          rescheduledRunIds: ['run_queued'],
          interruptedRunIds: ['run_interrupted'],
          waitingRunIds: [],
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/runtime/recovery/reconcile')

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, ['reconcile'])
  assert.deepEqual(JSON.parse(response.body), {
    checkedRunCount: 2,
    rescheduledRunIds: ['run_queued'],
    interruptedRunIds: ['run_interrupted'],
    waitingRunIds: [],
  })
})

test('run resume endpoint delegates interrupted run recovery to runtime router', async () => {
  const calls: string[] = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      resumeInterruptedRun: (runId: string) => {
        calls.push(runId)
        return {
          id: runId,
          threadId: 'thread_1',
          status: 'queued',
          policy: {},
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:01:00.000Z',
          steps: [],
        }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/runs/run_1/resume')

  assert.equal(response.statusCode, 202)
  assert.deepEqual(calls, ['run_1'])
  assert.equal(JSON.parse(response.body).status, 'queued')
})

test('public agent project id boundaries reject invalid project scopes', async () => {
  const calls: Array<{ endpoint: string; input: Record<string, unknown> }> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      getCapabilities: async (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'capabilities', input })
        return { ok: true }
      },
      listWorkspaces: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'workspaces', input })
        return []
      },
      createLocalWorkspace: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'workspace', input })
        return { id: 'workspace_1', ...input }
      },
    },
  } as unknown as AgentServerContext)

  for (const invalidProjectId of ['0', '42.5']) {
    const capabilities = await dispatch(handler, 'GET', `/capabilities?projectId=${invalidProjectId}`)
    const workspaces = await dispatch(handler, 'GET', `/workspaces?projectId=${invalidProjectId}`)
    const workspace = await dispatch(handler, 'POST', '/workspace', JSON.stringify({ projectId: Number(invalidProjectId), kind: 'project_standards_workspace' }))

    assert.equal(capabilities.statusCode, 400)
    assert.equal(JSON.parse(capabilities.body).error, 'projectId must be a positive safe integer')
    assert.equal(workspaces.statusCode, 400)
    assert.equal(JSON.parse(workspaces.body).error, 'projectId must be a positive safe integer')
    assert.equal(workspace.statusCode, 400)
    assert.equal(JSON.parse(workspace.body).error, 'workspace projectId must be a positive safe integer')
  }
  await dispatch(handler, 'GET', '/capabilities?projectId=42')
  await dispatch(handler, 'GET', '/workspaces?projectId=42&current=true')
  await dispatch(handler, 'POST', '/workspace', JSON.stringify({ projectId: 42, kind: 'project_standards_workspace' }))

  assert.deepEqual(calls.map((call) => [call.endpoint, call.input.projectId, call.input.currentProjectId, call.input.current]), [
    ['capabilities', undefined, 42, undefined],
    ['workspaces', 42, undefined, true],
    ['workspace', 42, undefined, undefined],
  ])
})

test('workspace creation drops invalid numeric business reference ids', async () => {
  const calls: Array<Record<string, unknown>> = []
  const handler = createAgentRequestListener({
    runtimeRouter: {
      createLocalWorkspace: (input: Record<string, unknown>) => {
        calls.push(input)
        return { id: 'workspace_1', ...input }
      },
    },
  } as unknown as AgentServerContext)

  const response = await dispatch(handler, 'POST', '/workspace', JSON.stringify({
    kind: 'project_standards_workspace',
    content: 'Workspace',
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
    runtimeRouter: {
      listWorkspaces: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'workspaces', input })
        return []
      },
      listMemorySummaries: (input: Record<string, unknown>) => {
        calls.push({ endpoint: 'memories', input })
        return []
      },
    },
  } as unknown as AgentServerContext)

  for (const limit of ['0', '2.8', 'Infinity', '999']) {
    await dispatch(handler, 'GET', `/workspaces?limit=${limit}`)
    await dispatch(handler, 'GET', `/memories?projectId=42&limit=${limit}`)
  }

  assert.deepEqual(calls.map((call) => [call.endpoint, call.input.limit]), [
    ['workspaces', 1],
    ['memories', 1],
    ['workspaces', 2],
    ['memories', 2],
    ['workspaces', undefined],
    ['memories', undefined],
    ['workspaces', 100],
    ['memories', 100],
  ])
})

function dispatch(
  handler: ReturnType<typeof createAgentRequestListener>,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
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
    req.headers = { host: '127.0.0.1', ...headers }
    ;(req as any).setEncoding = () => {}
    ;(req as any).destroy = () => {}

    const resBody = new PassThrough()
    let statusCode = 0
    const res = {
      writeHead(code: number) {
        statusCode = code
      },
      setHeader() {},
      end(this: { writableEnded: boolean }, chunk?: string) {
        this.writableEnded = true
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

    void handler(req, res).catch(reject)
    queueMicrotask(() => {
      if (body !== undefined) req.emit('data', body)
      req.emit('end')
    })
  })
}

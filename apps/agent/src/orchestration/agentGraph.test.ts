import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { RuntimeModelRouter } from '../model/modelRouter.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentDebugTool, AgentRun, AgentRunPolicy, JSONValue, ResolvedToolCatalog } from '../state/types.js'
import { runAgentGraph } from './agentGraph.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'

const policy: AgentRunPolicy = {
  approvalMode: 'interactive',
  maxToolCalls: 20,
  maxIterations: 20,
  allowNetwork: false,
  allowFileBytes: false,
}

const emptyTools: ResolvedToolCatalog = {
  discovered: [],
  available: [],
  blocked: [],
  byName: {},
}

function tool(name: string, risk: AgentDebugTool['risk'] = 'read', requiresApprovalByDefault = false) {
  return {
    name,
    description: `${name} tool.`,
    permission: `tool.${name}`,
    risk,
    source: 'mcp' as const,
    projectScoped: false,
    requiresApprovalByDefault,
  }
}

function resolvedCatalog(registry: StaticToolRegistry): ResolvedToolCatalog {
  const available = registry.list().map((item): AgentDebugTool => ({
    name: item.name,
    description: item.description,
    permission: item.permission,
    risk: item.risk,
    source: item.source ?? 'runtime',
    projectScoped: item.projectScoped,
    approval: item.requiresApprovalByDefault ? 'always' : 'never',
    requiresApproval: item.requiresApprovalByDefault,
    registered: true,
    granted: true,
    available: true,
  }))
  return {
    discovered: available,
    available,
    blocked: [],
    byName: Object.fromEntries(available.map((item) => [item.name, item])),
  }
}

function emptyContext() {
  return {
    route: { pathname: '/' },
    projects: [],
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

test('runAgentGraph pauses again after executing one approved forced call when other approvals remain pending', async () => {
  const run: AgentRun = {
    id: 'run_partial_approval',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    pendingApprovals: [
      {
        id: 'approval_1',
        runId: 'run_partial_approval',
        toolName: 'core_work_start',
        args: { value: 'a' },
        reason: 'Needs approval.',
        status: 'approved',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
        approvedAt: '2026-05-16T00:00:01.000Z',
      },
      {
        id: 'approval_2',
        runId: 'run_partial_approval',
        toolName: 'core_work_start',
        args: { value: 'b' },
        reason: 'Needs approval.',
        status: 'pending',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ],
    metadata: { approvedToolNames: ['core_work_start'] },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'run approved operation',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const registry = new StaticToolRegistry([
    tool('core_work_start', 'generate', true),
  ])
  const capabilities = resolvedCatalog(registry)
  const calls: string[] = []
  const traces: Array<{ kind: string; title: string; data?: unknown }> = []
  let stepArgs: Record<string, unknown> | undefined

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'run approved operation', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        { name: 'core_work_start', mode: 'allow', approval: 'always' },
      ],
    },
    capabilities,
    skills: [],
    context: emptyContext(),
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async (name): Promise<JSONValue> => {
        calls.push(`mcp:${name}`)
        return { ok: true }
      },
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry,
    catalogManager: {
      inspectAgentCatalog: () => ({}),
      updateActiveSkills: () => ({}),
      updatePlan: () => ({}),
      startWork: () => {
        calls.push('core_work_start')
        return {
          status: 'started',
          work: {
            id: 'work_1',
            kind: 'generation_job',
            mode: 'async',
            status: 'waiting',
            request: { value: 'a' },
            result: { status: 'queued', jobId: 123, terminal: false },
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        }
      },
      getWork: () => ({}),
      listWork: () => ({}),
      waitWork: () => ({}),
      cancelWork: () => ({}),
    },
    forcedToolCalls: [{ id: 'call_approval_1', name: 'core_work_start', args: { value: 'a' } }],
    approvedToolNames: ['core_work_start'],
    onTrace: (trace) => traces.push({ kind: trace.kind, title: trace.title, data: trace.data }),
    onStepCreate: (_type, _roundIndex, _roundLabel, _roundSource, _toolName, args) => {
      stepArgs = args
      return 'step_1'
    },
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'requires_action')
  if (result.status === 'requires_action') {
    assert.deepEqual(result.pendingApprovals.map((approval) => approval.id), ['approval_2'])
    assert.deepEqual(result.toolOutcomes.map((outcome) => outcome.call.id), ['call_approval_1'])
  }
  assert.deepEqual(calls, ['core_work_start'])
  assert.deepEqual(stepArgs, { value: 'a' })
  const completedTrace = traces.find((trace) => trace.kind === 'tool_call' && trace.title === 'Tool completed: core_work_start')
  assert.deepEqual((completedTrace?.data as any)?.args, { value: 'a' })
})

test('runAgentGraph queues draft apply approvals in proposal layer order when explicitly requested', async () => {
  const run: AgentRun = {
    id: 'run_default_apply',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '生成 setting 和 asset 草稿并应用',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => ({
      content: null,
      tool_calls: [
        {
          id: 'call_asset',
          type: 'function',
          function: {
            name: 'draft_create',
            arguments: JSON.stringify({
              kind: 'asset_proposal',
              proposal: true,
              projectId: 42,
              content: JSON.stringify({
                schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
                scope: 'asset_proposal',
                proposal: { creative_references: [], asset_slots: [], candidate_plans: [] },
              }),
            }),
          },
        },
        {
          id: 'call_setting',
          type: 'function',
          function: {
            name: 'draft_create',
            arguments: JSON.stringify({
              kind: 'setting_proposal',
              proposal: true,
              projectId: 42,
              content: JSON.stringify({
                schema: DRAFT_CONTENT_SCHEMA_IDS.settingProposal,
                scope: 'setting_proposal',
                proposal: { creative_references: [] },
              }),
            }),
          },
        },
      ],
      finish_reason: 'tool_calls',
      rawAssistantMessage: { role: 'assistant', content: null },
      trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
    }),
  }
  const registry = new StaticToolRegistry([
    {
      name: 'draft_create',
      description: 'Create draft.',
      permission: 'draft.write',
      risk: 'draft',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'draft_apply',
      description: 'Apply draft.',
      permission: 'draft.apply',
      risk: 'write',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: true,
    },
  ])
  const available = registry.list().map((tool): AgentDebugTool => ({
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    risk: tool.risk,
    source: tool.source ?? 'runtime',
    projectScoped: tool.projectScoped,
    registered: true,
    granted: true,
    available: true,
    approval: tool.name === 'draft_apply' ? 'on_write' : 'never',
    requiresApproval: tool.name === 'draft_apply',
  }))
  const capabilities: ResolvedToolCatalog = {
    discovered: available,
    available,
    blocked: [],
    byName: Object.fromEntries(available.map((tool) => [tool.name, tool])),
  }

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: '生成 setting 和 asset 草稿并应用', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        { name: 'draft_create', mode: 'allow', approval: 'never' },
        { name: 'draft_apply', mode: 'allow', approval: 'on_write' },
      ],
    },
    capabilities,
    skills: [],
    context: {
      route: { pathname: '/' },
      project: { id: 42 },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async (name): Promise<JSONValue> => {
        if (name === 'draft_model_get') {
          return {
            data: {
              seed: {
                data: {
                  asset_slots: [],
                  creative_references: [],
                },
              },
            },
          }
        }
        return {}
      },
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry,
    onTrace: () => undefined,
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'requires_action')
  if (result.status === 'requires_action') {
    assert.deepEqual(result.pendingApprovals.map((approval) => approval.toolName), [
      'draft_apply',
      'draft_apply',
    ])
    assert.deepEqual(result.pendingApprovals.map((approval) => approval.args?.draftKind), [
      'setting_proposal',
      'asset_proposal',
    ])
  }
})

test('runAgentGraph uses frozen run input instead of later thread user messages', async () => {
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'frozen request',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const seenUserMessages: string[] = []
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async (input) => {
      const userMessage = [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
      seenUserMessages.push(String(userMessage))
      return {
        content: `seen:${userMessage}`,
        tool_calls: [],
        finish_reason: 'stop',
        rawAssistantMessage: { role: 'assistant', content: `seen:${userMessage}` },
        trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
      }
    },
  }

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'original thread message', createdAt: '2026-05-16T00:00:00.000Z' },
      { id: 'msg_2', threadId: 'thread_1', role: 'user', content: 'later thread message', createdAt: '2026-05-16T00:00:01.000Z' },
    ],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: {
      route: { pathname: '/' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    onTrace: () => undefined,
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.deepEqual(seenUserMessages, ['frozen request'])
  if (result.status === 'completed') assert.equal(result.finalContent, 'seen:frozen request')
})

test('runAgentGraph records explicit model round duration trace', async () => {
  const run: AgentRun = {
    id: 'run_round_duration',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'answer directly',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => ({
      content: 'done',
      tool_calls: [],
      finish_reason: 'stop',
      usage: { input_tokens: 9, output_tokens: 2 },
      rawAssistantMessage: { role: 'assistant', content: 'done' },
      trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
    }),
  }
  const traces: Array<{ title: string; status: string; durationMs?: number; data?: unknown }> = []

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'answer directly', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: emptyContext(),
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    onTrace: (trace) => {
      if (trace.kind === 'model_call') traces.push({ title: trace.title, status: trace.status, durationMs: trace.durationMs, data: trace.data })
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  const started = traces.find((trace) => trace.title === 'Model round started')
  const completed = traces.find((trace) => trace.title === 'Model round completed')
  assert.equal(started?.status, 'started')
  assert.equal(completed?.status, 'completed')
  assert.equal(typeof completed?.durationMs, 'number')
  assert.ok((completed?.durationMs ?? -1) >= 0)
  assert.deepEqual((completed?.data as any)?.usage, { input_tokens: 9, output_tokens: 2 })
})

test('runAgentGraph pauses for retry when the model call fails', async () => {
  const run: AgentRun = {
    id: 'run_model_retry',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'answer directly',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => {
      throw new Error('openai_responses requires a backend auth token')
    },
  }
  const traces: Array<{ kind: string; title: string; status: string; summary?: string }> = []

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'answer directly', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: emptyContext(),
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    onTrace: (trace) => traces.push({ kind: trace.kind, title: trace.title, status: trace.status, summary: trace.summary }),
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'requires_action')
  if (result.status === 'requires_action') {
    assert.equal(result.pendingApprovals.length, 0)
    assert.equal(result.pendingInputRequests?.length, 1)
    assert.equal(result.pendingInputRequests?.[0]?.title, '模型调用需要恢复')
    assert.equal(result.pendingInputRequests?.[0]?.choices[0]?.id, 'retry')
    assert.match(result.pendingInputRequests?.[0]?.summary ?? '', /backend auth token/)
    assert.deepEqual(result.warnings, ['模型调用未完成：openai_responses requires a backend auth token'])
    assert.deepEqual(result.messages, [])
  }
  const recoveryTrace = traces.find((trace) => trace.title === 'Model call recovery required')
  assert.equal(recoveryTrace?.kind, 'input')
  assert.equal(recoveryTrace?.status, 'blocked')
  assert.match(recoveryTrace?.summary ?? '', /backend auth token/)
})

test('runAgentGraph appends active-run runtime input to the next model turn', async () => {
  const run: AgentRun = {
    id: 'run_runtime_input',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    metadata: { consumedRuntimeInputMessageIds: ['msg_consumed'] },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'base request',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const seenUserMessages: string[] = []
  const consumed: string[][] = []
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async (input) => {
      seenUserMessages.push(String([...input.messages].reverse().find((message) => message.role === 'user')?.content ?? ''))
      return {
        content: 'done',
        tool_calls: [],
        finish_reason: 'stop',
        rawAssistantMessage: { role: 'assistant', content: 'done' },
        trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
      }
    },
  }

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'base request', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    getThreadMessages: () => [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: 'base request', createdAt: '2026-05-16T00:00:00.000Z' },
      {
        id: 'msg_consumed',
        threadId: 'thread_1',
        role: 'user',
        content: 'old correction',
        runId: 'run_runtime_input',
        metadata: { kind: 'runtime_input', targetRunId: 'run_runtime_input', status: 'accepted' },
        createdAt: '2026-05-16T00:00:01.000Z',
      },
      {
        id: 'msg_runtime',
        threadId: 'thread_1',
        role: 'user',
        content: '改成图片方案',
        runId: 'run_runtime_input',
        metadata: { kind: 'runtime_input', targetRunId: 'run_runtime_input', status: 'accepted' },
        createdAt: '2026-05-16T00:00:02.000Z',
      },
    ],
    onRuntimeInputConsumed: (messages) => consumed.push(messages.map((message) => message.id)),
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: {
      route: { pathname: '/' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    onTrace: () => undefined,
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.deepEqual(consumed, [['msg_runtime']])
  assert.match(seenUserMessages[0] ?? '', /base request/)
  assert.match(seenUserMessages[0] ?? '', /\[运行中用户补充\]/)
  assert.match(seenUserMessages[0] ?? '', /改成图片方案/)
  assert.doesNotMatch(seenUserMessages[0] ?? '', /old correction/)
})

test('runAgentGraph summarizes catalog skill inspection with active state and tools', async () => {
  const run: AgentRun = {
    id: 'run_catalog_summary',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '检查剧本读取 skill',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  let modelCallCount = 0
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => {
      modelCallCount += 1
      if (modelCallCount === 1) {
        return {
          content: null,
          tool_calls: [{
            id: 'call_inspect_skill',
            type: 'function',
            function: {
              name: 'core_catalog_inspect',
              arguments: JSON.stringify({ view: 'skill', id: 'movscript.workflow.script_reading' }),
            },
          }],
          finish_reason: 'tool_calls',
          rawAssistantMessage: { role: 'assistant', content: null },
          trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
        }
      }
      return {
        content: 'done',
        tool_calls: [],
        finish_reason: 'stop',
        rawAssistantMessage: { role: 'assistant', content: 'done' },
        trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
      }
    },
  }
  const traceSummaries: string[] = []

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: '检查剧本读取 skill', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: {
      route: { pathname: '/' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    catalogManager: {
      inspectAgentCatalog: () => ({
        status: 'ok',
        catalogSnapshot: { id: 'snapshot_1', version: 'catalog_v1' },
        view: 'skill',
        skill: {
          id: 'movscript.workflow.script_reading',
          kind: 'workflow',
          name: 'Script Reading',
          loadMode: 'manual',
          toolRefs: ['tool://movscript_script_locate', 'tool://core_user_input_request'],
        },
        active: true,
        coveredByEnabledPack: true,
      }),
      updateActiveSkills: () => ({}),
      updatePlan: () => ({}),
      startWork: () => ({}),
getWork: () => ({}),
listWork: () => ({}),
waitWork: () => ({}),
      cancelWork: () => ({}),
    },
    onTrace: (trace) => {
      if (trace.kind === 'tool_call' && trace.toolName === 'core_catalog_inspect' && trace.summary) traceSummaries.push(trace.summary)
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.match(traceSummaries.join('\n'), /catalog skill movscript\.workflow\.script_reading/)
  assert.match(traceSummaries.join('\n'), /active=true/)
  assert.match(traceSummaries.join('\n'), /tools=movscript_script_locate, core_user_input_request/)
})

test('runAgentGraph summarizes catalog summary inspection with skill and pack state', async () => {
  const run: AgentRun = {
    id: 'run_catalog_summary_view',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '检查 catalog',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  let modelCallCount = 0
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => {
      modelCallCount += 1
      if (modelCallCount === 1) {
        return {
          content: null,
          tool_calls: [{
            id: 'call_inspect_summary',
            type: 'function',
            function: {
              name: 'core_catalog_inspect',
              arguments: JSON.stringify({ view: 'summary' }),
            },
          }],
          finish_reason: 'tool_calls',
          rawAssistantMessage: { role: 'assistant', content: null },
          trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
        }
      }
      return {
        content: 'done',
        tool_calls: [],
        finish_reason: 'stop',
        rawAssistantMessage: { role: 'assistant', content: 'done' },
        trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
      }
    },
  }
  const traceSummaries: string[] = []

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: '检查 catalog', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: emptyTools,
    skills: [],
    context: {
      route: { pathname: '/' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: DEFAULT_TOOL_REGISTRY,
    catalogManager: {
      inspectAgentCatalog: () => ({
        status: 'ok',
        catalogSnapshot: { id: 'snapshot_1', version: 'catalog_v1' },
        view: 'summary',
        counts: { packs: 2, enabledPacks: 1, skills: 12, tools: 8, knowledge: 0, profiles: 1 },
        enabledPackIds: ['core.pack.default'],
        activeSkillIds: ['core.policy.runtime', 'movscript.workflow.script_reading'],
        availableSkillIds: ['movscript.workflow.script_reading', 'movscript.workflow.asset_proposal'],
      }),
      updateActiveSkills: () => ({}),
      updatePlan: () => ({}),
      startWork: () => ({}),
getWork: () => ({}),
listWork: () => ({}),
waitWork: () => ({}),
      cancelWork: () => ({}),
    },
    onTrace: (trace) => {
      if (trace.kind === 'tool_call' && trace.toolName === 'core_catalog_inspect' && trace.summary) traceSummaries.push(trace.summary)
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.match(traceSummaries.join('\n'), /catalog summary/)
  assert.match(traceSummaries.join('\n'), /active=core\.policy\.runtime, movscript\.workflow\.script_reading/)
  assert.match(traceSummaries.join('\n'), /available=movscript\.workflow\.script_reading, movscript\.workflow\.asset_proposal/)
  assert.match(traceSummaries.join('\n'), /packs=core\.pack\.default/)
  assert.match(traceSummaries.join('\n'), /tools=8, skills=12/)
})

test('runAgentGraph loads script reading skill when model calls project script tool before it is active', async () => {
  const run: AgentRun = {
    id: 'run_script_repair',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    role: 'planner',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '查看总剧本',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-05-16T00:00:00.000Z',
    },
  }
  const updateActiveSkillsTool: AgentDebugTool = {
    name: 'core_skill_update',
    description: 'Update active skills',
    source: 'runtime',
    registered: true,
    granted: true,
    permission: 'agent.skills.manage',
    risk: 'read',
    projectScoped: false,
    approval: 'never',
    available: true,
    requiresApproval: false,
  }
  const readScriptsTool: AgentDebugTool = {
    name: 'movscript_script_locate',
    description: 'Read project scripts',
    source: 'mcp',
    registered: true,
    granted: false,
    permission: 'project.script.read',
    risk: 'read',
    projectScoped: true,
    approval: 'never',
    available: false,
    unavailableReason: 'workflow_scope',
    requiresApproval: false,
  }
  const activeReadScriptsTool: AgentDebugTool = {
    ...readScriptsTool,
    granted: true,
    available: true,
  }
  delete activeReadScriptsTool.unavailableReason
  const coreOnlyCatalog: ResolvedToolCatalog = {
    discovered: [updateActiveSkillsTool, readScriptsTool],
    available: [updateActiveSkillsTool],
    blocked: [readScriptsTool],
    byName: {
      core_skill_update: updateActiveSkillsTool,
      movscript_script_locate: readScriptsTool,
    },
  }
  const manifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'test.core-only',
    version: '0.1.0',
    name: 'Core only',
    tools: [
      { name: 'core_skill_update', mode: 'allow', approval: 'never' },
    ],
  }
  const registry = new StaticToolRegistry([
    {
      name: 'core_skill_update',
      description: 'Update active skills',
      permission: 'agent.skills.manage',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      permission: 'project.script.read',
      risk: 'read',
      source: 'mcp',
      projectScoped: true,
      requiresApprovalByDefault: false,
      requiresSkills: ['movscript.workflow.script_reading'],
    },
  ])
  const updateInputs: unknown[] = []
  const traceSummaries: string[] = []
  const catalogRefreshSummaries: string[] = []
  const catalogRefreshData: unknown[] = []
  let modelCallCount = 0
  const router: RuntimeModelRouter = {
    resolve: () => ({
      capability: 'reasoning',
      provider: 'backend-model-config',
      config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
      source: 'configured',
    }),
    describe: () => [],
    analyzeMultimodal: async () => ({
      summary: '',
      observations: [],
      confidence: 0,
      route: { capability: 'multimodal', configured: true, source: 'configured' },
    }),
    call: async () => {
      modelCallCount += 1
      if (modelCallCount === 1) {
        return {
          content: null,
          tool_calls: [{
            id: 'call_read_scripts',
            type: 'function',
            function: {
              name: 'movscript_script_locate',
              arguments: JSON.stringify({ projectId: 5, scriptTitle: '总剧本', includeContent: true }),
            },
          }],
          finish_reason: 'tool_calls',
          rawAssistantMessage: { role: 'assistant', content: null },
          trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
        }
      }
      return {
        content: 'skill loaded',
        tool_calls: [],
        finish_reason: 'stop',
        rawAssistantMessage: { role: 'assistant', content: 'skill loaded' },
        trace: { request: { url: '', method: 'POST', headers: {}, body: {} }, latencyMs: 1 } as any,
      }
    },
  }

  const result = await runAgentGraph({
    run,
    threadMessages: [
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: '查看总剧本', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest,
    capabilities: coreOnlyCatalog,
    skills: [],
    context: {
      route: { pathname: '/' },
      project: { id: 5, name: '好运甜妻' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    memories: [],
    warnings: [],
    userMessage: run.input?.userMessage,
    rootUserMessageId: run.input?.sourceMessageId,
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    modelRouter: router,
    auth: {},
    policy,
    mcpClient: {
      initialize: async () => null,
      callTool: async () => ({}),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry,
    catalogManager: {
      inspectAgentCatalog: () => ({}),
      updateActiveSkills: (_run, input) => {
        updateInputs.push(input)
        return {
          status: 'updated',
          eventType: 'skill.state_requested',
          loadedSkillIds: ['movscript.workflow.script_reading'],
          unloadedSkillIds: [],
          activeSkillIds: ['movscript.workflow.script_reading'],
        }
      },
      updatePlan: () => ({}),
      startWork: () => ({}),
getWork: () => ({}),
listWork: () => ({}),
waitWork: () => ({}),
      cancelWork: () => ({}),
    },
    onCatalogRefresh: async () => ({
      manifest: {
        ...manifest,
        tools: [
          ...manifest.tools,
          { name: 'movscript_script_locate', mode: 'allow', approval: 'never' },
        ],
      },
      capabilities: {
        discovered: [updateActiveSkillsTool, activeReadScriptsTool],
        available: [updateActiveSkillsTool, activeReadScriptsTool],
        blocked: [],
        byName: {
          core_skill_update: updateActiveSkillsTool,
          movscript_script_locate: activeReadScriptsTool,
        },
      },
      skills: [{
        id: 'movscript.workflow.script_reading',
        name: 'Script Reading',
        description: 'Read project scripts',
        enabled: true,
        instruction: '',
        resolvedPriority: 100,
        activationReason: 'default',
        compiledInstruction: '',
        warnings: [],
      }],
      registry,
      warnings: [],
    }),
    onTrace: (trace) => {
      if (trace.kind === 'tool_call' && trace.toolName === 'core_skill_update' && trace.summary) traceSummaries.push(trace.summary)
      if (trace.kind === 'tool_catalog' && trace.title === 'Agent catalog refreshed') {
        if (trace.summary) catalogRefreshSummaries.push(trace.summary)
        catalogRefreshData.push(trace.data)
      }
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.deepEqual(updateInputs, [{
    load: ['movscript.workflow.script_reading'],
    reason: '工具 movscript_script_locate 需要加载 movscript.workflow.script_reading。',
  }])
  assert.match(traceSummaries.join('\n'), /loaded=movscript\.workflow\.script_reading/)
  assert.match(catalogRefreshSummaries.join('\n'), /manifest=test\.core-only/)
  assert.match(catalogRefreshSummaries.join('\n'), /movscript_script_locate=available\/granted/)
  assert.equal((catalogRefreshData[0] as any)?.manifest?.tools?.some((grant: any) => grant.name === 'movscript_script_locate'), true)
  assert.equal((catalogRefreshData[0] as any)?.capabilitySnapshot?.keyTools?.some((tool: any) => tool.name === 'movscript_script_locate' && tool.available === true && tool.granted === true), true)
  if (result.status === 'completed') assert.equal(result.finalContent, 'skill loaded')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { RuntimeModelRouter } from '../model/modelRouter.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentDebugTool, AgentRun, AgentRunPolicy, ResolvedToolCatalog } from '../state/types.js'
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

test('runAgentGraph queues default draft apply approvals in proposal layer order', async () => {
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
      userMessage: '生成 setting 和 asset 草稿',
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
            name: 'movscript_create_draft',
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
            name: 'movscript_create_draft',
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
      name: 'movscript_create_draft',
      description: 'Create draft.',
      permission: 'draft.write',
      risk: 'draft',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'movscript_apply_draft',
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
    approval: tool.name === 'movscript_apply_draft' ? 'on_write' : 'never',
    requiresApproval: tool.name === 'movscript_apply_draft',
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
      { id: 'msg_1', threadId: 'thread_1', role: 'user', content: '生成 setting 和 asset 草稿', createdAt: '2026-05-16T00:00:00.000Z' },
    ],
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
        { name: 'movscript_apply_draft', mode: 'allow', approval: 'on_write' },
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
      callTool: async () => ({}),
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
      'movscript_apply_draft',
      'movscript_apply_draft',
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
              name: 'movscript_inspect_agent_catalog',
              arguments: JSON.stringify({ view: 'skill', id: 'movscript.workflow.script-reading' }),
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
          id: 'movscript.workflow.script-reading',
          kind: 'workflow',
          name: 'Script Reading',
          loadMode: 'manual',
          toolRefs: ['tool://movscript_read_project_scripts', 'tool://movscript_request_user_input'],
        },
        active: true,
        coveredByEnabledPack: true,
      }),
      updateActiveSkills: () => ({}),
      createAgentPlan: () => ({}),
      getAgentPlan: () => ({}),
      replanAgentPlan: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      cancelSubagent: () => ({}),
    },
    onTrace: (trace) => {
      if (trace.kind === 'tool_call' && trace.toolName === 'movscript_inspect_agent_catalog' && trace.summary) traceSummaries.push(trace.summary)
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.match(traceSummaries.join('\n'), /catalog skill movscript\.workflow\.script-reading/)
  assert.match(traceSummaries.join('\n'), /active=true/)
  assert.match(traceSummaries.join('\n'), /tools=movscript_read_project_scripts, movscript_request_user_input/)
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
              name: 'movscript_inspect_agent_catalog',
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
        enabledPackIds: ['movscript.pack.default'],
        activeSkillIds: ['movscript.policy.agent-core', 'movscript.workflow.script-reading'],
        availableSkillIds: ['movscript.workflow.script-reading', 'movscript.workflow.asset-proposal'],
      }),
      updateActiveSkills: () => ({}),
      createAgentPlan: () => ({}),
      getAgentPlan: () => ({}),
      replanAgentPlan: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      cancelSubagent: () => ({}),
    },
    onTrace: (trace) => {
      if (trace.kind === 'tool_call' && trace.toolName === 'movscript_inspect_agent_catalog' && trace.summary) traceSummaries.push(trace.summary)
    },
    onStepCreate: () => 'step_1',
    onStepComplete: () => undefined,
  })

  assert.equal(result.status, 'completed')
  assert.match(traceSummaries.join('\n'), /catalog summary/)
  assert.match(traceSummaries.join('\n'), /active=movscript\.policy\.agent-core, movscript\.workflow\.script-reading/)
  assert.match(traceSummaries.join('\n'), /available=movscript\.workflow\.script-reading, movscript\.workflow\.asset-proposal/)
  assert.match(traceSummaries.join('\n'), /packs=movscript\.pack\.default/)
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
    name: 'movscript_update_active_skills',
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
    name: 'movscript_read_project_scripts',
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
      movscript_update_active_skills: updateActiveSkillsTool,
      movscript_read_project_scripts: readScriptsTool,
    },
  }
  const manifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'test.core-only',
    version: '0.1.0',
    name: 'Core only',
    tools: [
      { name: 'movscript_update_active_skills', mode: 'allow', approval: 'never' },
    ],
  }
  const registry = new StaticToolRegistry([
    {
      name: 'movscript_update_active_skills',
      description: 'Update active skills',
      permission: 'agent.skills.manage',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'movscript_read_project_scripts',
      description: 'Read project scripts',
      permission: 'project.script.read',
      risk: 'read',
      source: 'mcp',
      projectScoped: true,
      requiresApprovalByDefault: false,
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
              name: 'movscript_read_project_scripts',
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
          loadedSkillIds: ['movscript.workflow.script-reading'],
          unloadedSkillIds: [],
          activeSkillIds: ['movscript.workflow.script-reading'],
        }
      },
      createAgentPlan: () => ({}),
      getAgentPlan: () => ({}),
      replanAgentPlan: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      cancelSubagent: () => ({}),
    },
    onCatalogRefresh: async () => ({
      manifest: {
        ...manifest,
        tools: [
          ...manifest.tools,
          { name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' },
        ],
      },
      capabilities: {
        discovered: [updateActiveSkillsTool, activeReadScriptsTool],
        available: [updateActiveSkillsTool, activeReadScriptsTool],
        blocked: [],
        byName: {
          movscript_update_active_skills: updateActiveSkillsTool,
          movscript_read_project_scripts: activeReadScriptsTool,
        },
      },
      skills: [{
        id: 'movscript.workflow.script-reading',
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
      if (trace.kind === 'tool_call' && trace.toolName === 'movscript_update_active_skills' && trace.summary) traceSummaries.push(trace.summary)
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
    load: ['movscript.workflow.script-reading'],
    reason: '读取项目剧本需要加载剧本读取 workflow。',
  }])
  assert.match(traceSummaries.join('\n'), /loaded=movscript\.workflow\.script-reading/)
  assert.match(catalogRefreshSummaries.join('\n'), /manifest=test\.core-only/)
  assert.match(catalogRefreshSummaries.join('\n'), /movscript_read_project_scripts=available\/granted/)
  assert.equal((catalogRefreshData[0] as any)?.manifest?.tools?.some((grant: any) => grant.name === 'movscript_read_project_scripts'), true)
  assert.equal((catalogRefreshData[0] as any)?.capabilitySnapshot?.keyTools?.some((tool: any) => tool.name === 'movscript_read_project_scripts' && tool.available === true && tool.granted === true), true)
  if (result.status === 'completed') assert.equal(result.finalContent, 'skill loaded')
})

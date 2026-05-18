import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { RuntimeModelRouter } from '../model/modelRouter.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentDebugTool, AgentRun, AgentRunPolicy, ResolvedToolCatalog } from '../state/types.js'
import { runAgentGraph } from './agentGraph.js'

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

test('runAgentGraph loads script reading skill when model calls project script tool before it is active', async () => {
  const run: AgentRun = {
    id: 'run_script_repair',
    threadId: 'thread_1',
    status: 'queued',
    policy,
    role: 'chat',
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
      reloadAgentCatalog: () => ({}),
      createAgentPlan: () => ({}),
      getAgentPlan: () => ({}),
      replanAgentPlan: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      cancelSubagent: () => ({}),
    },
    onCatalogRefresh: async () => ({
      manifest,
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
  if (result.status === 'completed') assert.equal(result.finalContent, 'skill loaded')
})

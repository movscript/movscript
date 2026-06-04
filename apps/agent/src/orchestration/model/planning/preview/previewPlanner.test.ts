import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../../../../contracts/runtime/runtimeContract.js'
import { planPreviewToolRequests } from './previewPlanner.js'

const registry = new StaticToolRegistry([
  {
    name: 'movscript_project_create',
    description: 'Create a project.',
    permission: 'project.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
])

test('planPreviewToolRequests predicts approval-gated write calls without workspace apply metadata', async () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [{ name: 'movscript_project_create', mode: 'allow' as const, approval: 'always' as const }],
  }

  const result = await planPreviewToolRequests({
    manifest,
    skills: [],
    context: {
      route: { pathname: '/project/42' },
      projects: [],
      project: { id: 42, name: 'Demo' },
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: {
      discovered: [],
      blocked: [],
      byName: {},
      available: [{
        name: 'movscript_project_create',
        source: 'runtime',
        registered: true,
        granted: true,
        permission: 'project.write',
        risk: 'write',
        projectScoped: true,
        approval: 'always',
        available: true,
        requiresApproval: true,
      }],
    },
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    warnings: [],
    history: [],
    userMessage: '创建项目',
    command: {
      name: 'chat',
      payload: '创建项目',
      contextMode: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
    currentProjectId: 42,
    registry,
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    makeApprovalId: () => 'approval_1',
    now: () => '2026-05-06T00:00:00.000Z',
    modelConfig: {
      provider: 'backend-model-config',
      modelConfigId: 1,
      model: 'model_config:1',
      useForChat: true,
      useForPlanner: true,
      updatedAt: '2026-05-06T00:00:00.000Z',
    },
    callModel: async () => ({
      content: null,
      finish_reason: 'tool_calls',
      tool_calls: [{
        id: 'call_1',
          type: 'function',
          function: {
          name: 'movscript_project_create',
          arguments: JSON.stringify({ name: '雨夜便利店' }),
        },
      }],
      rawAssistantMessage: {
        role: 'assistant',
        content: [],
      },
      trace: {
        request: {
          url: 'http://localhost',
          method: 'POST',
          headers: {},
          body: { model: 'model_config:1', messages: [] },
        },
        latencyMs: 1,
      },
    }),
  })

  assert.equal(result.toolCalls.length, 0)
  assert.equal(result.pendingApprovals.length, 1)
  assert.equal(result.pendingApprovals[0].id, 'approval_1')
  assert.equal(result.pendingApprovals[0].toolName, 'movscript_project_create')
  assert.equal(result.pendingApprovals[0].risk, 'write')
  assert.equal(result.pendingApprovals[0].preview, undefined)
})

test('planPreviewToolRequests returns an empty taskGraph without a model config', async () => {
  const result = await planPreviewToolRequests({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    warnings: [],
    history: [],
    userMessage: 'preview',
    command: {
      name: 'chat',
      payload: 'preview',
      contextMode: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
    registry,    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    makeApprovalId: () => 'approval_1',
    now: () => '2026-05-06T00:00:00.000Z',
    modelConfig: null,
  })

  assert.deepEqual(result, { toolCalls: [], pendingApprovals: [] })
})

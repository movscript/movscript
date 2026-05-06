import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { InMemoryAgentDraftStore } from '../store/draftStore.js'
import { DEFAULT_TOOL_REGISTRY } from '../tools/toolRegistry.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import { planPreviewToolRequests } from './previewPlanner.js'

test('planPreviewToolRequests predicts approval-gated draft apply calls with preview metadata', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'content_unit',
    title: 'Description update',
    content: 'New description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    permissions: ['project.write'],
    tools: [{ name: 'movscript_apply_draft', mode: 'allow' as const, approval: 'always' as const }],
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
        name: 'movscript_apply_draft',
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
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: `应用草稿 ${draft.id}`,
    command: {
      name: 'chat',
      payload: `应用草稿 ${draft.id}`,
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
    currentProjectId: 42,
    registry: DEFAULT_TOOL_REGISTRY,
    draftStore,
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
          name: 'movscript_apply_draft',
          arguments: JSON.stringify({ draftId: draft.id }),
        },
      }],
      rawAssistantMessage: {
        role: 'assistant',
        content: null,
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
  assert.equal(result.pendingApprovals[0].toolName, 'movscript_apply_draft')
  assert.equal(result.pendingApprovals[0].risk, 'write')
  assert.equal((result.pendingApprovals[0].preview as any)?.review?.target?.entityType, 'content_unit')
  assert.equal((result.pendingApprovals[0].preview as any)?.review?.requiresBackendApply, true)
})

test('planPreviewToolRequests returns an empty plan without a model config', async () => {
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
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: 'preview',
    command: {
      name: 'chat',
      payload: 'preview',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
    registry: DEFAULT_TOOL_REGISTRY,
    draftStore: new InMemoryAgentDraftStore(),
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    makeApprovalId: () => 'approval_1',
    now: () => '2026-05-06T00:00:00.000Z',
    modelConfig: null,
  })

  assert.deepEqual(result, { toolCalls: [], pendingApprovals: [] })
})

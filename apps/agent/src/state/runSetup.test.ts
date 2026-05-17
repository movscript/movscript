import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import { buildRunSetupMetadata } from './runSetup.js'

test('buildRunSetupMetadata assembles debug context and run metadata', () => {
  const result = buildRunSetupMetadata({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      agentManifest: DEFAULT_AGENT_MANIFEST,
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      metadata: { initialUserMessageId: 'msg_1' },
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
      steps: [],
    },
    agentManifest: DEFAULT_AGENT_MANIFEST,
    skills: [{
      id: 'movscript.policy.agent-core',
      name: 'Agent Core',
      description: 'Core policy',
      version: '1.0.0',
      category: 'policy',
      enabled: true,
      priority: 920,
      instruction: 'raw core instruction',
      compiledInstruction: 'compiled core instruction',
      activationReason: 'profile',
      resolvedPriority: 920,
      warnings: [],
    }],
    capabilities: {
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      mcp: { connected: true, resources: [], tools: [] },
      registry: [],
      resolvedTools: {
        discovered: [],
        available: [{
          name: 'movscript_search_memories',
          description: 'Search memories',
          source: 'runtime',
          registered: true,
          granted: true,
          permission: 'read',
          approval: 'never',
          available: true,
          requiresApproval: false,
        }],
        blocked: [],
        byName: {},
      },
      warnings: [],
    },
    contextResult: {
      snapshot: {
        route: { pathname: '/production/4' },
        project: { id: 42, name: 'Demo' },
        productionId: 4,
      },
    },
    context: {
      currentProjectId: 42,
      currentProductionId: 4,
    },
    memories: [],
    command: {
      name: 'chat',
      payload: 'hello',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
    authMetadata: { backendAuthToken: 'token_1' },
    catalogSnapshot: { id: 'catalog_1', version: '2026.05.15' },
    limits: { maxActiveWorkflows: 2, maxKnowledgeCharsPerRun: 8000, maxKnowledgeChunksPerRun: 3 },
  })

  assert.equal(result.debugContext.project?.id, 42)
  assert.equal(result.debugContext.productionId, 4)
  assert.equal(result.metadata.initialUserMessageId, 'msg_1')
  assert.equal(result.metadata.backendAuthToken, 'token_1')
  assert.equal((result.metadata.command as any)?.name, 'chat')
  assert.equal((result.metadata.debugTrace as any)?.manifestId, DEFAULT_AGENT_MANIFEST.id)
  assert.equal((result.metadata.skills as any[])?.[0]?.id, 'movscript.policy.agent-core')
  assert.equal((result.metadata.skills as any[])?.[0]?.instruction, 'compiled core instruction')
  assert.deepEqual(result.metadata.activeSkillIds, ['movscript.policy.agent-core'])
  assert.deepEqual(result.metadata.visibleToolNames, ['movscript_search_memories'])
  assert.deepEqual(result.metadata.limits, { maxActiveWorkflows: 2, maxKnowledgeCharsPerRun: 8000, maxKnowledgeChunksPerRun: 3 })
  assert.equal((result.metadata.catalogSnapshot as any)?.id, 'catalog_1')
  assert.equal((result.metadata.catalogSnapshot as any)?.version, '2026.05.15')
  assert.equal((result.metadata.contextLedger as any)?.schema, 'movscript.context-ledger.v1')
  assert.equal((result.metadata.contextLedger as any)?.runId, 'run_1')
  assert.equal((result.metadata.contextLedger as any)?.threadId, 'thread_1')
  assert.equal((result.metadata.contextLedger as any)?.catalogSnapshotId, 'catalog_1')
  assert.equal((result.metadata.contextLedger as any)?.catalogSnapshotVersion, '2026.05.15')
  assert.deepEqual((result.metadata.contextLedger as any)?.activeSkillIds, ['movscript.policy.agent-core'])
  assert.deepEqual((result.metadata.contextLedger as any)?.visibleToolNames, ['movscript_search_memories'])
  assert.deepEqual((result.metadata.contextLedger as any)?.retrieved, [])
})

test('buildRunSetupMetadata ignores invalid production ids', () => {
  const result = buildRunSetupMetadata({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
      steps: [],
    },
    agentManifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    capabilities: {
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      mcp: { connected: true, resources: [], tools: [] },
      registry: [],
      resolvedTools: { discovered: [], available: [], blocked: [], byName: {} },
      warnings: [],
    },
    contextResult: {
      snapshot: {
        project: { id: 42, name: 'Demo' },
        productionId: 4.5,
      },
    },
    context: {
      currentProjectId: 42,
      currentProductionId: 4.5,
    },
    memories: [],
    command: {
      name: 'chat',
      payload: 'hello',
      contextProfile: 'minimal',
      outputMode: 'natural',
      requiredTools: [],
      systemContract: 'Chat.',
    },
  })

  assert.equal(result.debugContext.productionId, undefined)
  assert.equal((result.metadata.context as any)?.productionId, undefined)
})

test('buildRunSetupMetadata stores independent input metadata snapshots', () => {
  const runMetadata = { nested: { value: 'original' } }
  const authMetadata = { auth: { tokenRef: 'token_1' } }
  const limits = { maxActiveWorkflows: 2, maxKnowledgeCharsPerRun: 8000, maxKnowledgeChunksPerRun: 3 }
  const command: AgentCommandRuntime = {
    name: 'chat',
    payload: 'hello',
    contextProfile: 'minimal',
    outputMode: 'natural',
    requiredTools: ['movscript_search_memories'],
    systemContract: 'Chat.',
  }

  const result = buildRunSetupMetadata({
    run: {
      id: 'run_1',
      threadId: 'thread_1',
      status: 'in_progress',
      agentManifest: DEFAULT_AGENT_MANIFEST,
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 20,
        maxIterations: 20,
        allowNetwork: false,
        allowFileBytes: false,
      },
      metadata: runMetadata,
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
      steps: [],
    },
    agentManifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    capabilities: {
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      mcp: { connected: true, resources: [], tools: [] },
      registry: [],
      resolvedTools: {
        discovered: [],
        available: [],
        blocked: [],
        byName: {},
      },
      warnings: [],
    },
    contextResult: {},
    context: {},
    memories: [],
    command,
    authMetadata,
    catalogSnapshot: { id: 'catalog_1' },
    limits,
  })

  runMetadata.nested.value = 'changed'
  authMetadata.auth.tokenRef = 'changed'
  limits.maxActiveWorkflows = 99
  command.requiredTools[0] = 'changed'

  assert.deepEqual(result.metadata.nested, { value: 'original' })
  assert.deepEqual(result.metadata.auth, { tokenRef: 'token_1' })
  assert.deepEqual(result.metadata.limits, {
    maxActiveWorkflows: 2,
    maxKnowledgeCharsPerRun: 8000,
    maxKnowledgeChunksPerRun: 3,
  })
  assert.deepEqual((result.metadata.command as any).requiredTools, ['movscript_search_memories'])
})

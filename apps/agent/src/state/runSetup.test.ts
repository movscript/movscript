import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
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
  })

  assert.equal(result.debugContext.project?.id, 42)
  assert.equal(result.debugContext.productionId, 4)
  assert.equal(result.metadata.initialUserMessageId, 'msg_1')
  assert.equal(result.metadata.backendAuthToken, 'token_1')
  assert.equal((result.metadata.command as any)?.name, 'chat')
  assert.equal((result.metadata.debugTrace as any)?.manifestId, DEFAULT_AGENT_MANIFEST.id)
})

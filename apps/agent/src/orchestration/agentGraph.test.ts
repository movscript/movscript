import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { RuntimeModelRouter } from '../model/modelRouter.js'
import { DEFAULT_TOOL_REGISTRY } from '../tools/toolRegistry.js'
import type { AgentRun, AgentRunPolicy, ResolvedToolCatalog } from '../state/types.js'
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

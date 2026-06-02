import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import { buildModelToolResultContext } from '../../../../context/tool-result/toolResultContext.js'
import { InMemoryAgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultRuntimeToolHandlerRegistry,
  createDefaultVideoFrameExtractionPort,
} from '../../../../application/shared/tools/runtimeToolHandlers.js'
import { createRuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import { InMemoryAgentToolResultStore, buildAgentToolResultRecord } from '../../../../state/store/tool-results/toolResultStore.js'
import type { AgentDebugTool, AgentRun, AgentRuntimeLimits, JSONValue, ResolvedToolCatalog } from '../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { executeToolTurn } from './agentGraphToolTurn.js'
import type { AgentGraphInput } from '../../../graph/types/agentGraphTypes.js'

const runtimeLimits: AgentRuntimeLimits = {
  approvalMode: 'interactive',
  maxToolCalls: 20,
  maxIterations: 20,
  allowNetwork: false,
  allowFileBytes: false,
}

test('executeToolTurn reuses stored dropped tool result projection for stable retry/resume prompts', async () => {
  const call = { id: 'call_large_1', name: 'studio_large_tool', args: { projectId: 42 } }
  const result = {
    projectId: 42,
    body: '雨夜便利店。'.repeat(500),
  }
  const smallBudgetRun = buildRun({ maxRetrievedContextChars: 1000 })
  const storedContext = buildModelToolResultContext({
    run: smallBudgetRun,
    call,
    result,
  })
  assert.equal(storedContext.dropped, true)
  assert.ok(storedContext.resultRef)

  const toolResultStore = new InMemoryAgentToolResultStore()
  toolResultStore.upsertToolResult(buildAgentToolResultRecord({
    runId: smallBudgetRun.id,
    threadId: smallBudgetRun.threadId,
    call,
    result,
    modelContext: storedContext,
    resultRef: storedContext.resultRef,
    now: '2026-01-01T00:00:00.000Z',
  }))

  const input = buildGraphInput({
    run: buildRun({ maxRetrievedContextChars: 24000 }),
    toolResultStore,
    result,
  })
  const turn = await executeToolTurn(input, {
    call,
    roundIndex: 1,
    roundLabel: 'Model turn 1',
    roundSource: 'model',
  })

  assert.equal(turn.turnResult.content, storedContext.content)
  assert.equal(turn.turnResult.content.length <= 1000, true)
  assert.doesNotMatch(turn.turnResult.content, /雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。/)
  assert.equal(toolResultStore.listToolResults({ runId: smallBudgetRun.id }).length, 1)
  assert.equal(input.traces.some((trace) => (trace.data as any)?.eventType === 'context.item_dropped'), true)
})

test('executeToolTurn reuses completed side-effect tool results after runtime recovery resume', async () => {
  const call = { id: 'call_write_1', name: 'studio_write_tool', args: { projectId: 42, title: '雨夜便利店' } }
  const result = { ok: true, workspaceId: 'workspace_1' }
  const run = buildRun({
    maxRetrievedContextChars: 24000,
    metadata: {
      recovery: {
        schema: 'movscript.agent.recovery.v1',
        state: 'resumed',
        resumedAt: '2026-01-01T00:01:00.000Z',
      },
    },
    steps: [{
      id: 'step_original_write',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: call.name,
      args: call.args,
      result,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:05.000Z',
    }],
  })
  const completedSteps: Array<{ stepId: string; result?: JSONValue }> = []
  const input = buildGraphInput({
    run,
    toolResultStore: new InMemoryAgentToolResultStore(),
    result: { shouldNotExecute: true },
    toolName: call.name,
    risk: 'write',
    onStepComplete: (stepId, stepResult) => completedSteps.push({ stepId, result: stepResult }),
  })

  const turn = await executeToolTurn(input, {
    call,
    roundIndex: 2,
    roundLabel: 'Recovered model turn',
    roundSource: 'model',
  })

  assert.deepEqual(turn.outcome.result, result)
  assert.deepEqual(completedSteps, [{ stepId: 'step_1', result }])
  assert.equal(input.executedRuntimeHandlerCount, 0)
  assert.equal(input.traces.some((trace) => (trace.data as any)?.replayGuard?.eventType === 'tool.call.replay_guard_reused'), true)
  assert.match(turn.turnResult.content, /workspace_1/)
})

function buildRun(input: {
  maxRetrievedContextChars: number
  metadata?: AgentRun['metadata']
  steps?: AgentRun['steps']
}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits,
    metadata: { ...(input.metadata ?? {}), limits: { maxRetrievedContextChars: input.maxRetrievedContextChars } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: input.steps ?? [],
  }
}

function buildGraphInput(input: {
  run: AgentRun
  toolResultStore: InMemoryAgentToolResultStore
  result: JSONValue
  toolName?: string
  risk?: 'read' | 'write'
  onStepComplete?: (stepId: string, result?: JSONValue) => void
}): AgentGraphInput & { traces: Array<{ data?: unknown }>; executedRuntimeHandlerCount: number } {
  const toolName = input.toolName ?? 'studio_large_tool'
  const risk = input.risk ?? 'read'
  let executedRuntimeHandlerCount = 0
  const registry = new StaticToolRegistry([{
    name: toolName,
    description: 'Returns a large result.',
    permission: risk === 'read' ? 'studio.read' : 'studio.write',
    risk,
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  }])
  const tool: AgentDebugTool = {
    name: toolName,
    description: 'Returns a large result.',
    permission: risk === 'read' ? 'studio.read' : 'studio.write',
    risk,
    source: 'runtime',
    projectScoped: false,
    approval: 'never',
    requiresApproval: false,
    registered: true,
    granted: true,
    available: true,
  }
  const capabilities: ResolvedToolCatalog = {
    discovered: [tool],
    available: [tool],
    blocked: [],
    byName: { [toolName]: tool },
  }
  const traces: Array<{ data?: unknown }> = []
  const workspaceApplyBackend = {
    async applyReview(): Promise<any> { return { performed: false } },
    async previewApplyReview(): Promise<any> { return { performed: false } },
  }
  return {
    traces,
    run: input.run,
    threadMessages: [],
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: toolName, mode: 'allow', approval: 'never' }],
    },
    capabilities,
    skills: [],
    context: { route: { pathname: '/' }, projects: [], recentResources: [], attachments: [], memories: [], labels: [] },
    memories: [],
    warnings: [],
    config: { provider: 'backend-model-config', model: 'test-model', modelConfigId: 1 } as any,
    auth: {},
    runtimeLimits,
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort({
      initialize: async () => null,
      callTool: async () => {
        throw new Error('external gateway should not run')
      },
    }),
    workspaceApplyPort: createDefaultWorkspaceApplyPort(workspaceApplyBackend),
    workspaceApplyPreviewPort: createDefaultWorkspaceApplyPreviewPort(workspaceApplyBackend),
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort({ initialize: async () => null, callTool: async () => null }),
    resourceFilePort: createDefaultResourceFilePort({ initialize: async () => null }),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false }) }),
    projectStandardsPort: createDefaultProjectStandardsPort({ async getProject(): Promise<any> { return { performed: false } } }),
    registry,
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: [toolName],
      execute: () => {
        executedRuntimeHandlerCount += 1
        return { result: input.result }
      },
    }]),
    catalogManager: undefined,
    toolResultStore: input.toolResultStore,
    onTrace: (trace) => traces.push(trace),
    onStepCreate: () => 'step_1',
    onStepComplete: (stepId, result) => input.onStepComplete?.(stepId, result),
    get executedRuntimeHandlerCount() {
      return executedRuntimeHandlerCount
    },
  }
}

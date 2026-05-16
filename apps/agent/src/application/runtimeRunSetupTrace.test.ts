import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRun,
  ResolvedAgentSkill,
} from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'
import {
  recordRuntimeRunSetupTraces,
  type RuntimeRunSetupTraceInput,
} from './runtimeRunSetupTrace.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }

test('recordRuntimeRunSetupTraces emits context, manifest, skill, tool catalog, and run context traces', () => {
  const run = makeRun()
  const traces: RuntimeRunSetupTraceInput[] = []

  recordRuntimeRunSetupTraces({
    run,
    setupRound,
    debugContext: debugContext(),
    contextDurationMs: 25,
    contextStartedAt: 1000,
    contextCompletedAt: 1025,
    focusTimings: { totalMs: 25 },
    agentManifest: DEFAULT_AGENT_MANIFEST,
    activeManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
    },
    toolRegistry: new StaticToolRegistry([{
      name: 'tool_a',
      description: 'Tool A',
      permission: 'tool.a',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    skills: [skill()],
    capabilities: capabilities(),
    capabilityStartedAt: 1100,
    capabilityDurationMs: 12,
    memories: [memory()],
    catalogSnapshotId: 'snapshot_1',
    catalogSnapshotVersion: 'catalog_v1',
    pluginWarningCount: 1,
    contextWarningCount: 0,
    now: () => '2026-01-01T00:00:01.112Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.deepEqual(traces.map((trace) => trace.title), [
    'Runtime context resolved',
    'Agent manifest resolved',
    'Skills activated',
    'Tool catalog resolved',
    'Run context built',
  ])
  assert.equal(traces[0]?.summary, 'Project #42 Project (25ms)')
  assert.deepEqual((traces[1]?.data as any)?.permissions, ['tool.a'])
  assert.deepEqual((traces[2]?.data as any)?.skills.map((item: any) => item.id), ['skill_1'])
  assert.deepEqual((traces[3]?.data as any)?.availableToolNames, ['tool_a'])
  assert.equal((traces[4]?.data as any)?.memoryRefCount, 1)
  assert.equal((traces[4]?.data as any)?.warningCount, 1)
})

test('recordRuntimeRunSetupTraces marks fallback context as blocked and includes layered trace metadata', () => {
  const run = makeRun()
  const traces: RuntimeRunSetupTraceInput[] = []

  recordRuntimeRunSetupTraces({
    run,
    setupRound,
    debugContext: { ...debugContext(), project: undefined },
    contextError: 'mcp offline',
    contextDurationMs: 30,
    contextStartedAt: 1000,
    contextCompletedAt: 1030,
    agentManifest: DEFAULT_AGENT_MANIFEST,
    activeManifest: DEFAULT_AGENT_MANIFEST,
    layers: {
      manifest: DEFAULT_AGENT_MANIFEST,
      ctx: {
        profile: {
          schema: 'movscript.agent.profile.v1',
          id: 'profile_1',
          version: '1.0.0',
          name: 'Profile',
          enabledPacks: [],
          persona: null,
          enabledWorkflows: [],
          enabledPolicies: [],
          toolGrants: [],
        },
        message: 'hello',
        intents: [],
        uiContext: {},
        conversation: { turnCount: 0, lastToolCalls: [], recentErrors: [] },
        catalogVersion: 'catalog_v1',
      },
      skills: [],
      skillDiscovery: { profileId: 'profile_1', enabledPackIds: [], availableSkills: [] },
      warnings: ['layer warning'],
      trace: {
        profileId: 'profile_1',
        profileVersion: '1.0.0',
        profileLayers: [{ source: 'default', id: 'profile_1', version: '1.0.0' }],
        policyIds: ['policy_1'],
        workflowIds: ['workflow_1'],
        intentSignals: [],
        workflowTriggers: [],
      },
    },
    toolRegistry: new StaticToolRegistry([]),
    skills: [],
    capabilities: capabilities({ warnings: ['cap warning'] }),
    capabilityStartedAt: 1100,
    capabilityDurationMs: 0,
    memories: [],
    catalogSnapshotId: 'snapshot_1',
    catalogSnapshotVersion: null,
    pluginWarningCount: 2,
    contextWarningCount: 1,
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(traces[0]?.status, 'blocked')
  assert.equal((traces[0]?.data as any)?.fallback, true)
  assert.equal((traces[1]?.data as any)?.id, 'profile_1')
  assert.deepEqual((traces[1]?.data as any)?.workflowIds, ['workflow_1'])
  assert.equal((traces[4]?.data as any)?.profileId, 'profile_1')
  assert.equal((traces[4]?.data as any)?.warningCount, 5)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function debugContext(): AgentDebugContextPanel {
  return {
    route: { pathname: '/agent' },
    projects: [],
    project: { id: 42, name: 'Project' },
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function skill(): ResolvedAgentSkill {
  return {
    id: 'skill_1',
    name: 'Skill',
    description: 'Skill',
    enabled: true,
    instruction: 'Do work.',
    resolvedPriority: 1,
    activationReason: 'profile',
    compiledInstruction: 'Do work.',
    warnings: [],
  }
}

function capabilities(overrides: Partial<AgentCapabilitiesResponse> = {}): AgentCapabilitiesResponse {
  return {
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    mcp: { connected: true, resources: [], tools: [] },
    registry: [],
    resolvedTools: {
      discovered: [],
      available: [{
        name: 'tool_a',
        source: 'runtime',
        registered: true,
        granted: true,
        available: true,
        approval: 'never',
        requiresApproval: false,
      }],
      blocked: [],
      byName: {},
    },
    warnings: [],
    ...overrides,
  }
}

function memory(): AgentMemory {
  return {
    id: 'mem_1',
    projectId: 42,
    title: 'Memory',
    kind: 'fact',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

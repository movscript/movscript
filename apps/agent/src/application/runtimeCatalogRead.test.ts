import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentProfile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from '../catalog/types.js'
import type { AgentRun } from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { RuntimeCatalogSnapshotRegistry, buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import {
  getRuntimeDefaultAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeProfileCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
  updateRuntimeActiveSkills,
} from './runtimeCatalogRead.js'

test('runtime catalog read helpers expose registered tools, skills, and default manifest without reshaping them', () => {
  const registry = new StaticToolRegistry([
    {
      name: 'movscript_test_tool',
      description: 'Test tool',
      permission: 'test.read',
      risk: 'read',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
  ])
  const skill = makeSkill('skill_a')
  const profile = makeProfile()
  const layeredRegistry = makeRegistry({ skills: [skill], profiles: [profile] })

  assert.deepEqual(listRuntimeRegisteredTools(registry).map((tool) => tool.name), ['movscript_test_tool'])
  assert.deepEqual(listRuntimeSkillCatalog(layeredRegistry), [skill])
  assert.deepEqual(listRuntimeProfileCatalog(layeredRegistry), [profile])
  assert.equal(getRuntimeDefaultAgentManifest(DEFAULT_AGENT_MANIFEST), DEFAULT_AGENT_MANIFEST)
})

test('inspectRuntimeAgentCatalog reads the captured run catalog snapshot and active skill view', () => {
  const skill = makeSkill('skill_a')
  const profile = makeProfile({
    enabledPacks: ['pack_a'],
    persona: skill.id,
  })
  const registry = makeRegistry({
    skills: [skill],
    tools: [makeTool('tool_a')],
    packs: [{
      id: 'pack_a',
      version: '1.0.0',
      name: 'Pack A',
      source: 'builtin',
      schemas: [],
      tools: ['tool_a'],
      skills: [skill.id],
    }],
    profiles: [profile],
  })
  const captured = buildRuntimeCatalogSnapshot({
    id: 'catalog_captured',
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: { profileId: profile.id },
    },
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: registry,
    pluginCatalogInfo: {
      skillsDir: '/tmp/skills',
      toolsDir: '/tmp/tools',
      skillCount: 1,
      toolCount: 1,
      metadata: { catalogVersion: 'catalog-v1' },
    },
    pluginWarnings: ['warning-a'],
  })
  const current = buildRuntimeCatalogSnapshot({
    id: 'catalog_current',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry(),
  })
  const snapshots = new RuntimeCatalogSnapshotRegistry(captured)
  snapshots.captureRun('run_1')
  snapshots.replaceCurrent(current)

  const result = inspectRuntimeAgentCatalog({
    catalogSnapshots: snapshots,
    run: {
      id: 'run_1',
      traceEvents: [{
        id: 'trace_1',
        runId: 'run_1',
        kind: 'skill',
        title: 'Runtime context resolved',
        status: 'completed',
        data: { skills: [{ id: skill.id }] },
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    },
  }) as Record<string, unknown>

  assert.equal((result.catalogSnapshot as Record<string, unknown>).id, 'catalog_captured')
  assert.equal((result.catalogSnapshot as Record<string, unknown>).version, 'catalog-v1')
  assert.deepEqual(result.activeSkillIds, [skill.id])
  assert.deepEqual(result.enabledPackIds, ['pack_a'])
  assert.deepEqual(result.toolNames, ['tool_a'])
  assert.deepEqual(result.warnings, ['warning-a'])
})

test('updateRuntimeActiveSkills stores run skill state and reports missing ids', () => {
  const skillA = makeSkill('skill_a')
  const skillB = makeSkill('skill_b')
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [skillA, skillB] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: { activeSkillIds: [skillA.id] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }

  const result = updateRuntimeActiveSkills({
    catalogSnapshots: snapshots,
    run,
    request: { load: [skillB.id, 'missing_skill'], unload: [skillA.id], reason: 'switch specialist' },
    now: () => '2026-01-01T00:00:01.000Z',
  }) as Record<string, unknown>

  assert.equal(result.status, 'partial')
  assert.equal(result.eventType, 'skill.state_requested')
  assert.deepEqual(result.loadedSkillIds, [skillB.id])
  assert.deepEqual(result.unloadedSkillIds, [skillA.id])
  assert.deepEqual(result.activeSkillIds, [skillB.id])
  assert.deepEqual(result.missingSkillIds, ['missing_skill'])
  assert.deepEqual((run.metadata?.skillState as any)?.loadedSkillIds, [skillB.id])
})

test('updateRuntimeActiveSkills corrects proposal skill choice for plain script reading requests', () => {
  const scriptReading = makeSkill('movscript.workflow.script-reading')
  const assetProposal = makeSkill('movscript.workflow.asset-proposal')
  const settingProposal = makeSkill('movscript.workflow.setting-proposal')
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [scriptReading, assetProposal, settingProposal] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '请查看好运甜妻的总剧本内容',
      executionMode: 'chat',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }

  const result = updateRuntimeActiveSkills({
    catalogSnapshots: snapshots,
    run,
    request: {
      load: [assetProposal.id, settingProposal.id],
      reason: 'read script context',
    },
    now: () => '2026-01-01T00:00:01.000Z',
  }) as Record<string, any>

  assert.equal(result.status, 'updated')
  assert.deepEqual(result.loadedSkillIds, [scriptReading.id])
  assert.deepEqual(result.correctedSkillActivation.suppressedLoad, [assetProposal.id, settingProposal.id])
  assert.deepEqual(result.correctedSkillActivation.addedLoad, [scriptReading.id])
  assert.deepEqual((run.metadata?.skillState as any)?.loadedSkillIds, [scriptReading.id])
})

test('updateRuntimeActiveSkills preserves proposal skills when script request asks for proposal work', () => {
  const scriptReading = makeSkill('movscript.workflow.script-reading')
  const assetProposal = makeSkill('movscript.workflow.asset-proposal')
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [scriptReading, assetProposal] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: '根据总剧本创建素材提案',
      executionMode: 'chat',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }

  const result = updateRuntimeActiveSkills({
    catalogSnapshots: snapshots,
    run,
    request: { load: [assetProposal.id], reason: 'create asset proposal' },
    now: () => '2026-01-01T00:00:01.000Z',
  }) as Record<string, unknown>

  assert.equal(result.status, 'updated')
  assert.deepEqual(result.loadedSkillIds, [assetProposal.id])
  assert.equal(result.correctedSkillActivation, undefined)
})

test('updateRuntimeActiveSkills expands dependencies and blocks conflicting style skills by default', () => {
  const dependency = makeSkill('skill_dependency')
  const styleA = makeSkill('style_a', {
    conflicts: ['style_b'],
    dependencies: [dependency.id],
  })
  const styleB = makeSkill('style_b', {
    conflicts: ['style_a'],
  })
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [dependency, styleA, styleB] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }

  const conflict = updateRuntimeActiveSkills({
    catalogSnapshots: snapshots,
    run,
    request: { load: [styleA.id, styleB.id], reason: 'ambiguous director styles' },
    now: () => '2026-01-01T00:00:01.000Z',
  }) as Record<string, unknown>

  assert.equal(conflict.status, 'conflict')
  assert.equal(conflict.requiresUserInput, true)
  assert.deepEqual(conflict.dependencySkillIds, [dependency.id])
  assert.deepEqual(conflict.conflicts, [{ id: styleA.id, conflictId: styleB.id }])
  assert.equal(run.metadata?.skillState, undefined)

  const selected = updateRuntimeActiveSkills({
    catalogSnapshots: snapshots,
    run,
    request: { load: [styleA.id], reason: 'user selected style A' },
    now: () => '2026-01-01T00:00:02.000Z',
  }) as Record<string, unknown>

  assert.equal(selected.status, 'updated')
  assert.deepEqual(selected.dependencySkillIds, [dependency.id])
  assert.deepEqual(selected.loadedSkillIds, [dependency.id, styleA.id])
  assert.deepEqual((run.metadata?.skillState as any)?.loadedSkillIds, [dependency.id, styleA.id])
})

function makeRegistry(input: {
  skills?: SkillDefinition[]
  tools?: ToolDefinition[]
  packs?: CapabilityPack[]
  profiles?: AgentProfile[]
} = {}): CatalogRegistry {
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map((input.tools ?? []).map((tool) => [tool.name, tool])),
    skills: new Map((input.skills ?? []).map((skill) => [skill.id, skill])),
    packs: new Map((input.packs ?? []).map((pack) => [pack.id, pack])),
    profiles: new Map((input.profiles ?? []).map((profile) => [profile.id, profile])),
    knowledge: new Map(),
  }
}

function makeSkill(id: string, overrides: {
  conflicts?: string[]
  dependencies?: string[]
} = {}): SkillDefinition {
  return {
    id,
    kind: 'persona',
    version: '1.0.0',
    name: id,
    description: `${id} description`,
    priority: 1,
    enabled: true,
    instructionTemplate: 'Use this skill.',
    ...overrides,
  }
}

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object' },
    permission: 'tool.read',
    risk: 'read',
    projectScoped: false,
    defaults: {
      grant: 'allow',
      approval: 'never',
    },
    source: 'runtime',
  }
}

function makeProfile(input: {
  enabledPacks?: string[]
  persona?: string | null
} = {}): AgentProfile {
  return {
    schema: 'movscript.agent.profile.v1',
    id: 'profile_a',
    version: '1.0.0',
    name: 'Profile A',
    enabledPacks: input.enabledPacks ?? [],
    persona: input.persona ?? null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentConfigFile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from '../../../../catalog/registry/shared/types.js'
import type { AgentRun } from '../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { RuntimeCatalogSnapshotRegistry, buildRuntimeCatalogSnapshot } from '../../snapshot/core/runtimeCatalogSnapshot.js'
import {
  getRuntimeActiveAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeConfigFileCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
  updateRuntimeActiveSkills,
} from './runtimeCatalogRead.js'

test('runtime catalog read helpers expose registered tools, skills, and active manifest without reshaping them', () => {
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
  const configFile = makeConfigFile()
  const layeredRegistry = makeRegistry({ skills: [skill], configFiles: [configFile] })

  assert.deepEqual(listRuntimeRegisteredTools(registry).map((tool) => tool.name), ['movscript_test_tool'])
  const listedSkills = listRuntimeSkillCatalog(layeredRegistry, { ...DEFAULT_AGENT_MANIFEST, metadata: { configFileId: configFile.id } })
  assert.equal(listedSkills[0]?.id, skill.id)
  assert.equal(listedSkills[0]?.runtime.configEnabled, false)
  assert.equal(listedSkills[0]?.runtime.defaultActivation, 'disabled')
  assert.deepEqual(listRuntimeConfigFileCatalog(layeredRegistry), [configFile])
  assert.equal(getRuntimeActiveAgentManifest(DEFAULT_AGENT_MANIFEST), DEFAULT_AGENT_MANIFEST)
})

test('listRuntimeSkillCatalog explains configFile and runtime skill behavior', () => {
  const base = makeSkill('base_default')
  const task = makeSkill('task_visual', {
    loadMode: 'on_demand',
    dependencies: ['base_default'],
    conflicts: ['task_script'],
    toolGrants: ['tool_a'],
  })
  const manual = makeSkill('style_manual', {
    loadMode: 'manual',
  })
  const configFile = makeConfigFile({
    skillIds: [base.id, task.id],
  })
  const registry = makeRegistry({
    skills: [base, task, manual],
    tools: [makeTool('tool_a')],
    configFiles: [configFile],
  })

  const listed = listRuntimeSkillCatalog(registry, {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: { configFileId: configFile.id },
  })

  assert.equal(listed.find((skill) => skill.id === base.id)?.runtime.configEnabled, true)
  assert.equal(listed.find((skill) => skill.id === base.id)?.runtime.contextBehavior, 'base_context')
  const taskRuntime = listed.find((skill) => skill.id === task.id)?.runtime
  assert.equal(taskRuntime?.configEnabled, true)
  assert.equal(taskRuntime?.defaultActivation, 'triggered')
  assert.deepEqual(taskRuntime?.dependencyIds, ['base_default'])
  assert.deepEqual(taskRuntime?.conflictIds, ['task_script'])
  assert.deepEqual(taskRuntime?.toolGrantNames, ['tool_a'])
  assert.deepEqual(listed.find((skill) => skill.id === task.id)?.toolGrants, ['tool_a'])
  assert.equal(listed.find((skill) => skill.id === manual.id)?.runtime.defaultActivation, 'manual')
  const runtimeLanguage = listed.map((skill) => skill.runtime.reason).join('\n')
  const retiredTerms = [
    ['skill', 'Kind'],
    ['work', 'flow'],
    ['pol', 'icy'],
    ['pro', 'file'],
    ['per', 'sona'],
    ['ex', 'pertise'],
  ].map((parts) => parts.join(''))
  assert.equal(retiredTerms.some((term) => runtimeLanguage.toLowerCase().includes(term.toLowerCase())), false)
})

test('inspectRuntimeAgentCatalog reads the captured run catalog snapshot and active skill view', () => {
  const skill = makeSkill('skill_a')
  const configFile = makeConfigFile({
    enabledPackIds: ['pack_a'],
    skillIds: [skill.id],
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
    configFiles: [configFile],
  })
  const captured = buildRuntimeCatalogSnapshot({
    id: 'catalog_captured',
    activeAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: { configFileId: configFile.id },
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
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [skillA, skillB] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    runtimeLimits: { approvalMode: 'interactive' as const,
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
  const scriptReading = makeSkill('movscript.script_reading')
  const assetProposal = makeSkill('movscript.asset_proposal')
  const settingProposal = makeSkill('movscript.setting_proposal')
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    runtimeLimits: { approvalMode: 'interactive' as const,
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
  const scriptReading = makeSkill('movscript.script_reading')
  const assetProposal = makeSkill('movscript.asset_proposal')
  const snapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    runtimeLimits: { approvalMode: 'interactive' as const,
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
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: makeRegistry({ skills: [dependency, styleA, styleB] }),
  }))
  snapshots.captureRun('run_1')
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    runtimeLimits: { approvalMode: 'interactive' as const,
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
  configFiles?: AgentConfigFile[]
} = {}): CatalogRegistry {
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map((input.tools ?? []).map((tool) => [tool.name, tool])),
    skills: new Map((input.skills ?? []).map((skill) => [skill.id, skill])),
    packs: new Map((input.packs ?? []).map((pack) => [pack.id, pack])),
    configFiles: new Map((input.configFiles ?? []).map((configFile) => [configFile.id, configFile])),
  }
}

function makeSkill(id: string, overrides: {
  conflicts?: string[]
  dependencies?: string[]
  loadMode?: SkillDefinition['loadMode']
  triggers?: SkillDefinition['triggers']
  toolGrants?: string[]
} = {}): SkillDefinition {
  return {
    id,
    version: '1.0.0',
    name: id,
    description: `${id} description`,
    priority: 1,
    enabled: true,
    instructionTemplate: 'Use this skill.',
    ...(overrides.toolGrants ? { triggers: [{ kind: 'always' as const }] } : {}),
    ...overrides,
  } as SkillDefinition
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

function makeConfigFile(input: {
  enabledPackIds?: string[]
  skillIds?: string[]
} = {}): AgentConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id: 'config_file_a',
    version: '1.0.0',
    name: 'Config File A',
    enabledPackIds: input.enabledPackIds ?? [],
    skillIds: input.skillIds ?? [],
    toolGrants: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
}

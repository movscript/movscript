import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectCatalogPackClosure,
  inspectAgentCatalogView,
  normalizeCatalogInspectView,
  summarizeCatalogPack,
  summarizeCatalogConfigFile,
  summarizeCatalogSkill,
  summarizeCatalogTool,
} from './catalogInspectView.js'
import { DEFAULT_AGENT_MANIFEST } from '../../manifest/agentManifest.js'
import type { AgentConfigFile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from '../../registry/shared/types.js'

test('normalizeCatalogInspectView defaults unknown values to summary', () => {
  assert.equal(normalizeCatalogInspectView('skill'), 'skill')
  assert.equal(normalizeCatalogInspectView('unexpected'), 'summary')
  assert.equal(normalizeCatalogInspectView(undefined), 'summary')
})

test('collectCatalogPackClosure includes required packs once', () => {
  const packs = new Map<string, CapabilityPack>([
    ['pack.a', pack({ id: 'pack.a', requires: { packs: { 'pack.b': '^1' } } })],
    ['pack.b', pack({ id: 'pack.b', requires: { packs: { 'pack.c': '^1' } } })],
    ['pack.c', pack({ id: 'pack.c' })],
  ])
  assert.deepEqual(collectCatalogPackClosure(['pack.a', 'pack.b'], packs), ['pack.a', 'pack.b', 'pack.c'])
})

test('catalog summaries expose stable public fields', () => {
  assert.deepEqual(summarizeCatalogConfigFile(configFile()), {
    id: 'config_file.base',
    version: '1.0.0',
    name: 'Base',
    enabledPackIds: ['pack.a'],
    skillIds: ['skill.base', 'skill.rules', 'skill.example'],
    toolGrants: [{ name: 'tool.a', mode: 'allow', approval: 'on_write' }],
    limits: { maxHistoryMessages: 5 },
  })

  assert.deepEqual(summarizeCatalogPack(pack()), {
    id: 'pack.a',
    version: '1.0.0',
    name: 'Pack',
    source: 'builtin',
    skills: ['skill.example'],
    tools: ['tool.a'],
    schemas: [],
    reference: ['reference://pack.a/guide'],
  })
})

test('skill and tool summaries include optional internals only when requested', () => {
  const skill = taskSkill()
  assert.equal((summarizeCatalogSkill(skill, false) as Record<string, unknown>).instructionTemplate, undefined)
  assert.equal((summarizeCatalogSkill(skill, true) as Record<string, unknown>).instructionTemplate, 'Do work')
  assert.deepEqual((summarizeCatalogSkill(skill, false) as Record<string, unknown>).tags, ['writing'])
  assert.equal((summarizeCatalogSkill(skill, false) as Record<string, unknown>).loadMode, 'on_demand')
  assert.equal((summarizeCatalogSkill(skill, false) as Record<string, unknown>).source, 'builtin')

  const tool = toolDefinition()
  assert.equal((summarizeCatalogTool(tool, false) as Record<string, unknown>).inputSchema, undefined)
  assert.deepEqual((summarizeCatalogTool(tool, true) as Record<string, unknown>).inputSchema, { type: 'object' })
})

test('inspectAgentCatalogView builds summary and detail views from a catalog snapshot', () => {
  const registry = catalogRegistry()
  const snapshot = {
    id: 'snapshot_1',
    catalogVersion: 'catalog_v1',
    activeAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: { configFileId: 'config_file.base' },
    },
    layeredRegistry: registry,
    pluginWarnings: ['warning'],
  }

  const summary = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: ['skill.example'],
    request: {},
  }) as Record<string, any>
  assert.equal(summary.status, 'ok')
  assert.equal(summary.catalogSnapshot.id, 'snapshot_1')
  assert.deepEqual(summary.enabledPackIds, ['pack.a'])
  assert.deepEqual(summary.activeSkillIds, ['skill.example'])
  assert.deepEqual(summary.installedSkills.map((skill: any) => skill.id), ['skill.example'])
  assert.equal(summary.installedSkills[0].loadMode, 'on_demand')
  assert.deepEqual(summary.toolNames, ['tool.a'])
  assert.deepEqual(summary.warnings, ['warning'])

  const skill = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: ['skill.example'],
    request: { view: 'skill', id: 'skill.example', includeInstruction: true },
  }) as Record<string, any>
  assert.equal(skill.active, true)
  assert.equal(skill.coveredByEnabledPack, true)
  assert.equal(skill.skill.instructionTemplate, 'Do work')

  const tool = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'tool', id: 'tool.a', includeSchema: true },
  }) as Record<string, any>
  assert.equal(tool.enabledByPack, true)
  assert.deepEqual(tool.grant, { mode: 'allow', approval: 'on_write' })
  assert.deepEqual(tool.tool.inputSchema, { type: 'object' })
  assert.equal(tool.tool.execution?.concurrencySafe, false)

  assert.throws(() => inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'pack' },
  }), /requires id/)
})

test('inspectAgentCatalogView supports pack and config views', () => {
  const snapshot = {
    id: 'snapshot_1',
    catalogVersion: 'catalog_v1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    layeredRegistry: catalogRegistry(),
    pluginWarnings: [],
  }

  const packView = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'pack', id: 'pack.a' },
  }) as Record<string, any>
  assert.equal(packView.enabled, true)
  assert.equal(packView.pack.id, 'pack.a')

  const configView = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'config', id: 'config_file.base' },
  }) as Record<string, any>
  assert.equal(configView.isCurrent, true)
  assert.equal(configView.configFile.id, 'config_file.base')
})

function configFile(overrides: Partial<AgentConfigFile> = {}): AgentConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id: 'config_file.base',
    version: '1.0.0',
    name: 'Base',
    enabledPackIds: ['pack.a'],
    skillIds: ['skill.base', 'skill.rules', 'skill.example'],
    toolGrants: [{ name: 'tool.a', mode: 'allow', approval: 'on_write' }],
    limits: { maxHistoryMessages: 5 },
    ...overrides,
  }
}

function pack(overrides: Partial<CapabilityPack> = {}): CapabilityPack {
  return {
    id: 'pack.a',
    version: '1.0.0',
    name: 'Pack',
    source: 'builtin',
    schemas: [],
    tools: ['tool.a'],
    skills: ['skill.example'],
    reference: ['reference://pack.a/guide'],
    ...overrides,
  }
}

function taskSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'skill.example',
    version: '1.0.0',
    name: 'Task',
    description: 'Task skill',
    priority: 10,
    enabled: true,
    instructionTemplate: 'Do work',
    loadMode: 'on_demand',
    source: 'builtin',
    tags: ['writing'],
    aliases: ['writer'],
    useWhen: ['writing scenes'],
    triggers: [{ kind: 'always' }],
    toolGrants: ['tool.a'],
    ...overrides,
  } as SkillDefinition
}

function toolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'tool.a',
    description: 'Tool A',
    inputSchema: { type: 'object' },
    permission: 'write',
    risk: 'write',
    projectScoped: true,
    defaults: { grant: 'allow', approval: 'on_write' },
    execution: {
      readOnly: false,
      destructive: false,
      concurrencySafe: false,
      interruptBehavior: 'block',
      resultRefStrategy: 'auto',
    },
    source: 'runtime',
    ...overrides,
  }
}

function catalogRegistry(): CatalogRegistry {
  const packs = new Map<string, CapabilityPack>([['pack.a', pack()]])
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map([['tool.a', toolDefinition()]]),
    skills: new Map([['skill.example', taskSkill()]]),
    packs,
    configFiles: new Map([['config_file.base', configFile()]]),
  }
}

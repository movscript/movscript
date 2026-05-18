import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectCatalogPackClosure,
  inspectAgentCatalogView,
  normalizeCatalogInspectView,
  summarizeCatalogPack,
  summarizeCatalogProfile,
  summarizeCatalogSkill,
  summarizeCatalogTool,
  summarizeEnabledKnowledgeCollections,
  summarizeKnowledgeCollection,
} from './catalogInspectView.js'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'
import type { AgentProfile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from './types.js'

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
  assert.deepEqual(summarizeCatalogProfile(profile()), {
    id: 'profile.default',
    version: '1.0.0',
    name: 'Default',
    enabledPacks: ['pack.a'],
    persona: 'skill.persona',
    enabledPolicies: ['skill.policy'],
    enabledWorkflows: ['skill.workflow'],
    toolGrants: [{ name: 'tool.a', mode: 'allow', approval: 'on_write' }],
    limits: { maxHistoryMessages: 5 },
  })

  assert.deepEqual(summarizeCatalogPack(pack({ resources: { knowledge: ['knowledge.a'] }, knowledge: ['knowledge.a'] })), {
    id: 'pack.a',
    version: '1.0.0',
    name: 'Pack',
    source: 'builtin',
    skills: ['skill.workflow'],
    tools: ['tool.a'],
    schemas: [],
    knowledge: ['knowledge.a'],
    knowledgeResources: ['knowledge.a'],
  })
})

test('skill and tool summaries include optional internals only when requested', () => {
  const skill = workflowSkill()
  assert.equal((summarizeCatalogSkill(skill, false) as Record<string, unknown>).instructionTemplate, undefined)
  assert.equal((summarizeCatalogSkill(skill, true) as Record<string, unknown>).instructionTemplate, 'Do work')
  assert.deepEqual((summarizeCatalogSkill(skill, false) as Record<string, unknown>).tags, ['writing'])
  assert.equal((summarizeCatalogSkill(skill, false) as Record<string, unknown>).loadMode, 'on_demand')

  const tool = toolDefinition()
  assert.equal((summarizeCatalogTool(tool, false) as Record<string, unknown>).inputSchema, undefined)
  assert.deepEqual((summarizeCatalogTool(tool, true) as Record<string, unknown>).inputSchema, { type: 'object' })
})

test('knowledge summaries are reusable for enabled pack collections', () => {
  const registry = catalogRegistry()
  assert.deepEqual(summarizeKnowledgeCollection(registry.knowledge.get('knowledge.a')!), {
    id: 'knowledge.a',
    version: '1.0.0',
    domain: 'agent',
    name: 'Agent Knowledge',
    tags: ['agent'],
    chunkIds: ['chunk.a'],
  })
  assert.deepEqual(summarizeEnabledKnowledgeCollections(['pack.a'], registry), [{
    id: 'knowledge.a',
    version: '1.0.0',
    domain: 'agent',
    name: 'Agent Knowledge',
    tags: ['agent'],
    chunkIds: ['chunk.a'],
  }])
})

test('inspectAgentCatalogView builds summary and detail views from a catalog snapshot', () => {
  const registry = catalogRegistry()
  const snapshot = {
    id: 'snapshot_1',
    catalogVersion: 'catalog_v1',
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      metadata: { profileId: 'profile.default' },
    },
    layeredRegistry: registry,
    pluginWarnings: ['warning'],
  }

  const summary = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: ['skill.workflow'],
    request: {},
  }) as Record<string, any>
  assert.equal(summary.status, 'ok')
  assert.equal(summary.catalogSnapshot.id, 'snapshot_1')
  assert.deepEqual(summary.enabledPackIds, ['pack.a'])
  assert.deepEqual(summary.activeSkillIds, ['skill.workflow'])
  assert.deepEqual(summary.installedSkills.map((skill: any) => skill.id), ['skill.workflow'])
  assert.equal(summary.installedSkills[0].loadMode, 'on_demand')
  assert.deepEqual(summary.toolNames, ['tool.a'])
  assert.deepEqual(summary.warnings, ['warning'])

  const skill = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: ['skill.workflow'],
    request: { view: 'skill', id: 'skill.workflow', includeInstruction: true },
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

  assert.throws(() => inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'pack' },
  }), /requires id/)
})

test('inspectAgentCatalogView supports pack profile and knowledge views', () => {
  const snapshot = {
    id: 'snapshot_1',
    catalogVersion: 'catalog_v1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
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
  assert.equal(packView.knowledgeCollections[0].id, 'knowledge.a')

  const profileView = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'profile', id: 'profile.default' },
  }) as Record<string, any>
  assert.equal(profileView.isCurrent, true)

  const knowledgeView = inspectAgentCatalogView({
    snapshot,
    activeSkillIds: [],
    request: { view: 'knowledge', id: 'knowledge.a' },
  }) as Record<string, any>
  assert.equal(knowledgeView.enabledByPack, true)
  assert.equal(knowledgeView.knowledge.id, 'knowledge.a')
})

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    schema: 'movscript.agent.profile.v1',
    id: 'profile.default',
    version: '1.0.0',
    name: 'Default',
    enabledPacks: ['pack.a'],
    persona: 'skill.persona',
    enabledWorkflows: ['skill.workflow'],
    enabledPolicies: ['skill.policy'],
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
    skills: ['skill.workflow'],
    ...overrides,
  }
}

function workflowSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'skill.workflow',
    kind: 'workflow',
    version: '1.0.0',
    name: 'Workflow',
    description: 'Workflow skill',
    priority: 10,
    enabled: true,
    instructionTemplate: 'Do work',
    loadMode: 'on_demand',
    tags: ['writing'],
    aliases: ['writer'],
    useWhen: ['writing scenes'],
    triggers: [{ kind: 'always' }],
    toolRefs: ['tool.a'],
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
    source: 'runtime',
    ...overrides,
  }
}

function catalogRegistry(): CatalogRegistry {
  const packs = new Map<string, CapabilityPack>([['pack.a', pack({ knowledge: ['knowledge.a'] })]])
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map([['tool.a', toolDefinition()]]),
    skills: new Map([['skill.workflow', workflowSkill()]]),
    packs,
    profiles: new Map([['profile.default', profile()]]),
    knowledge: new Map([['knowledge.a', {
      id: 'knowledge.a',
      version: '1.0.0',
      domain: 'agent',
      name: 'Agent Knowledge',
      tags: ['agent'],
      chunkIds: ['chunk.a'],
    }]]),
  }
}

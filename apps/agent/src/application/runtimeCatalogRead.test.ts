import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentProfile, CapabilityPack, CatalogRegistry, SkillDefinition, ToolDefinition } from '../catalog/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { RuntimeCatalogSnapshotRegistry, buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import {
  getRuntimeDefaultAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
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
  const layeredRegistry = makeRegistry({ skills: [skill] })

  assert.deepEqual(listRuntimeRegisteredTools(registry).map((tool) => tool.name), ['movscript_test_tool'])
  assert.deepEqual(listRuntimeSkillCatalog(layeredRegistry), [skill])
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

function makeSkill(id: string): SkillDefinition {
  return {
    id,
    kind: 'persona',
    version: '1.0.0',
    name: id,
    description: `${id} description`,
    priority: 1,
    enabled: true,
    instructionTemplate: 'Use this skill.',
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

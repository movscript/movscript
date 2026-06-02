import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import { DEFAULT_TOOL_REGISTRY } from '../../../../tools/registry/core/toolRegistry.js'
import {
  RuntimeCatalogSnapshotRegistry,
  buildRuntimeCatalogSnapshot,
  buildRunConfigurationSnapshot,
  createRuntimeCatalogSnapshot,
} from './runtimeCatalogSnapshot.js'

const emptyLayeredRegistry = {
  version: 'test',
  schemas: new Map(),
  tools: new Map(),
  skills: new Map(),
  packs: new Map(),
  configFiles: new Map(),
}

test('buildRuntimeCatalogSnapshot freezes catalog identity, manifest, registries, and warnings', () => {
  const snapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
    pluginCatalogInfo: {
      skillsDir: '/tmp/skills',
      toolsDir: '/tmp/tools',
      skillCount: 2,
      toolCount: 3,
      metadata: { catalogVersion: 'catalog-v1' },
    },
    pluginWarnings: ['missing optional skill'],
  })

  assert.equal(snapshot.id, 'catalog_1')
  assert.equal(snapshot.catalogVersion, 'catalog-v1')
  assert.equal(snapshot.activeAgentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(snapshot.toolRegistry, DEFAULT_TOOL_REGISTRY)
  assert.equal(snapshot.layeredRegistry, emptyLayeredRegistry)
  assert.deepEqual(snapshot.pluginWarnings, ['missing optional skill'])
})

test('buildRuntimeCatalogSnapshot defaults absent plugin metadata to a stable empty snapshot shape', () => {
  const snapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_2',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })

  assert.equal(snapshot.catalogVersion, null)
  assert.equal(snapshot.pluginCatalogInfo, undefined)
  assert.deepEqual(snapshot.pluginWarnings, [])
})

test('createRuntimeCatalogSnapshot allocates ids and captures current catalog state', () => {
  const snapshot = createRuntimeCatalogSnapshot({
    makeId: () => 'catalog_generated',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
    pluginWarnings: ['warning'],
  })

  assert.equal(snapshot.id, 'catalog_generated')
  assert.equal(snapshot.activeAgentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(snapshot.toolRegistry, DEFAULT_TOOL_REGISTRY)
  assert.deepEqual(snapshot.pluginWarnings, ['warning'])
})

test('buildRunConfigurationSnapshot serializes config files, packs, skill instructions, and tool defaults', () => {
  const activeAgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: {
      ...DEFAULT_AGENT_MANIFEST.metadata,
      configFileId: 'config_main',
      toolPermissionOverridesByConfigFile: {
        config_main: [{ name: 'tool_write', mode: 'deny', approval: 'always' }],
      },
    },
  }
  const snapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_full',
    activeAgentManifest,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: {
      version: 'test',
      schemas: new Map(),
      configFiles: new Map([['config_main', {
        schema: 'movscript.agent.config_file.v1',
        id: 'config_main',
        version: '1.0.0',
        name: 'Main config',
        description: 'Run config used by the storyboard agent.',
        enabledPackIds: ['pack_main'],
        skillIds: ['skill_writer'],
        approvalDefaults: { default: 'never', write: 'on_write' },
        toolGrants: [{ name: 'tool_write', mode: 'allow', approval: 'on_write' }],
        model: { provider: 'openai', modelId: 'gpt-4.1', platformModelId: '42', routes: [{ when: { task: ['workspace'] }, use: { provider: 'openai', modelId: 'gpt-4.1-mini' } }] },
        limits: { maxHistoryMessages: 8 },
        metadata: { owner: 'agent-settings' },
      }]]),
      packs: new Map([['pack_main', {
        id: 'pack_main',
        version: '1.0.0',
        name: 'Main pack',
        source: 'plugin',
        schemas: [],
        skills: ['skill_writer'],
        tools: ['tool_write'],
        reference: ['reference://studio/writing-guide'],
        requires: { skills: { skill_base: '^1.0.0' }, tools: { tool_write: '^1.0.0' } },
        conflicts: ['pack_legacy'],
        pluginId: 'studio.plugin',
      }]]),
      skills: new Map([['skill_writer', {
        id: 'skill_writer',
        version: '1.0.0',
        name: 'Writer',
        description: 'Writes scenes.',
        priority: 100,
        enabled: true,
        instructionTemplate: 'Write with continuity.',
        loadMode: 'on_demand',
        source: 'plugin',
        triggers: [{ kind: 'keyword', any: ['scene', 'workspace'] }],
        aliases: ['scene writer'],
        useWhen: ['workspaceing scenes'],
        dependencies: ['skill_base'],
        conflicts: ['skill_legacy'],
        tokenEstimate: 120,
        contextBudget: { maxChars: 4000, reserveRatio: 0.2, strategy: 'proportional' },
        toolGrants: ['tool_write'],
        schemaRefs: ['schema_scene'],
        outputContract: 'Return a concise scene workspace.',
        metadata: { editableInstruction: true },
      }]]),
      tools: new Map([['tool_write', {
        name: 'tool_write',
        description: 'Writes data.',
        inputSchema: { type: 'object' },
        permission: 'write:data',
        risk: 'write',
        projectScoped: true,
        defaults: { grant: 'allow', approval: 'on_write' },
        execution: { readOnly: false, destructive: false, concurrencySafe: false, interruptBehavior: 'block', maxResultSizeChars: 2048, resultRefStrategy: 'summary_ref' },
        source: 'plugin',
        capability: 'studio.write',
        pluginId: 'studio.plugin',
        mcpServerId: 'studio-mcp',
        errorCodes: ['WRITE_FAILED'],
        requiresSkills: ['skill_writer'],
      }]]),
    },
    pluginCatalogInfo: {
      skillsDir: '/skills',
      toolsDir: '/tools',
      skillCount: 1,
      toolCount: 1,
      metadata: { catalogVersion: 'catalog-v1' },
    },
    pluginWarnings: ['optional pack missing'],
  })

  const runSnapshot = buildRunConfigurationSnapshot({
    snapshot,
    capturedAt: '2026-01-01T00:00:00.000Z',
    runtimeLimits: {
      approvalMode: 'auto_readonly',
      sandboxMode: true,
      maxToolCalls: 8,
      maxIterations: 3,
      allowNetwork: false,
      allowFileBytes: false,
      execution: { mode: 'compact', includeMemories: true, allowForcedToolCalls: false },
    },
  })

  assert.equal(runSnapshot.schema, 'movscript.agent.run-configuration-snapshot.v1')
  assert.deepEqual(runSnapshot.catalogSnapshot, { id: 'catalog_full', version: 'catalog-v1' })
  assert.equal(runSnapshot.activeConfigFileId, 'config_main')
  assert.deepEqual(runSnapshot.runtimeLimits, {
    approvalMode: 'auto_readonly',
    sandboxMode: true,
    maxToolCalls: 8,
    maxIterations: 3,
    allowNetwork: false,
    allowFileBytes: false,
    execution: { mode: 'compact', includeMemories: true, allowForcedToolCalls: false },
  })
  assert.deepEqual(runSnapshot.activeAgentManifest.metadata?.toolPermissionOverridesByConfigFile, {
    config_main: [{ name: 'tool_write', mode: 'deny', approval: 'always' }],
  })
  assert.deepEqual(runSnapshot.toolPermissionOverridesByConfigFile, {
    config_main: [{ name: 'tool_write', mode: 'deny', approval: 'always' }],
  })
  assert.equal(runSnapshot.configFiles[0]?.description, 'Run config used by the storyboard agent.')
  assert.deepEqual(runSnapshot.configFiles[0]?.approvalDefaults, { default: 'never', write: 'on_write' })
  assert.equal(runSnapshot.configFiles[0]?.toolGrants[0]?.approval, 'on_write')
  assert.deepEqual(runSnapshot.configFiles[0]?.model, { provider: 'openai', modelId: 'gpt-4.1', platformModelId: '42', routes: [{ when: { task: ['workspace'] }, use: { provider: 'openai', modelId: 'gpt-4.1-mini' } }] })
  assert.equal(runSnapshot.configFiles[0]?.limits?.maxHistoryMessages, 8)
  assert.deepEqual(runSnapshot.configFiles[0]?.metadata, { owner: 'agent-settings' })
  assert.equal(runSnapshot.packs[0]?.source, 'plugin')
  assert.equal(runSnapshot.packs[0]?.pluginId, 'studio.plugin')
  assert.deepEqual(runSnapshot.packs[0]?.reference, ['reference://studio/writing-guide'])
  assert.deepEqual(runSnapshot.packs[0]?.requires, { skills: { skill_base: '^1.0.0' }, tools: { tool_write: '^1.0.0' } })
  assert.deepEqual(runSnapshot.packs[0]?.conflicts, ['pack_legacy'])
  assert.equal(runSnapshot.skills[0]?.instructionTemplate, 'Write with continuity.')
  assert.equal(runSnapshot.skills[0]?.source, 'plugin')
  assert.deepEqual(runSnapshot.skills[0]?.triggers, [{ kind: 'keyword', any: ['scene', 'workspace'] }])
  assert.deepEqual(runSnapshot.skills[0]?.aliases, ['scene writer'])
  assert.deepEqual(runSnapshot.skills[0]?.useWhen, ['workspaceing scenes'])
  assert.deepEqual(runSnapshot.skills[0]?.dependencies, ['skill_base'])
  assert.deepEqual(runSnapshot.skills[0]?.conflicts, ['skill_legacy'])
  assert.equal(runSnapshot.skills[0]?.tokenEstimate, 120)
  assert.deepEqual(runSnapshot.skills[0]?.contextBudget, { maxChars: 4000, reserveRatio: 0.2, strategy: 'proportional' })
  assert.deepEqual(runSnapshot.skills[0]?.toolGrants, ['tool_write'])
  assert.deepEqual(runSnapshot.skills[0]?.schemaRefs, ['schema_scene'])
  assert.equal(runSnapshot.skills[0]?.outputContract, 'Return a concise scene workspace.')
  assert.deepEqual(runSnapshot.skills[0]?.metadata, { editableInstruction: true })
  assert.equal(runSnapshot.tools[0]?.defaults.approval, 'on_write')
  assert.deepEqual(runSnapshot.tools[0]?.execution, { readOnly: false, destructive: false, concurrencySafe: false, interruptBehavior: 'block', maxResultSizeChars: 2048, resultRefStrategy: 'summary_ref' })
  assert.equal(runSnapshot.tools[0]?.projectScoped, true)
  assert.equal(runSnapshot.tools[0]?.capability, 'studio.write')
  assert.equal(runSnapshot.tools[0]?.pluginId, 'studio.plugin')
  assert.equal(runSnapshot.tools[0]?.mcpServerId, 'studio-mcp')
  assert.deepEqual(runSnapshot.tools[0]?.errorCodes, ['WRITE_FAILED'])
  assert.deepEqual(runSnapshot.tools[0]?.requiresSkills, ['skill_writer'])
  assert.equal(runSnapshot.pluginCatalog?.skillCount, 1)
  assert.equal(runSnapshot.pluginCatalog?.metadata?.catalogVersion, 'catalog-v1')
  assert.deepEqual(runSnapshot.warnings, ['optional pack missing'])
})

test('RuntimeCatalogSnapshotRegistry keeps in-flight run snapshots stable across current replacements', () => {
  const first = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })
  const second = buildRuntimeCatalogSnapshot({
    id: 'catalog_2',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })
  const registry = new RuntimeCatalogSnapshotRegistry(first)

  assert.equal(registry.captureRun('run_1'), first)
  registry.replaceCurrent(second)

  assert.equal(registry.current, second)
  assert.equal(registry.getForRun('run_1'), first)
  assert.equal(registry.getForRun('run_2'), second)

  registry.deleteRun('run_1')
  assert.equal(registry.getForRun('run_1'), second)
})

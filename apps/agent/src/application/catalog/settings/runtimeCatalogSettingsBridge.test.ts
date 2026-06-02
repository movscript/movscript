import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import { InMemoryAgentCatalogStateStore } from '../../../catalog/registry/state/catalogState.js'
import type { AgentConfigFile, CatalogRegistry, SkillDefinition, ToolDefinition } from '../../../catalog/registry/shared/types.js'
import { applyCatalogStateToLayeredRegistry, createRuntimeCatalogSettingsBridge } from './runtimeCatalogSettingsBridge.js'

test('createRuntimeCatalogSettingsBridge persists active config file tool permissions and approval defaults', () => {
  const calls: string[] = []
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  const writerConfigFile: AgentConfigFile = {
    ...configFile('config_file_writer', 'Writer Config File', '2.0.0', [
      { name: 'draft_apply_preview', mode: 'allow', approval: 'never' },
    ]),
    approvalDefaults: { draft: 'on_write' },
  }
  catalogStateStore.save({
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: { managedConfigFiles: [writerConfigFile] as never },
  })
  let activeAgentManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'movscript.config_file.base',
    version: '1.0.0',
    name: 'Base Config File',
    tools: [
      { name: 'draft_apply_preview', mode: 'allow', approval: 'never' },
      { name: 'core_memory_delete', mode: 'allow', approval: 'on_write' },
    ],
    metadata: { configFileId: 'movscript.config_file.base' },
  }
  let layeredRegistry = registry({
    configFiles: [
      configFile('movscript.config_file.base', 'Base Config File', '1.0.0', activeAgentManifest.tools),
      writerConfigFile,
    ],
    tools: [tool('draft_apply_preview', 'draft')],
  })
  const bridge = createRuntimeCatalogSettingsBridge({
    getState: () => ({ activeAgentManifest, layeredRegistry }),
    setActiveAgentManifest: (manifest) => {
      calls.push(`manifest:${manifest.id}`)
      activeAgentManifest = manifest
    },
    setLayeredRegistry: (registry) => {
      calls.push('registry')
      layeredRegistry = registry
    },
    catalogStateStore,
    catalogSnapshotBridge: {
      createSnapshot: () => {
        calls.push('snapshot')
        return { id: 'snapshot' } as never
      },
    } as never,
    catalogSnapshots: {
      replaceCurrent: () => calls.push('replaceCurrent'),
    } as never,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const configFileManifest = bridge.setActiveAgentConfigFile({ configFileId: 'config_file_writer' })
  assert.equal(configFileManifest.id, 'config_file_writer')
  assert.equal(configFileManifest.metadata?.configFileId, 'config_file_writer')
  assert.deepEqual(configFileManifest.tools, [{ name: 'draft_apply_preview', mode: 'allow', approval: 'on_write' }])
  assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)

  const permissionsManifest = bridge.saveConfigFileToolPermissions({
    configFileId: 'config_file_writer',
    toolGrants: [{ name: 'draft_apply_preview', mode: 'deny' }],
  })
  assert.equal(permissionsManifest.metadata?.toolPermissionOverridesByConfigFile, undefined)
  assert.deepEqual(permissionsManifest.tools, [{ name: 'draft_apply_preview', mode: 'deny', approval: 'on_write' }])
  assert.deepEqual(catalogStateStore.load().metadata?.managedConfigFiles, [{
    ...writerConfigFile,
    toolGrants: [{ name: 'draft_apply_preview', mode: 'deny', approval: 'on_write' }],
  }])
  assert.throws(
    () => bridge.saveConfigFileToolPermissions({
      configFileId: 'config_file_writer',
      toolGrants: [{ name: 'draft_apply_preview', mode: 'allow', approval: 'never' }],
    }),
    /tool draft_apply_preview approval cannot be weaker than config file config_file_writer/,
  )
  const activeManifest = bridge.setActiveAgentConfigFile({ configFileId: 'movscript.config_file.base' })
  assert.deepEqual(activeManifest.tools, [
    { name: 'draft_apply_preview', mode: 'allow', approval: 'never' },
    { name: 'core_memory_delete', mode: 'allow', approval: 'on_write' },
  ])
  assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)
  assert.deepEqual(calls, [
    'manifest:config_file_writer',
    'snapshot',
    'replaceCurrent',
    'registry',
    'manifest:config_file_writer',
    'snapshot',
    'replaceCurrent',
    'manifest:movscript.config_file.base',
    'snapshot',
    'replaceCurrent',
  ])
})

test('createRuntimeCatalogSettingsBridge edits skill instructions and validates config file skill selection', () => {
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  let activeAgentManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'movscript.config_file.base',
    version: '1.0.0',
    name: 'Base Config File',
    tools: [],
  }
  let layeredRegistry = registry({
    skills: [
      skill('studio.settings_test', { enabled: true, triggers: [], toolGrants: [] }),
      skill('studio.rules.dependency_test', { enabled: true }),
      skill('studio.rules.dependent_test', { enabled: true, dependencies: ['studio.rules.dependency_test'] }),
      skill('studio.rules.conflict_test', { enabled: true, conflicts: ['studio.settings_test'] }),
      skill('studio.rules.core_test', { enabled: true, loadMode: 'core' }),
    ],
  })
  const bridge = createRuntimeCatalogSettingsBridge({
    getState: () => ({ activeAgentManifest, layeredRegistry }),
    setActiveAgentManifest: (manifest) => { activeAgentManifest = manifest },
    setLayeredRegistry: (registry) => { layeredRegistry = registry },
    catalogStateStore,
    catalogSnapshotBridge: { createSnapshot: () => ({ id: 'snapshot' }) as never } as never,
    catalogSnapshots: { replaceCurrent: () => undefined } as never,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const editedRegistry = bridge.saveSkillInstructions({ skills: [{ id: 'studio.settings_test', instructionTemplate: 'Edited task instruction.' }] })
  assert.equal(editedRegistry.skills.get('studio.settings_test')?.instructionTemplate, 'Edited task instruction.')
  assert.equal(editedRegistry.skills.get('studio.settings_test')?.enabled, true)
  assert.deepEqual(catalogStateStore.load().metadata?.skillInstructionOverrides, [{
    id: 'studio.settings_test',
    instructionTemplate: 'Edited task instruction.',
  }])
  assert.throws(
    () => bridge.saveSkillInstructions({ skills: [{ id: 'studio.rules.core_test', enabled: false }] }),
    /enabled belongs to config file skillIds/,
  )
  assert.throws(
    () => bridge.saveAgentConfigFile({
      configFile: {
        ...configFile('config_file_invalid_dependency', 'Invalid Dependency', '1.0.0', []),
        skillIds: ['studio.rules.dependent_test'],
      },
    }),
    /config file skill .* requires config file skill/,
  )
  assert.throws(
    () => bridge.saveAgentConfigFile({
      configFile: {
        ...configFile('config_file_invalid_conflict', 'Invalid Conflict', '1.0.0', []),
        skillIds: ['studio.settings_test', 'studio.rules.conflict_test'],
      },
    }),
    /config file skill .* conflicts with config file skill/,
  )
  const saved = bridge.saveAgentConfigFile({
    configFile: {
      ...configFile('config_file_valid_skills', 'Valid Skills', '1.0.0', []),
      skillIds: ['studio.rules.dependency_test', 'studio.rules.dependent_test'],
    },
  })
  assert.deepEqual(saved.configFile.skillIds, ['studio.rules.dependency_test', 'studio.rules.dependent_test'])
  assert.deepEqual(
    (catalogStateStore.load().metadata?.managedConfigFiles as AgentConfigFile[] | undefined)?.find((configFile) => configFile.id === 'config_file_valid_skills')?.skillIds,
    ['studio.rules.dependency_test', 'studio.rules.dependent_test'],
  )
})

test('createRuntimeCatalogSettingsBridge manages user-created config files in catalog state', () => {
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  let activeAgentManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'movscript.config_file.base',
    version: '1.0.0',
    name: 'Base Config File',
    tools: [],
    metadata: { configFileId: 'movscript.config_file.base' },
  }
  let layeredRegistry = registry({
    configFiles: [configFile('movscript.config_file.base', 'Base Config File', '1.0.0', [])],
    tools: [tool('draft_apply_preview', 'draft')],
  })
  const bridge = createRuntimeCatalogSettingsBridge({
    getState: () => ({ activeAgentManifest, layeredRegistry }),
    setActiveAgentManifest: (manifest) => { activeAgentManifest = manifest },
    setLayeredRegistry: (registry) => { layeredRegistry = registry },
    catalogStateStore,
    catalogSnapshotBridge: { createSnapshot: () => ({ id: 'snapshot' }) as never } as never,
    catalogSnapshots: { replaceCurrent: () => undefined } as never,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const saved = bridge.saveAgentConfigFile({
    activate: true,
    configFile: {
      schema: 'movscript.agent.config_file.v1',
      id: 'config_file_storyboard',
      version: '1.0.0',
      name: 'Storyboard Config',
      enabledPackIds: [],
      skillIds: [],
      approvalDefaults: { write: 'on_write' },
      toolGrants: [],
    },
  })

  assert.equal(saved.configFile.id, 'config_file_storyboard')
  assert.deepEqual(saved.configFile.approvalDefaults, { write: 'on_write' })
  assert.equal(saved.activeAgentManifest.metadata?.configFileId, 'config_file_storyboard')
  assert.equal(layeredRegistry.configFiles.has('config_file_storyboard'), true)
  assert.deepEqual(catalogStateStore.load().metadata?.managedConfigFiles, [saved.configFile])
  assert.equal(
    applyCatalogStateToLayeredRegistry(registry(), catalogStateStore.load()).configFiles.has('config_file_storyboard'),
    true,
  )

  const savedInactive = bridge.saveAgentConfigFile({
    activate: false,
    configFile: {
      schema: 'movscript.agent.config_file.v1',
      id: 'config_file_review',
      version: '1.0.0',
      name: 'Review Config',
      enabledPackIds: [],
      skillIds: [],
      approvalDefaults: { destructive: 'always' },
      toolGrants: [{ name: 'draft_apply_preview', mode: 'allow', approval: 'on_write' }],
    },
  })
  assert.equal(savedInactive.activeAgentManifest.metadata?.configFileId, 'config_file_storyboard')
  assert.deepEqual(
    catalogStateStore.load().metadata?.managedConfigFiles,
    [saved.configFile, savedInactive.configFile],
  )

  const inactivePermissionsManifest = bridge.saveConfigFileToolPermissions({
    configFileId: 'config_file_review',
    toolGrants: [{ name: 'draft_apply_preview', mode: 'deny', approval: 'on_write' }],
  })
  assert.equal(inactivePermissionsManifest.metadata?.configFileId, 'config_file_storyboard')
  assert.deepEqual(inactivePermissionsManifest.tools, [])
  const savedInactiveWithPermissions = {
    ...savedInactive.configFile,
    toolGrants: [{ name: 'draft_apply_preview', mode: 'deny', approval: 'on_write' }],
  }
  assert.deepEqual(catalogStateStore.load().metadata?.managedConfigFiles, [saved.configFile, savedInactiveWithPermissions])
  assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)

  assert.throws(
    () => bridge.deleteAgentConfigFile({ configFileId: 'config_file_storyboard' }),
    /cannot delete active config file/,
  )

  bridge.setActiveAgentConfigFile({ configFileId: 'movscript.config_file.base' })
  const deleted = bridge.deleteAgentConfigFile({ configFileId: 'config_file_storyboard' })
  assert.equal(deleted.configFiles.some((configFile) => configFile.id === 'config_file_storyboard'), false)
  assert.deepEqual(catalogStateStore.load().metadata?.managedConfigFiles, [savedInactiveWithPermissions])
  assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)

  const deletedInactive = bridge.deleteAgentConfigFile({ configFileId: 'config_file_review' })
  assert.equal(deletedInactive.activeAgentManifest.metadata?.configFileId, 'movscript.config_file.base')
  assert.equal(deletedInactive.configFiles.some((configFile) => configFile.id === 'config_file_review'), false)
  assert.deepEqual(catalogStateStore.load().metadata?.managedConfigFiles, [])
  assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)
})

function configFile(id: string, name: string, version: string, toolGrants: AgentConfigFile['toolGrants']): AgentConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    enabledPackIds: [],
    skillIds: [],
    toolGrants,
  }
}

function tool(name: string, risk: ToolDefinition['risk']): ToolDefinition {
  return {
    name,
    description: name,
    inputSchema: { type: 'object' },
    permission: `${risk}.test`,
    risk,
    projectScoped: false,
    defaults: { grant: 'allow', approval: 'never' },
    execution: {
      readOnly: risk === 'read',
      destructive: risk === 'destructive',
      concurrencySafe: risk === 'read',
      interruptBehavior: risk === 'read' ? 'cancel' : 'block',
    },
    source: 'runtime',
  }
}

function skill(
  id: string,
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    id,
    version: '1.0.0',
    name: id,
    description: id,
    priority: 0,
    enabled: true,
    instructionTemplate: id,
    ...overrides,
  } as SkillDefinition
}

function registry(input: {
  configFiles?: AgentConfigFile[]
  skills?: SkillDefinition[]
  tools?: ToolDefinition[]
} = {}): CatalogRegistry {
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map((input.tools ?? []).map((item) => [item.name, item])),
    skills: new Map((input.skills ?? []).map((item) => [item.id, item])),
    packs: new Map(),
    configFiles: new Map((input.configFiles ?? []).map((item) => [item.id, item])),
  }
}

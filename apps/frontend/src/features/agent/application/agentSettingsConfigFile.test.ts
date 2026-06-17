import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildActivateConfigFilePlan,
  buildBlankConfigFileSavePlan,
  buildConfigFileDetailsSavePlan,
  buildConfigFileRollbackBackupFromConfigFile,
  buildConfigFileRollbackRestorePlan,
  buildDeleteConfigFilePlan,
  buildDuplicateConfigFileSavePlan,
  buildImportedConfigFileSavePlan,
  buildSettingsSnapshotWritePlan,
  buildSkillConfigFileSavePlan,
  buildToolPermissionsConfigFileSavePlan,
  commitProviderConfigFilePlan,
  commitSettingsSnapshotWritePlan,
  configFileExportFilename,
  configFileExportText,
  configFileFileSizeError,
  parseManagedConfigFileExportText,
  settingsSnapshotImportPreflightError,
} from '@/features/agent/application/agentSettingsConfigFile'
import type { ProviderCatalogConfigFile } from '@/shared/infrastructure/providerSessionClient'
import type { AgentSettingsSnapshot } from '@movscript/core/agent'

const t = (key: string, values?: Record<string, string | number>) => values ? `${key}:${JSON.stringify(values)}` : key

test('config file export helpers build stable filenames and payload text', () => {
  const configFile = configFileFixture({ name: 'Main / Write: Tools?' })

  assert.equal(
    configFileExportFilename(configFile, new Date('2026-06-15T08:30:00.000Z')),
    'agent-config-file-Main-Write-Tools--2026-06-15.json',
  )
  assert.match(configFileExportText(configFile), /"schema": "movscript.agent.config_file.v1"/)
})

test('config file import helpers reject oversized files before parsing', () => {
  assert.equal(configFileFileSizeError({ size: 4, maxBytes: 4, t }), null)
  assert.match(configFileFileSizeError({ size: 5, maxBytes: 4, t }) ?? '', /configFileTooLarge/)
})

test('config file import helpers mark parsed exports as managed', () => {
  const parsed = parseManagedConfigFileExportText(configFileExportText(configFileFixture()))

  assert.equal(parsed.id, 'config_file.test')
  assert.equal(parsed.metadata?.managed, true)
})

test('config file save plans duplicate and create managed active files', () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const duplicatePlan = buildDuplicateConfigFileSavePlan({
    sourceConfigFile: current,
    currentConfigFile: current,
    configFiles: [current],
    copySuffix: 'Copy',
  })

  assert.equal(duplicatePlan?.configFile.id, 'config_file.base.copy')
  assert.equal(duplicatePlan?.configFile.name, 'Base Copy')
  assert.equal(duplicatePlan?.activate, true)
  assert.equal(duplicatePlan?.selectedConfigFileId, 'config_file.base.copy')
  assert.equal(duplicatePlan?.rollbackBackup?.configFile.id, 'config_file.base')

  const blankPlan = buildBlankConfigFileSavePlan({
    currentConfigFile: current,
    configFiles: [current, configFileFixture({ id: 'config_file.custom' })],
    name: 'New Config',
  })
  assert.equal(blankPlan.configFile.id, 'config_file.custom.2')
  assert.equal(blankPlan.configFile.name, 'New Config')
  assert.equal(blankPlan.activate, true)
  assert.equal(blankPlan.selectedConfigFileId, 'config_file.custom.2')
})

test('config file save plans prepare imported and edited files', () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const imported = configFileFixture({ id: 'config_file.imported', name: 'Imported' })
  const importPlan = buildImportedConfigFileSavePlan({ configFile: imported, currentConfigFile: current })

  assert.equal(importPlan.configFile.id, 'config_file.imported')
  assert.equal(importPlan.activate, true)
  assert.equal(importPlan.selectedConfigFileId, 'config_file.imported')
  assert.equal(importPlan.rollbackBackup?.configFile.id, 'config_file.base')

  const detailsPlan = buildConfigFileDetailsSavePlan({
    selectedConfigFile: current,
    currentConfigFile: current,
    name: 'Base Edited',
    description: '',
    limits: { maxToolCalls: 6 },
    approvalDefaults: { write: 'on_write' },
  })
  assert.equal(detailsPlan.configFile.name, 'Base Edited')
  assert.equal(detailsPlan.configFile.description, undefined)
  assert.equal(detailsPlan.configFile.limits?.maxToolCalls, 6)
  assert.equal(detailsPlan.configFile.approvalDefaults?.write, 'on_write')
  assert.equal(detailsPlan.activate, true)
  assert.equal(detailsPlan.selectedConfigFileId, 'config_file.base')
})

test('config file delete plan selects the active config after deleting a managed file', () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const selected = configFileFixture({ id: 'config_file.custom', name: 'Custom' })
  const plan = buildDeleteConfigFilePlan({ selectedConfigFile: selected, currentConfigFile: current })

  assert.equal(plan.configFileId, 'config_file.custom')
  assert.equal(plan.selectedConfigFileId, 'config_file.base')
  assert.equal(plan.rollbackBackup?.configFile.id, 'config_file.custom')
  assert.equal(plan.rollbackBackup?.activeConfigFileId, 'config_file.base')
})

test('config file activate plan preserves active config rollback metadata', () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const plan = buildActivateConfigFilePlan({
    configFileId: 'config_file.custom',
    currentConfigFile: current,
  })

  assert.equal(plan.configFileId, 'config_file.custom')
  assert.equal(plan.selectedConfigFileId, 'config_file.custom')
  assert.equal(plan.rollbackBackup?.configFile.id, 'config_file.base')
  assert.equal(plan.rollbackBackup?.activeConfigFileId, 'config_file.base')
})

test('provider config file commit plan runs save, refetches catalogs, and returns rollback backup', async () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const savePlan = buildBlankConfigFileSavePlan({
    currentConfigFile: current,
    configFiles: [current],
    name: 'New Config',
  })
  const calls: string[] = []
  const result = await commitProviderConfigFilePlan({
    client: fakeConfigFileCommitClient(calls),
    plan: { operation: 'save', ...savePlan },
    refetchCatalog: async () => calls.push('refetchCatalog'),
    refetchCapabilities: async () => calls.push('refetchCapabilities'),
  })

  assert.deepEqual(calls, [
    'ensureRunning',
    'save:config_file.custom:true',
    'refetchCatalog',
    'refetchCapabilities',
  ])
  assert.equal(result.selectedConfigFileId, 'config_file.custom')
  assert.equal(result.backup?.configFile.id, 'config_file.base')
})

test('provider config file commit plan runs delete and activate operations', async () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base' })
  const selected = configFileFixture({ id: 'config_file.custom', name: 'Custom' })
  const calls: string[] = []

  await commitProviderConfigFilePlan({
    client: fakeConfigFileCommitClient(calls),
    plan: { operation: 'delete', ...buildDeleteConfigFilePlan({ selectedConfigFile: selected, currentConfigFile: current }) },
    refetchCatalog: async () => calls.push('refetchCatalog'),
  })
  await commitProviderConfigFilePlan({
    client: fakeConfigFileCommitClient(calls),
    plan: { operation: 'activate', ...buildActivateConfigFilePlan({ configFileId: selected.id, currentConfigFile: current }) },
    refetchCatalog: async () => calls.push('refetchCatalog'),
  })

  assert.deepEqual(calls, [
    'ensureRunning',
    'delete:config_file.custom',
    'refetchCatalog',
    'ensureRunning',
    'activate:config_file.custom',
    'refetchCatalog',
  ])
})

test('skill config save plan only writes changed skill selections', () => {
  const current = configFileFixture({ id: 'config_file.base', name: 'Base', skillIds: ['old'] })

  assert.equal(buildSkillConfigFileSavePlan({
    selectedConfigFile: current,
    currentConfigFile: current,
    skillIds: ['old'],
    hasSelectionChange: false,
  }), null)

  const plan = buildSkillConfigFileSavePlan({
    selectedConfigFile: current,
    currentConfigFile: current,
    skillIds: ['new', 'enabled'],
    hasSelectionChange: true,
  })
  assert.deepEqual(plan?.configFile.skillIds, ['new', 'enabled'])
  assert.equal(plan?.configFile.metadata?.managed, true)
  assert.equal(plan?.activate, true)
  assert.equal(plan?.rollbackBackup?.configFile.skillIds[0], 'old')
  assert.equal(plan?.selectedConfigFileId, 'config_file.base')
})

test('tool permissions save plan writes normalized grants and rollback metadata', () => {
  const current = configFileFixture({
    id: 'config_file.base',
    name: 'Base',
    toolGrants: [{ name: 'read', mode: 'allow' }],
  })

  const plan = buildToolPermissionsConfigFileSavePlan({
    selectedConfigFile: current,
    currentConfigFile: null,
    toolGrants: [
      { name: 'write', mode: 'deny', approval: 'on_write' },
      { name: 'read', mode: 'allow' },
    ],
  })

  assert.equal(plan.activate, false)
  assert.deepEqual(plan.configFile.toolGrants, [
    { name: 'write', mode: 'deny', approval: 'on_write' },
    { name: 'read', mode: 'allow' },
  ])
  assert.equal(plan.configFile.metadata?.managed, true)
  assert.equal(plan.rollbackBackup?.configFile.toolGrants[0]?.name, 'read')
  assert.equal(plan.selectedConfigFileId, 'config_file.base')
})

test('settings snapshot import preflight reports invalid snapshots and empty import scopes', () => {
  assert.equal(settingsSnapshotImportPreflightError({
    parsedSnapshot: null,
    validationError: null,
    hasSelectedImportScope: false,
    selectedSnapshot: null,
    t,
    currentConfigFile: null,
  }), null)

  assert.match(settingsSnapshotImportPreflightError({
    parsedSnapshot: settingsSnapshotFixture(),
    validationError: 'bad json',
    hasSelectedImportScope: true,
    selectedSnapshot: settingsSnapshotFixture(),
    t,
    currentConfigFile: null,
  }) ?? '', /settingsSnapshotInvalid/)

  assert.match(settingsSnapshotImportPreflightError({
    parsedSnapshot: settingsSnapshotFixture(),
    validationError: null,
    hasSelectedImportScope: false,
    selectedSnapshot: null,
    t,
    currentConfigFile: null,
  }) ?? '', /settingsSnapshotImportScopeEmpty/)
})

test('settings snapshot import preflight delegates catalog requirements', () => {
  const snapshot = settingsSnapshotFixture({
    activeConfigFileId: 'config_file.base',
    configFiles: [configFileFixture({ id: 'config_file.base' })],
  })

  assert.match(settingsSnapshotImportPreflightError({
    parsedSnapshot: snapshot,
    validationError: null,
    hasSelectedImportScope: true,
    selectedSnapshot: snapshot,
    t,
    currentConfigFile: null,
  }) ?? '', /settingsSnapshotCatalogUnavailable/)
})

test('settings snapshot write plan combines provider model and config file writes', () => {
  const snapshot = settingsSnapshotFixture({
    model: {
      model: 'gpt-deep',
      apiKind: 'openai_responses',
      useForChat: true,
      useForPlanner: false,
    },
    activeConfigFileId: 'config_file.base',
    configFiles: [configFileFixture({ id: 'config_file.base', name: 'Base' })],
  })

  const plan = buildSettingsSnapshotWritePlan({
    snapshot,
    currentConfigFile: null,
    t,
  })

  assert.equal(plan.providerModelConfig?.model, 'gpt-deep')
  assert.equal(plan.providerModelConfig?.useForPlanner, false)
  assert.equal(plan.requiresProviderSession, true)
  assert.equal(plan.writesProviderCatalog, true)
  assert.equal(plan.writes[0]?.configFile.id, 'config_file.base')
  assert.equal(plan.writes[0]?.activate, true)
})

test('settings snapshot write plan can update only provider model config', () => {
  const plan = buildSettingsSnapshotWritePlan({
    snapshot: settingsSnapshotFixture({
      model: {
        model: 'manual-model',
        baseURL: 'https://example.test/v1',
      },
    }),
    currentConfigFile: null,
    t,
  })

  assert.equal(plan.providerModelConfig?.model, 'manual-model')
  assert.equal(plan.providerModelConfig?.baseURL, 'https://example.test/v1')
  assert.equal(plan.requiresProviderSession, false)
  assert.equal(plan.writesProviderCatalog, false)
  assert.equal(plan.writes.length, 0)
})

test('settings snapshot write commit saves provider model config and refetches model config', async () => {
  const plan = buildSettingsSnapshotWritePlan({
    snapshot: settingsSnapshotFixture({
      model: {
        model: 'manual-model',
        baseURL: 'https://example.test/v1',
      },
    }),
    currentConfigFile: null,
    t,
  })
  const calls: string[] = []

  await commitSettingsSnapshotWritePlan({
    client: fakeConfigFileCommitClient(calls),
    plan,
    refetchProviderModelConfig: async () => calls.push('refetchProviderModelConfig'),
    refetchCatalog: async () => calls.push('refetchCatalog'),
    refetchCapabilities: async () => calls.push('refetchCapabilities'),
  })

  assert.deepEqual(calls, [
    'saveModel:manual-model',
    'refetchProviderModelConfig',
  ])
})

test('settings snapshot write commit saves catalog writes, activates snapshot target, and refetches shared data', async () => {
  const current = configFileFixture({ id: 'config_file.current', name: 'Current' })
  const snapshot = settingsSnapshotFixture({
    activeConfigFileId: 'config_file.target',
    configFiles: [configFileFixture({ id: 'config_file.target', name: 'Target' })],
    model: { model: 'gpt-deep' },
  })
  const plan = buildSettingsSnapshotWritePlan({
    snapshot,
    currentConfigFile: current,
    t,
  })
  const calls: string[] = []

  await commitSettingsSnapshotWritePlan({
    client: fakeConfigFileCommitClient(calls),
    plan,
    refetchProviderModelConfig: async () => calls.push('refetchProviderModelConfig'),
    refetchCatalog: async () => calls.push('refetchCatalog'),
    refetchCapabilities: async () => calls.push('refetchCapabilities'),
  })

  assert.deepEqual(calls, [
    'ensureRunning',
    'saveModel:gpt-deep',
    'save:config_file.target:true',
    'refetchProviderModelConfig',
    'refetchCatalog',
    'refetchCapabilities',
  ])
})

test('config file rollback restore plan restores backup and preserves current catalog version as next backup', () => {
  const current = configFileFixture({ id: 'config_file.test', name: 'Current Version' })
  const backup = buildConfigFileRollbackBackupFromConfigFile(
    configFileFixture({ id: 'config_file.test', name: 'Backup Version' }),
    'config_file.test',
  )

  const plan = buildConfigFileRollbackRestorePlan({
    backup,
    configFiles: [current],
    selectedConfigFile: configFileFixture({ id: 'config_file.other', name: 'Selected Fallback' }),
    currentConfigFile: current,
  })

  assert.equal(plan?.configFile.name, 'Backup Version')
  assert.equal(plan?.activate, true)
  assert.equal(plan?.selectedConfigFileId, 'config_file.test')
  assert.equal(plan?.nextBackup?.configFile.name, 'Current Version')
  assert.equal(plan?.nextBackup?.activeConfigFileId, 'config_file.test')
})

test('provider config file commit plan returns restore next backup', async () => {
  const current = configFileFixture({ id: 'config_file.test', name: 'Current Version' })
  const backup = buildConfigFileRollbackBackupFromConfigFile(
    configFileFixture({ id: 'config_file.test', name: 'Backup Version' }),
    'config_file.test',
  )
  const restorePlan = buildConfigFileRollbackRestorePlan({
    backup,
    configFiles: [current],
    selectedConfigFile: null,
    currentConfigFile: current,
  })
  assert.ok(restorePlan)
  const calls: string[] = []

  const result = await commitProviderConfigFilePlan({
    client: fakeConfigFileCommitClient(calls),
    plan: { operation: 'restore', ...restorePlan },
    refetchCatalog: async () => calls.push('refetchCatalog'),
    refetchCapabilities: async () => calls.push('refetchCapabilities'),
  })

  assert.deepEqual(calls, [
    'ensureRunning',
    'save:config_file.test:true',
    'refetchCatalog',
    'refetchCapabilities',
  ])
  assert.equal(result.selectedConfigFileId, 'config_file.test')
  assert.equal(result.backup?.configFile.name, 'Current Version')
})

test('config file rollback restore plan falls back to selected config when catalog version is missing', () => {
  const selected = configFileFixture({ id: 'config_file.selected', name: 'Selected Version' })
  const current = configFileFixture({ id: 'config_file.current', name: 'Current Active' })
  const backup = buildConfigFileRollbackBackupFromConfigFile(
    configFileFixture({ id: 'config_file.deleted', name: 'Deleted Backup' }),
    'config_file.current',
  )

  const plan = buildConfigFileRollbackRestorePlan({
    backup,
    configFiles: [],
    selectedConfigFile: selected,
    currentConfigFile: current,
  })

  assert.equal(plan?.configFile.name, 'Deleted Backup')
  assert.equal(plan?.activate, false)
  assert.equal(plan?.nextBackup?.configFile.name, 'Selected Version')
  assert.equal(plan?.nextBackup?.activeConfigFileId, 'config_file.current')
})

function fakeConfigFileCommitClient(calls: string[]) {
  return {
    async ensureRunning() {
      calls.push('ensureRunning')
      return { ok: true, service: 'test', mode: 'test' }
    },
    async saveProviderConfigFile({ configFile, activate }: { configFile: ProviderCatalogConfigFile; activate: boolean }) {
      calls.push(`save:${configFile.id}:${String(activate)}`)
    },
    async saveProviderModelConfig({ model }: { model: string }) {
      calls.push(`saveModel:${model}`)
    },
    async saveActiveProviderConfigFile({ configFileId }: { configFileId: string }) {
      calls.push(`activate:${configFileId}`)
    },
    async deleteProviderConfigFile({ configFileId }: { configFileId: string }) {
      calls.push(`delete:${configFileId}`)
    },
  }
}

function configFileFixture(patch: Partial<ProviderCatalogConfigFile> = {}): ProviderCatalogConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id: 'config_file.test',
    version: '1.0.0',
    name: 'Test Config',
    enabledPackIds: [],
    skillIds: [],
    toolGrants: [],
    ...patch,
  }
}

function settingsSnapshotFixture(patch: Partial<AgentSettingsSnapshot> = {}): AgentSettingsSnapshot {
  return {
    schema: 'movscript.agent.settings.snapshot.v1',
    schemaVersion: 1,
    schemaUrl: 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json',
    exportedAt: '2026-06-15T00:00:00.000Z',
    ...patch,
  }
}

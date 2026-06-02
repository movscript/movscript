import assert from 'node:assert/strict'
import test from 'node:test'
import { appendSettingsAuditEntry, normalizeAgentSettings, useAgentStore } from './agentStore'

test('agent store persistence excludes conversations and workspaces', () => {
  const partialized = useAgentStore.persist.getOptions().partialize?.(useAgentStore.getState()) as Record<string, unknown>

  assert.equal('convsByUser' in partialized, false)
  assert.equal('convsByUser' in useAgentStore.getState(), false)
})

test('normalizeAgentSettings preserves valid planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 4,
    planMaxTaskAttempts: 3,
    planWorkerTimeoutMs: 60 * 60_000,
  })

  assert.equal(settings.planMaxWorkers, 4)
  assert.equal(settings.planMaxTaskAttempts, 3)
  assert.equal(settings.planWorkerTimeoutMs, 60 * 60_000)
})

test('normalizeAgentSettings falls back from invalid persisted planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 99,
    planMaxTaskAttempts: 0,
    planWorkerTimeoutMs: 1234,
  })

  assert.equal(settings.planMaxWorkers, 2)
  assert.equal(settings.planMaxTaskAttempts, 2)
  assert.equal(settings.planWorkerTimeoutMs, 15 * 60_000)
})

test('normalizeAgentSettings falls back from invalid persisted base settings', () => {
  const settings = normalizeAgentSettings({
    modelId: 'bad' as unknown as number,
    includeProjectContext: 'yes' as unknown as boolean,
    includeRecentResources: 1 as unknown as boolean,
  })

  assert.equal(settings.modelId, null)
  assert.equal(settings.includeProjectContext, true)
  assert.equal(settings.includeRecentResources, true)
})

test('normalizeAgentSettings accepts numeric persisted model ids', () => {
  assert.equal(normalizeAgentSettings({ modelId: 42 }).modelId, 42)
  assert.equal(normalizeAgentSettings({ modelId: '42' as unknown as number }).modelId, 42)
  assert.equal(normalizeAgentSettings({ modelId: -1 }).modelId, null)
})

test('normalizeAgentSettings normalizes persisted tool permission filter presets', () => {
  const settings = normalizeAgentSettings({
    toolPermissionsFilterPresets: [
      { id: 'writes', name: 'Write risk review', filter: 'write_risk', search: ' generate ' },
      { id: 'writes', name: 'Duplicate', filter: 'available', search: '' },
      { id: 'bad-filter', name: 'Bad filter', filter: 'unknown', search: '' },
      { id: 'approval', name: '', filter: 'requires_approval', search: 'approval'.repeat(30) },
    ],
  } as any)

  assert.deepEqual(settings.toolPermissionsFilterPresets.map((preset) => preset.id), ['writes', 'approval'])
  assert.equal(settings.toolPermissionsFilterPresets[0].name, 'Write risk review')
  assert.equal(settings.toolPermissionsFilterPresets[0].search, 'generate')
  assert.equal(settings.toolPermissionsFilterPresets[1].name, 'requires_approval')
  assert.equal(settings.toolPermissionsFilterPresets[1].search.length, 120)
})

test('normalizeAgentSettings caps persisted tool permission filter presets', () => {
  const settings = normalizeAgentSettings({
    toolPermissionsFilterPresets: Array.from({ length: 20 }, (_, index) => ({
      id: `preset-${index}`,
      name: `Preset ${index}`,
      filter: 'all',
      search: '',
    })),
  } as any)

  assert.equal(settings.toolPermissionsFilterPresets.length, 12)
  assert.equal(settings.toolPermissionsFilterPresets[11].id, 'preset-11')
})

test('normalizeAgentSettings normalizes and caps configuration audit trail', () => {
  const settings = normalizeAgentSettings({
    auditTrail: Array.from({ length: 30 }, (_, index) => ({
      id: index === 0 ? '' : `audit-${index}`,
      action: index === 1 ? '' : 'model_saved',
      target: index === 2 ? 'unknown' : 'model',
      summary: `Saved model ${index}`,
      createdAt: new Date(2026, 0, index + 1).toISOString(),
    })) as any,
  })

  assert.equal(settings.auditTrail.length, 25)
  assert.equal(settings.auditTrail[0].summary, 'Saved model 29')
  assert.equal(settings.auditTrail[0].target, 'model')
  assert.equal(settings.auditTrail.some((entry) => entry.id.length === 0), false)
})

test('normalizeAgentSettings preserves a valid last import backup', () => {
  const settings = normalizeAgentSettings({
    lastImportBackup: {
      text: '{"schema":"movscript.agent.settings.snapshot.v1"}',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  } as any)

  assert.equal(settings.lastImportBackup?.text, '{"schema":"movscript.agent.settings.snapshot.v1"}')
  assert.equal(settings.lastImportBackup?.createdAt, '2026-01-01T00:00:00.000Z')
  assert.equal(normalizeAgentSettings({ lastImportBackup: { text: '', createdAt: 'bad' } } as any).lastImportBackup, null)
})

test('normalizeAgentSettings keeps import backups up to the settings snapshot limit', () => {
  const backupText = `{"schema":"movscript.agent.settings.snapshot.v1","padding":"${'x'.repeat(900_000)}"}`
  const oversizedText = `{"schema":"movscript.agent.settings.snapshot.v1","padding":"${'x'.repeat(1024 * 1024)}"}`
  const oversizedMultibyteText = `{"schema":"movscript.agent.settings.snapshot.v1","padding":"${'界'.repeat(400_000)}"}`

  const settings = normalizeAgentSettings({
    lastImportBackup: {
      text: backupText,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  } as any)

  assert.equal(settings.lastImportBackup?.text, backupText)
  assert.equal(normalizeAgentSettings({
    lastImportBackup: {
      text: oversizedText,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  } as any).lastImportBackup, null)
  assert.equal(normalizeAgentSettings({
    lastImportBackup: {
      text: oversizedMultibyteText,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  } as any).lastImportBackup, null)
})

test('normalizeAgentSettings preserves a valid config file rollback backup', () => {
  const settings = normalizeAgentSettings({
    lastConfigFileBackup: {
      activeConfigFileId: 'config.default',
      createdAt: '2026-01-01T00:00:00.000Z',
      configFile: {
        schema: 'movscript.agent.config_file.v1',
        id: 'config.default',
        version: '1.0.0',
        name: 'Base',
        enabledPackIds: ['core.pack.agent', 'core.pack.agent'],
        skillIds: ['skill.a'],
        toolGrants: [
          { name: 'tool_a', mode: 'allow', approval: 'on_write' },
          { name: 'tool_b', mode: 'invalid' },
        ],
        limits: {
          maxHistoryMessages: '12',
          executionMode: 'deep',
          allowForcedToolCalls: false,
        },
      },
    },
  } as any)

  assert.equal(settings.lastConfigFileBackup?.configFile.id, 'config.default')
  assert.equal(settings.lastConfigFileBackup?.activeConfigFileId, 'config.default')
  assert.deepEqual(settings.lastConfigFileBackup?.configFile.enabledPackIds, ['core.pack.agent'])
  assert.deepEqual(settings.lastConfigFileBackup?.configFile.toolGrants, [{ name: 'tool_a', mode: 'allow', approval: 'on_write' }])
  assert.equal(settings.lastConfigFileBackup?.configFile.limits?.maxHistoryMessages, 12)
  assert.equal(settings.lastConfigFileBackup?.configFile.limits?.executionMode, 'deep')
  assert.equal(settings.lastConfigFileBackup?.configFile.limits?.allowForcedToolCalls, false)
  assert.equal(normalizeAgentSettings({ lastConfigFileBackup: { configFile: { id: '', name: '' }, createdAt: 'bad' } } as any).lastConfigFileBackup, null)
})

test('normalizeAgentSettings defaults missing audit actions to settings changed', () => {
  const settings = normalizeAgentSettings({
    auditTrail: [{
      id: 'audit-missing-action',
      action: '',
      target: 'model',
      summary: 'Changed settings',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  } as any)

  assert.equal(settings.auditTrail.length, 1)
  assert.equal(settings.auditTrail[0].action, 'settings_changed')
})

test('appendSettingsAuditEntry coalesces repeated recent configuration actions', () => {
  const first = appendSettingsAuditEntry([], {
    id: 'audit-1',
    action: 'config_file_saved',
    target: 'config_file',
    summary: 'Saved config file: Default',
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  const second = appendSettingsAuditEntry(first, {
    id: 'audit-2',
    action: 'config_file_saved',
    target: 'config_file',
    summary: 'Saved config file: Default',
    createdAt: '2026-01-01T00:00:05.000Z',
  })
  const third = appendSettingsAuditEntry(second, {
    id: 'audit-3',
    action: 'config_file_saved',
    target: 'config_file',
    summary: 'Saved config file: Default',
    createdAt: '2026-01-01T00:00:20.000Z',
  })

  assert.equal(second.length, 1)
  assert.equal(second[0].id, 'audit-1')
  assert.equal(second[0].createdAt, '2026-01-01T00:00:05.000Z')
  assert.equal(third.length, 2)
  assert.equal(third[0].id, 'audit-3')
})

test('appendSettingsAuditEntry preserves failed configuration operation audits', () => {
  const result = appendSettingsAuditEntry([], {
    id: 'audit-failed',
    action: 'settings_operation_failed',
    target: 'tools',
    summary: `Tool permissions operation failed: ${'x'.repeat(300)}`,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].action, 'settings_operation_failed')
  assert.equal(result[0].target, 'tools')
  assert.equal(result[0].summary.length, 240)
})

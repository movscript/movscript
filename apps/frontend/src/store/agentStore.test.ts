import assert from 'node:assert/strict'
import test from 'node:test'
import { activeRunPresetFromSettings, appendSettingsAuditEntry, defaultAgentRunPresets, normalizeAgentSettings, normalizeConvsByUser, type UserConvState } from './agentStore'

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
    autoPlan: 'auto' as unknown as boolean,
    permissionMode: 'danger' as unknown as any,
  })

  assert.equal(settings.modelId, null)
  assert.equal(settings.includeProjectContext, true)
  assert.equal(settings.includeRecentResources, true)
  assert.equal(settings.autoPlan, true)
  assert.equal(settings.permissionMode, 'ask')
})

test('normalizeAgentSettings accepts numeric persisted model ids', () => {
  assert.equal(normalizeAgentSettings({ modelId: 42 }).modelId, 42)
  assert.equal(normalizeAgentSettings({ modelId: '42' as unknown as number }).modelId, 42)
  assert.equal(normalizeAgentSettings({ modelId: -1 }).modelId, null)
})

test('normalizeAgentSettings restores default run presets for old persisted settings', () => {
  const settings = normalizeAgentSettings({
    activeRunPresetId: 'missing',
    runPresets: [],
  })
  const active = activeRunPresetFromSettings(settings)

  assert.equal(settings.runPresets.length >= 3, true)
  assert.equal(settings.activeRunPresetId, 'safe-review')
  assert.equal(active.maxToolCalls, 8)
  assert.equal(active.maxIterations, 6)
})

test('normalizeAgentSettings preserves valid custom active run preset', () => {
  const settings = normalizeAgentSettings({
    activeRunPresetId: 'custom',
    runPresets: [{
      id: 'custom',
      name: 'Custom',
      description: 'Custom run policy',
      permissionMode: 'suggest',
      autoPlan: true,
      maxToolCalls: 33,
      maxIterations: 17,
      planMaxWorkers: 3,
      planMaxTaskAttempts: 2,
      planWorkerTimeoutMs: 30 * 60_000,
    }],
  })
  const active = activeRunPresetFromSettings(settings)

  assert.equal(settings.activeRunPresetId, 'custom')
  assert.equal(active.permissionMode, 'suggest')
  assert.equal(active.maxToolCalls, 33)
  assert.equal(active.maxIterations, 17)
})

test('normalizeAgentSettings drops duplicate persisted run preset ids', () => {
  const settings = normalizeAgentSettings({
    activeRunPresetId: 'custom',
    runPresets: [
      {
        id: 'custom',
        name: 'Custom A',
        description: 'First preset wins',
        permissionMode: 'ask',
        autoPlan: false,
        maxToolCalls: 11,
        maxIterations: 7,
        planMaxWorkers: 1,
        planMaxTaskAttempts: 1,
        planWorkerTimeoutMs: 5 * 60_000,
      },
      {
        id: 'custom',
        name: 'Custom B',
        description: 'Duplicate should be dropped',
        permissionMode: 'auto',
        autoPlan: true,
        maxToolCalls: 99,
        maxIterations: 99,
        planMaxWorkers: 4,
        planMaxTaskAttempts: 3,
        planWorkerTimeoutMs: 60 * 60_000,
      },
    ],
  })
  const active = activeRunPresetFromSettings(settings)

  assert.deepEqual(settings.runPresets.map((preset) => preset.id), ['custom'])
  assert.equal(active.name, 'Custom A')
  assert.equal(active.maxToolCalls, 11)
})

test('normalizeAgentSettings normalizes persisted tool policy filter presets', () => {
  const settings = normalizeAgentSettings({
    toolPolicyFilterPresets: [
      { id: 'writes', name: 'Write risk review', filter: 'write_risk', search: ' generate ' },
      { id: 'writes', name: 'Duplicate', filter: 'available', search: '' },
      { id: 'bad-filter', name: 'Bad filter', filter: 'unknown', search: '' },
      { id: 'approval', name: '', filter: 'requires_approval', search: 'approval'.repeat(30) },
    ],
  } as any)

  assert.deepEqual(settings.toolPolicyFilterPresets.map((preset) => preset.id), ['writes', 'approval'])
  assert.equal(settings.toolPolicyFilterPresets[0].name, 'Write risk review')
  assert.equal(settings.toolPolicyFilterPresets[0].search, 'generate')
  assert.equal(settings.toolPolicyFilterPresets[1].name, 'requires_approval')
  assert.equal(settings.toolPolicyFilterPresets[1].search.length, 120)
})

test('normalizeAgentSettings caps persisted tool policy filter presets', () => {
  const settings = normalizeAgentSettings({
    toolPolicyFilterPresets: Array.from({ length: 20 }, (_, index) => ({
      id: `preset-${index}`,
      name: `Preset ${index}`,
      filter: 'all',
      search: '',
    })),
  } as any)

  assert.equal(settings.toolPolicyFilterPresets.length, 12)
  assert.equal(settings.toolPolicyFilterPresets[11].id, 'preset-11')
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
    action: 'run_preset_updated',
    target: 'run_preset',
    summary: 'Updated run preset: Balanced',
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  const second = appendSettingsAuditEntry(first, {
    id: 'audit-2',
    action: 'run_preset_updated',
    target: 'run_preset',
    summary: 'Updated run preset: Balanced',
    createdAt: '2026-01-01T00:00:05.000Z',
  })
  const third = appendSettingsAuditEntry(second, {
    id: 'audit-3',
    action: 'run_preset_updated',
    target: 'run_preset',
    summary: 'Updated run preset: Balanced',
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
    summary: `Tool policy operation failed: ${'x'.repeat(300)}`,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].action, 'settings_operation_failed')
  assert.equal(result[0].target, 'tools')
  assert.equal(result[0].summary.length, 240)
})

test('defaultAgentRunPresets returns a defensive copy of built-in run presets', () => {
  const first = defaultAgentRunPresets()
  first[0].name = 'Mutated'
  const second = defaultAgentRunPresets()

  assert.equal(second[0].id, 'safe-review')
  assert.equal(second[0].name, 'Safe Review')
  assert.equal(second.some((preset) => preset.id === 'balanced'), true)
})

test('normalizeConvsByUser preserves historical agent messages and rewrites persisted resource previews', () => {
  const state: Record<string, UserConvState> = {
    '7': {
      activeConversationId: 'conv-1',
      draftsByConversation: {
        'conv-1': {
          input: 'continue',
          attachments: [{
            id: 'draft-res-42',
            name: 'draft.png',
            type: 'image',
            mimeType: 'image/png',
            size: 100,
            resourceId: 42,
            previewUrl: 'blob:stale-draft',
          }],
        },
      },
      conversations: [{
        id: 'conv-1',
        title: 'Agent run',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: 'Output resource: #42',
          timestamp: 1500,
          attachments: [{
            id: 'generated-42',
            name: 'generated.png',
            type: 'image',
            mimeType: 'image/png',
            size: 123,
            url: 'blob:stale-message',
            previewUrl: 'blob:stale-preview',
            resourceId: 42,
          }],
          meta: {
            localRunActivity: {
              runId: 'run-1',
              threadId: 'thread-1',
              status: 'completed',
              createdAt: '2026-05-13T00:00:00.000Z',
              updatedAt: '2026-05-13T00:00:01.000Z',
              steps: [],
              events: [],
            },
          },
        }],
      }],
    },
  }

  const normalized = normalizeConvsByUser(state)
  const message = normalized['7'].conversations[0].messages[0]
  const messageAttachment = message.attachments?.[0]
  const draftAttachment = normalized['7'].draftsByConversation['conv-1'].attachments[0]

  assert.equal(normalized['7'].activeConversationId, 'conv-1')
  assert.equal(message.meta?.localRunActivity?.runId, 'run-1')
  assert.equal(messageAttachment?.url, '/api/v1/resources/42/file')
  assert.equal(messageAttachment?.previewUrl, undefined)
  assert.equal(draftAttachment.url, '/api/v1/resources/42/file')
  assert.equal(draftAttachment.previewUrl, undefined)
})

test('normalizeConvsByUser ignores non-plain persisted conversation records', () => {
  class RuntimeConversation {
    id = 'conv-runtime'
    title = 'Runtime conversation'
    messages = []
    createdAt = 1000
    updatedAt = 1000
  }

  const normalized = normalizeConvsByUser({
    '7': {
      activeConversationId: 'conv-runtime',
      conversations: [new RuntimeConversation()] as unknown as UserConvState['conversations'],
      draftsByConversation: {},
    },
  })

  assert.deepEqual(normalized['7'].conversations, [])
  assert.equal(normalized['7'].activeConversationId, null)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import type { PublicModel } from '@/types'
import type { ProviderCatalogConfigFile, ProviderCatalogSkill } from '@/shared/infrastructure/providerSessionClient'
import {
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
  type AgentSettingsSnapshot,
  buildSettingsSnapshot,
  parseSettingsSnapshot,
  validateSettingsSnapshotReferences,
} from '@/features/agent/domain/agentSettingsSnapshot'

function settingsSnapshotFixture(patch: Partial<AgentSettingsSnapshot>): AgentSettingsSnapshot {
  return {
    schema: 'movscript.agent.settings.snapshot.v1',
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: '2026-05-18T00:00:00.000Z',
    ...patch,
  }
}

test('buildSettingsSnapshot exports model, config files, defaults and config-file-scoped tool overrides', () => {
  const snapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      model: 'gpt-test',
      provider: 'backend-model-config',
      modelConfigId: 7,
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      useForChat: true,
      useForPlanner: false,
      source: 'file',
      apiKeyConfigured: true,
      credentialStatus: { required: true, configured: true, sourceEnv: [], acceptedEnv: [] },
      updatedAt: '2026-05-18T00:00:00.000Z',
      capabilities: [],
    },
    configFileId: 'base',
    configFiles: [configFileFixture({
      id: 'base',
      skillIds: ['skill-a'],
      approvalDefaults: { write: 'on_write' },
      toolGrants: [{ name: 'tool-a', mode: 'allow', approval: 'on_write' }],
      limits: { maxHistoryMessages: 16, maxToolCalls: 9, maxIterations: 4, executionMode: 'compact', allowForcedToolCalls: false },
    })],
    skillConfig: [{ id: 'skill-a', enabled: true }],
    toolPermissionOverrides: [{
      configFileId: 'base',
      toolGrants: [{ name: 'tool-a', mode: 'allow', approval: 'on_write' }],
    }],
  })

  assert.equal(snapshot.schema, 'movscript.agent.settings.snapshot.v1')
  assert.equal(snapshot.schemaVersion, AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION)
  assert.equal(snapshot.schemaUrl, AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL)
  assert.equal(snapshot.model?.model, 'gpt-test')
  assert.equal(snapshot.activeConfigFileId, 'base')
  assert.equal(snapshot.configFiles?.[0].id, 'base')
  assert.equal(snapshot.configFiles?.[0].approvalDefaults?.write, 'on_write')
  assert.equal(snapshot.providerSessionLimits?.maxHistoryMessages, 16)
  assert.equal(snapshot.providerSessionLimits?.maxToolCalls, 9)
  assert.equal(snapshot.providerSessionLimits?.executionMode, 'compact')
  assert.equal(snapshot.providerSessionLimits?.allowForcedToolCalls, false)
  assert.equal(snapshot.runtimeLimits, undefined)
  assert.equal(parseSettingsSnapshot(JSON.stringify(snapshot)).providerSessionLimits?.executionMode, 'compact')
  assert.deepEqual(snapshot.skillConfig?.[0], { id: 'skill-a', enabled: true })
  assert.equal(snapshot.toolPermissionOverrides?.[0].configFileId, 'base')
  assert.equal(snapshot.toolPermissionOverrides?.[0].toolGrants[0]?.approval, 'on_write')
})

test('parseSettingsSnapshot accepts legacy runtime limits as provider-session limits', () => {
  const snapshot = parseSettingsSnapshot(JSON.stringify(settingsSnapshotFixture({
    runtimeLimits: { maxHistoryMessages: 8, executionMode: 'standard' },
  })))

  assert.equal(snapshot.providerSessionLimits?.maxHistoryMessages, 8)
  assert.equal(snapshot.providerSessionLimits?.executionMode, 'standard')
  assert.equal(snapshot.runtimeLimits?.maxHistoryMessages, 8)
})

test('buildSettingsSnapshot strips sensitive model URL credentials and omits secret model ids', () => {
  const urlSnapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      model: 'gpt-test',
      provider: 'backend-model-config',
      apiKind: 'openai_responses',
      baseURL: 'https://user:pass@api.openai.com/v1?api_key=secret&project=demo&signature=sig',
      useForChat: true,
      useForPlanner: false,
      source: 'file',
      apiKeyConfigured: true,
      credentialStatus: { required: true, configured: true, sourceEnv: [], acceptedEnv: [] },
      capabilities: [],
    },
    configFileId: '',
    configFiles: [],
    skillConfig: [],
    toolPermissionOverrides: [],
  })
  assert.equal(urlSnapshot.model?.baseURL, 'https://api.openai.com/v1?project=demo')

  const secretModelSnapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      model: 'sk-proj-exampleSecretValue123456789',
      provider: 'backend-model-config',
      apiKind: 'openai_responses',
      useForChat: true,
      useForPlanner: true,
      source: 'file',
      apiKeyConfigured: true,
      credentialStatus: { required: true, configured: true, sourceEnv: [], acceptedEnv: [] },
      capabilities: [],
    },
    configFileId: '',
    configFiles: [],
    skillConfig: [],
    toolPermissionOverrides: [],
  })
  assert.equal(secretModelSnapshot.model, undefined)
})

test('parseSettingsSnapshot validates duplicate ids and unsupported fields', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      skillConfig: [
        { id: 'skill-a', enabled: true },
        { id: 'skill-a', enabled: false },
      ],
    })),
    /skillConfig 2 id is duplicated/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      toolPermissionOverrides: [
        { configFileId: 'base', toolGrants: [] },
        { configFileId: 'base', toolGrants: [] },
      ],
    })),
    /toolPermissionOverrides 2 configFileId is duplicated/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      toolPermissionOverrides: [{
        configFileId: 'base',
        toolGrants: [
          { name: 'tool-a', mode: 'allow' },
          { name: 'tool-a', mode: 'deny' },
        ],
      }],
    })),
    /toolPermissionOverrides 1 toolGrants 2 name is duplicated/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      toolPermissionOverrides: [{ configFileId: 'base', toolGrants: [{ name: 'tool-a', mode: 'allow', unknown: true }] }],
    })),
    /toolPermissionOverrides 1 toolGrants 1\.unknown is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: { model: 'gpt-test' },
    })),
    /agent settings snapshot\.modelConfig is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      toolPermissions: [],
    })),
    /agent settings snapshot\.toolPermissions is not supported/,
  )
})

test('parseSettingsSnapshot accepts full config files and rejects invalid model data', () => {
  const configFile = configFileFixture({
    id: 'config-file-exported',
    skillIds: ['skill-a'],
    toolGrants: [{ name: 'tool-a', mode: 'allow', approval: 'always' }],
    metadata: { managed: true },
  })

  const snapshot = parseSettingsSnapshot(JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    activeConfigFileId: 'config-file-exported',
    configFiles: [configFile],
  }))
  assert.equal(snapshot.configFiles?.[0].id, 'config-file-exported')
  assert.equal(snapshot.configFiles?.[0].metadata?.managed, true)

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      model: { model: 'gpt-test', useForChat: false, useForPlanner: false },
    })),
    /model must enable at least one route/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      model: { model: 'gpt-test', baseURL: 'https://user:pass@api.openai.com/v1' },
    })),
    /model\.baseURL must not include secret URL credentials/,
  )
})

test('validateSettingsSnapshotReferences validates config-file-scoped tool overrides', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    activeConfigFileId: 'missing-config-file',
    skillConfig: [{ id: 'missing-skill', enabled: true }],
    toolPermissionOverrides: [{ configFileId: 'missing-config-file', toolGrants: [{ name: 'missing-tool', mode: 'allow' }] }],
  }), {
    configFiles: [configFileFixture()],
    currentConfigFile: configFileFixture(),
    skills: [skillFixture('known-skill')],
  })

  const message = issues.map((issue) => issue.message).join('\n')
  assert.match(message, /config file missing-config-file not found/)
  assert.match(message, /skill missing-skill not found/)
  assert.match(message, /tool permission overrides reference missing config file missing-config-file/)
})

test('validateSettingsSnapshotReferences accepts imported config files before they exist in the catalog', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    activeConfigFileId: 'imported-config-file',
    configFiles: [configFileFixture({
      id: 'imported-config-file',
      skillIds: ['known-skill'],
      toolGrants: [{ name: 'write-tool', mode: 'allow', approval: 'always' }],
    })],
    toolPermissionOverrides: [{ configFileId: 'imported-config-file', toolGrants: [{ name: 'write-tool', mode: 'deny', approval: 'always' }] }],
  }), {
    configFiles: [configFileFixture()],
    currentConfigFile: configFileFixture(),
    skills: [skillFixture('known-skill')],
  })

  assert.deepEqual(issues, [])
})

test('validateSettingsSnapshotReferences rejects unsafe skill and tool override changes', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    skillConfig: [
      { id: 'core-skill', enabled: false },
      { id: 'dependent-skill', enabled: true },
    ],
    toolPermissionOverrides: [{ configFileId: 'config-file-default', toolGrants: [{ name: 'write-tool', mode: 'allow', approval: 'never' }] }],
  }), {
    configFiles: [configFileFixture({
      id: 'config-file-default',
      toolGrants: [{ name: 'write-tool', mode: 'allow', approval: 'always' }],
    })],
    currentConfigFile: configFileFixture(),
    skills: [
      skillFixture('core-skill', { loadMode: 'core' }),
      skillFixture('dependency-skill', { enabled: false }),
      skillFixture('dependent-skill', { dependencies: ['dependency-skill'], enabled: false }),
    ],
  })

  const message = issues.map((issue) => issue.message).join('\n')
  assert.match(message, /core skill core-skill cannot be disabled/)
  assert.match(message, /skill dependent-skill depends on unavailable skill dependency-skill/)
  assert.match(message, /tool write-tool approval cannot be weaker/)
})

test('validateSettingsSnapshotReferences rejects missing backend model references', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    model: {
      model: 'model_config:404',
      platformModelId: '404',
      apiKind: 'openai_chat_completions',
    },
  }), {
    textModels: [modelFixture(7)],
    configFiles: [configFileFixture()],
    currentConfigFile: configFileFixture(),
    skills: [],
  })

  assert.match(issues.map((issue) => issue.message).join('\n'), /model model_config:404 not found/)
})

function skillFixture(id: string, patch: Partial<ProviderCatalogSkill> = {}): ProviderCatalogSkill {
  return {
    id,
    name: id,
    description: '',
    enabled: true,
    instruction: '',
    ...patch,
  }
}

function modelFixture(id: number, patch: Partial<PublicModel> = {}): PublicModel {
  return {
    id,
    credential_id: 1,
    model_id: `model_config:${id}`,
    display_name: `Model ${id}`,
    capabilities: ['text'],
    accepts_image_input: false,
    ...patch,
  }
}

function configFileFixture(patch: Partial<ProviderCatalogConfigFile> = {}): ProviderCatalogConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id: 'config-file-default',
    version: '1.0.0',
    name: 'Base',
    enabledPackIds: [],
    skillIds: [],
    toolGrants: [],
    ...patch,
  }
}

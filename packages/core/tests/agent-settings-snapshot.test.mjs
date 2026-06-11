import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
  buildSettingsSnapshot,
  parseSettingsSnapshot,
  validateSettingsSnapshotReferences,
} from '../dist/agent/index.js'

function settingsSnapshotFixture(patch = {}) {
  return {
    schema: 'movscript.agent.settings.snapshot.v1',
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: '2026-05-18T00:00:00.000Z',
    ...patch,
  }
}

test('core settings snapshot exports model, config files, provider-session limits, and scoped tool overrides', () => {
  const snapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      provider: 'backend-model-config',
      modelConfigId: 7,
      model: 'gpt-test',
      apiKind: 'openai_responses',
      baseURL: 'https://api.openai.com/v1',
      apiKeyConfigured: true,
      useForChat: true,
      useForPlanner: false,
      source: 'file',
      credentialStatus: { required: true, configured: true, sourceEnv: [], acceptedEnv: [] },
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

  assert.equal(snapshot.schemaVersion, AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION)
  assert.equal(snapshot.schemaUrl, AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL)
  assert.equal(snapshot.model?.model, 'gpt-test')
  assert.equal(snapshot.model?.platformModelId, '7')
  assert.equal(snapshot.activeConfigFileId, 'base')
  assert.equal(snapshot.configFiles?.[0]?.approvalDefaults?.write, 'on_write')
  assert.equal(snapshot.providerSessionLimits?.maxHistoryMessages, 16)
  assert.equal(snapshot.providerSessionLimits?.executionMode, 'compact')
  assert.equal(snapshot.providerSessionLimits?.allowForcedToolCalls, false)
  assert.equal(snapshot.runtimeLimits, undefined)
  assert.deepEqual(snapshot.skillConfig?.[0], { id: 'skill-a', enabled: true })
  assert.equal(snapshot.toolPermissionOverrides?.[0]?.toolGrants[0]?.approval, 'on_write')
})

test('core settings snapshot accepts legacy runtime limits as provider-session limits', () => {
  const snapshot = parseSettingsSnapshot(JSON.stringify(settingsSnapshotFixture({
    runtimeLimits: { maxHistoryMessages: 8, executionMode: 'standard' },
  })))

  assert.equal(snapshot.providerSessionLimits?.maxHistoryMessages, 8)
  assert.equal(snapshot.providerSessionLimits?.executionMode, 'standard')
  assert.equal(snapshot.runtimeLimits?.maxHistoryMessages, 8)
})

test('core settings snapshot strips URL secrets and omits secret model IDs', () => {
  const urlSnapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      provider: 'backend-model-config',
      model: 'gpt-test',
      apiKind: 'openai_responses',
      baseURL: 'https://user:pass@api.openai.com/v1?api_key=secret&project=demo&signature=sig',
      apiKeyConfigured: true,
      useForChat: true,
      useForPlanner: false,
      source: 'file',
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
      provider: 'backend-model-config',
      model: 'sk-proj-exampleSecretValue123456789',
      apiKind: 'openai_responses',
      apiKeyConfigured: true,
      useForChat: true,
      useForPlanner: true,
      source: 'file',
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

test('core settings snapshot validates duplicate IDs and unsupported fields', () => {
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
      modelConfig: { model: 'gpt-test' },
    })),
    /agent settings snapshot\.modelConfig is not supported/,
  )
})

test('core settings snapshot validates imported references and unsafe changes', () => {
  const accepted = validateSettingsSnapshotReferences(settingsSnapshotFixture({
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
  assert.deepEqual(accepted, [])

  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    skillConfig: [
      { id: 'core-skill', enabled: false },
      { id: 'dependent-skill', enabled: true },
    ],
    toolPermissionOverrides: [{ configFileId: 'config-file-default', toolGrants: [{ name: 'write-tool', mode: 'allow', approval: 'never' }] }],
  }), {
    configFiles: [configFileFixture({
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

test('core settings snapshot validates missing backend model references', () => {
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

function skillFixture(id, patch = {}) {
  return {
    id,
    name: id,
    description: '',
    enabled: true,
    instruction: '',
    ...patch,
  }
}

function modelFixture(id, patch = {}) {
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

function configFileFixture(patch = {}) {
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

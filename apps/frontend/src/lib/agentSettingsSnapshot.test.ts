import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultAgentRunPresets, normalizeAgentSettings } from '@/store/agentStore'
import type { PublicModel } from '@/types'
import type { AgentCatalogProfile, AgentCatalogSkill } from './localAgentClient'
import {
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
  AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
  type AgentSettingsSnapshot,
  buildSettingsSnapshot,
  parseSettingsSnapshot,
  resolveSnapshotRunPresetImport,
  validateSettingsSnapshotReferences,
} from './agentSettingsSnapshot'

function settingsSnapshotFixture(patch: Partial<AgentSettingsSnapshot>): AgentSettingsSnapshot {
  return {
    schema: 'movscript.agent.settings.snapshot.v1',
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: '2026-05-18T00:00:00.000Z',
    ...patch,
  }
}

test('buildSettingsSnapshot exports model, policies, and run presets', () => {
  const runPresets = defaultAgentRunPresets()
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
      updatedAt: '2026-05-18T00:00:00.000Z',
      capabilities: [],
    },
    profileId: 'default',
    skillPolicy: [{ id: 'skill-a', enabled: true }],
    toolPolicy: [{ name: 'tool-a', mode: 'allow', approval: 'on_write' }],
    activeRunPresetId: 'balanced',
    runPresets,
  })

  assert.equal(snapshot.schema, 'movscript.agent.settings.snapshot.v1')
  assert.equal(snapshot.schemaVersion, AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION)
  assert.equal(snapshot.schemaUrl, AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL)
  assert.equal(snapshot.modelConfig?.model, 'gpt-test')
  assert.equal(snapshot.defaultProfileId, 'default')
  assert.equal(snapshot.skillPolicy?.[0].id, 'skill-a')
  assert.equal(snapshot.toolPolicy?.[0].approval, 'on_write')
  assert.equal(snapshot.runPresets?.length, runPresets.length)
})

test('buildSettingsSnapshot strips sensitive model base URL credentials', () => {
  const snapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      model: 'gpt-test',
      provider: 'backend-model-config',
      apiKind: 'openai_responses',
      baseURL: 'https://user:pass@api.openai.com/v1?api_key=secret&project=demo&signature=sig',
      useForChat: true,
      useForPlanner: false,
      source: 'file',
      capabilities: [],
    },
    profileId: '',
    skillPolicy: [],
    toolPolicy: [],
    activeRunPresetId: 'balanced',
    runPresets: defaultAgentRunPresets(),
  })

  assert.equal(snapshot.modelConfig?.baseURL, 'https://api.openai.com/v1?project=demo')
})

test('buildSettingsSnapshot omits direct provider model config when model id contains secrets', () => {
  const snapshot = buildSettingsSnapshot({
    config: {
      configured: true,
      model: 'sk-proj-exampleSecretValue123456789',
      provider: 'backend-model-config',
      apiKind: 'openai_responses',
      useForChat: true,
      useForPlanner: true,
      source: 'file',
      capabilities: [],
    },
    profileId: '',
    skillPolicy: [],
    toolPolicy: [],
    activeRunPresetId: 'balanced',
    runPresets: defaultAgentRunPresets(),
  })

  assert.equal(snapshot.modelConfig, undefined)
})

test('parseSettingsSnapshot rejects duplicate run preset ids', () => {
  const preset = defaultAgentRunPresets()[0]
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    runPresets: [preset, { ...preset }],
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /runPresets 2 id is duplicated/,
  )
})

test('parseSettingsSnapshot rejects duplicate skill policy ids', () => {
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    skillPolicy: [
      { id: 'skill-a', enabled: true },
      { id: 'skill-a', enabled: false },
    ],
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /skillPolicy 2 id is duplicated/,
  )
})

test('parseSettingsSnapshot rejects duplicate tool policy names', () => {
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    toolPolicy: [
      { name: 'tool-a', mode: 'allow' },
      { name: 'tool-a', mode: 'deny' },
    ],
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /toolPolicy 2 name is duplicated/,
  )
})

test('parseSettingsSnapshot rejects unsupported fields for the v1 schema', () => {
  const preset = defaultAgentRunPresets()[0]

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      unknown: true,
    })),
    /agent settings snapshot\.unknown is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: { model: 'gpt-test', unknown: true },
    })),
    /modelConfig\.unknown is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      skillPolicy: [{ id: 'skill-a', enabled: true, unknown: true }],
    })),
    /skillPolicy 1\.unknown is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      toolPolicy: [{ name: 'tool-a', mode: 'allow', unknown: true }],
    })),
    /toolPolicy 1\.unknown is not supported/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      runPresets: [{ ...preset, unknown: true }],
    })),
    /runPresets 1\.unknown is not supported/,
  )
})

test('parseSettingsSnapshot rejects unsupported schema version metadata', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      schemaVersion: 2,
    })),
    /unsupported agent settings snapshot schemaVersion/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      schemaUrl: 'https://example.test/agent-settings-snapshot-v1.schema.json',
    })),
    /unsupported agent settings snapshot schemaUrl/,
  )
})

test('parseSettingsSnapshot rejects model configs with all routes disabled', () => {
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    modelConfig: {
      model: 'gpt-test',
      useForChat: false,
      useForPlanner: false,
    },
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /modelConfig must enable at least one route/,
  )
})

test('parseSettingsSnapshot rejects invalid model config field types', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: null,
    })),
    /modelConfig must be an object/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        model: 'gpt-test',
        modelConfigId: '7',
      },
    })),
    /modelConfig\.modelConfigId must be a positive integer/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        model: 'gpt-test',
        baseURL: '',
      },
    })),
    /modelConfig\.baseURL must be a non-empty string/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        model: 'gpt-test',
        useForChat: 'yes',
      },
    })),
    /modelConfig\.useForChat must be boolean/,
  )
})

test('parseSettingsSnapshot rejects model base URLs with secret URL credentials', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        model: 'gpt-test',
        baseURL: 'https://user:pass@api.openai.com/v1?project=demo',
      },
    })),
    /modelConfig\.baseURL must not include secret URL credentials/,
  )
})

test('parseSettingsSnapshot rejects direct provider model ids with embedded secrets', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        apiKind: 'openai_responses',
        model: 'sk-proj-exampleSecretValue123456789',
      },
    })),
    /modelConfig\.model must not include API keys/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      modelConfig: {
        apiKind: 'anthropic_messages',
        model: 'authorization: Bearer direct-secret-token',
      },
    })),
    /modelConfig\.model must not include API keys/,
  )
})

test('parseSettingsSnapshot rejects invalid top-level reference field types', () => {
  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      defaultProfileId: 7,
    })),
    /defaultProfileId must be a non-empty string/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      activeRunPresetId: '',
    })),
    /activeRunPresetId must be a non-empty string/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      exportedAt: 'not-a-date',
    })),
    /exportedAt must be a valid date string/,
  )
})

test('parseSettingsSnapshot rejects run preset limits outside supported UI ranges', () => {
  const preset = defaultAgentRunPresets()[0]
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    runPresets: [{
      ...preset,
      maxToolCalls: 201,
    }],
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /maxToolCalls must be an integer from 1 to 200/,
  )
})

test('parseSettingsSnapshot rejects invalid run preset metadata field types', () => {
  const preset = defaultAgentRunPresets()[0]

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      runPresets: [{ ...preset, name: '' }],
    })),
    /runPresets 1 name must be a non-empty string/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      runPresets: [{ ...preset, description: 7 }],
    })),
    /runPresets 1 description must be a string/,
  )

  assert.throws(
    () => parseSettingsSnapshot(JSON.stringify({
      schema: 'movscript.agent.settings.snapshot.v1',
      runPresets: [{ ...preset, autoPlan: 'yes' }],
    })),
    /runPresets 1 autoPlan must be boolean/,
  )
})

test('parseSettingsSnapshot rejects unsupported run preset planner options', () => {
  const preset = defaultAgentRunPresets()[0]
  const text = JSON.stringify({
    schema: 'movscript.agent.settings.snapshot.v1',
    runPresets: [{
      ...preset,
      planWorkerTimeoutMs: 7 * 60_000,
    }],
  })

  assert.throws(
    () => parseSettingsSnapshot(text),
    /planWorkerTimeoutMs must be one of/,
  )
})

test('validateSettingsSnapshotReferences rejects missing catalog references before import', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    defaultProfileId: 'missing-profile',
    skillPolicy: [{ id: 'missing-skill', enabled: true }],
    toolPolicy: [{ name: 'missing-tool', mode: 'allow' }],
  }), {
    profiles: [profileFixture()],
    currentProfile: profileFixture(),
    skills: [skillFixture('known-skill')],
  })

  assert.match(issues.map((issue) => issue.message).join('\n'), /profile missing-profile not found/)
  assert.match(issues.map((issue) => issue.message).join('\n'), /skill missing-skill not found/)
  assert.match(issues.map((issue) => issue.message).join('\n'), /tool policy requires an available default profile/)
})

test('validateSettingsSnapshotReferences rejects missing backend model references', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    modelConfig: {
      model: 'model_config:404',
      modelConfigId: 404,
      apiKind: 'backend_chat_completions',
    },
  }), {
    textModels: [modelFixture(7)],
    profiles: [profileFixture()],
    currentProfile: profileFixture(),
    skills: [],
  })

  assert.match(issues.map((issue) => issue.message).join('\n'), /backend model model_config:404 not found/)
})

test('validateSettingsSnapshotReferences allows direct API model ids outside backend model catalog', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    modelConfig: {
      model: 'gpt-5.5',
      apiKind: 'openai_responses',
    },
  }), {
    textModels: [],
    profiles: [profileFixture()],
    currentProfile: profileFixture(),
    skills: [],
  })

  assert.deepEqual(issues, [])
})

test('validateSettingsSnapshotReferences rejects unsafe skill and tool policy changes', () => {
  const issues = validateSettingsSnapshotReferences(settingsSnapshotFixture({
    skillPolicy: [
      { id: 'core-skill', enabled: false },
      { id: 'dependent-skill', enabled: true },
    ],
    toolPolicy: [{ name: 'write-tool', mode: 'allow', approval: 'never' }],
  }), {
    profiles: [profileFixture()],
    currentProfile: profileFixture({
      toolGrants: [{ name: 'write-tool', mode: 'allow', approval: 'always' }],
    }),
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

test('resolveSnapshotRunPresetImport falls back to first imported preset when active id is missing', () => {
  const runPresets = defaultAgentRunPresets()
  const imported = [{ ...runPresets[0], id: 'imported-safe', permissionMode: 'suggest' as const, planMaxWorkers: 3 }]
  const patch = resolveSnapshotRunPresetImport(settingsSnapshotFixture({
    activeRunPresetId: 'missing',
    runPresets: imported,
  }), normalizeAgentSettings({
    activeRunPresetId: 'balanced',
    runPresets,
  }))

  assert.equal(patch?.activeRunPresetId, 'imported-safe')
  assert.equal(patch?.permissionMode, 'suggest')
  assert.equal(patch?.planMaxWorkers, 3)
  assert.deepEqual(patch?.runPresets, imported)
})

test('resolveSnapshotRunPresetImport syncs settings from current presets when only active id is imported', () => {
  const runPresets = defaultAgentRunPresets()
  const patch = resolveSnapshotRunPresetImport(settingsSnapshotFixture({
    activeRunPresetId: 'deep-work',
  }), normalizeAgentSettings({
    activeRunPresetId: 'balanced',
    runPresets,
  }))

  assert.equal(patch?.activeRunPresetId, 'deep-work')
  assert.equal(patch?.permissionMode, 'suggest')
  assert.equal(patch?.planMaxWorkers, 3)
  assert.equal('runPresets' in (patch ?? {}), false)
})

function skillFixture(id: string, patch: Partial<AgentCatalogSkill> = {}): AgentCatalogSkill {
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

function profileFixture(patch: Partial<AgentCatalogProfile> = {}): AgentCatalogProfile {
  return {
    schema: 'movscript.agent.profile.v1',
    id: 'profile-default',
    version: '1.0.0',
    name: 'Default',
    enabledPacks: [],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants: [],
    ...patch,
  }
}

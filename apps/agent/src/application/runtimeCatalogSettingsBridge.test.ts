import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentManifest } from '../catalog/agentManifest.js'
import { InMemoryAgentCatalogStateStore } from '../catalog/state.js'
import type { AgentProfile, CatalogRegistry, SkillDefinition } from '../catalog/types.js'
import { createRuntimeCatalogSettingsBridge } from './runtimeCatalogSettingsBridge.js'

test('createRuntimeCatalogSettingsBridge persists default profile and policy settings', () => {
  const calls: string[] = []
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  let defaultAgentManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'movscript.profile.default',
    version: '1.0.0',
    name: 'Default Profile',
    tools: [
      { name: 'movscript_validate_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_delete_memory', mode: 'allow', approval: 'on_write' },
    ],
    metadata: { profileId: 'movscript.profile.default' },
  }
  let layeredRegistry = registry({
    profiles: [
      profile('movscript.profile.default', 'Default Profile', '1.0.0', defaultAgentManifest.tools),
      profile('profile_writer', 'Writer Profile', '2.0.0', [
        { name: 'movscript_validate_draft', mode: 'allow', approval: 'never' },
      ]),
    ],
  })
  const bridge = createRuntimeCatalogSettingsBridge({
    getState: () => ({ defaultAgentManifest, layeredRegistry }),
    setDefaultAgentManifest: (manifest) => {
      calls.push(`manifest:${manifest.id}`)
      defaultAgentManifest = manifest
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

  const profileManifest = bridge.setDefaultAgentProfile({ profileId: 'profile_writer' })
  assert.equal(profileManifest.id, 'profile_writer')
  assert.equal(profileManifest.metadata?.profileId, 'profile_writer')
  assert.deepEqual(catalogStateStore.load().metadata?.defaultToolGrants, [])

  const policyManifest = bridge.setDefaultToolPolicy({
    toolGrants: [{ name: 'movscript_validate_draft', mode: 'deny' }],
  })
  assert.deepEqual(policyManifest.metadata?.defaultToolGrants, [
    { name: 'movscript_validate_draft', mode: 'deny', approval: 'never' },
  ])
  assert.deepEqual(catalogStateStore.load().metadata?.defaultToolGrants, policyManifest.metadata?.defaultToolGrants)
  assert.deepEqual(calls, [
    'manifest:profile_writer',
    'snapshot',
    'replaceCurrent',
    'manifest:profile_writer',
    'snapshot',
    'replaceCurrent',
  ])
})

test('createRuntimeCatalogSettingsBridge toggles skills and validates dependencies', () => {
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  let defaultAgentManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'movscript.profile.default',
    version: '1.0.0',
    name: 'Default Profile',
    tools: [],
  }
  let layeredRegistry = registry({
    skills: [
      skill('studio.workflow.policy_test', 'workflow', { enabled: true }),
      skill('studio.policy.dependency_test', 'policy', { enabled: true }),
      skill('studio.policy.dependent_test', 'policy', { enabled: true, dependencies: ['studio.policy.dependency_test'] }),
      skill('studio.policy.core_test', 'policy', { enabled: true, loadMode: 'core' }),
    ],
  })
  const bridge = createRuntimeCatalogSettingsBridge({
    getState: () => ({ defaultAgentManifest, layeredRegistry }),
    setDefaultAgentManifest: (manifest) => { defaultAgentManifest = manifest },
    setLayeredRegistry: (registry) => { layeredRegistry = registry },
    catalogStateStore,
    catalogSnapshotBridge: { createSnapshot: () => ({ id: 'snapshot' }) as never } as never,
    catalogSnapshots: { replaceCurrent: () => undefined } as never,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const nextRegistry = bridge.setDefaultSkillPolicy({ skills: [{ id: 'studio.workflow.policy_test', enabled: false }] })
  assert.equal(nextRegistry.skills.get('studio.workflow.policy_test')?.enabled, false)
  assert.deepEqual(catalogStateStore.load().metadata?.defaultSkillOverrides, [{ id: 'studio.workflow.policy_test', enabled: false }])
  assert.throws(
    () => bridge.setDefaultSkillPolicy({ skills: [{ id: 'studio.policy.core_test', enabled: false }] }),
    /core skill .* cannot be disabled/,
  )
  assert.throws(
    () => bridge.setDefaultSkillPolicy({ skills: [{ id: 'studio.policy.dependency_test', enabled: false }] }),
    /requires enabled dependency/,
  )
})

function profile(id: string, name: string, version: string, toolGrants: AgentProfile['toolGrants']): AgentProfile {
  return {
    schema: 'movscript.agent.profile.v1',
    id,
    version,
    name,
    enabledPacks: [],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants,
  }
}

function skill(
  id: string,
  kind: SkillDefinition['kind'],
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    id,
    kind,
    version: '1.0.0',
    name: id,
    description: id,
    priority: 0,
    enabled: true,
    instructionTemplate: id,
    ...(kind === 'workflow' ? { triggers: [], toolRefs: [] } : {}),
    ...overrides,
  } as SkillDefinition
}

function registry(input: {
  profiles?: AgentProfile[]
  skills?: SkillDefinition[]
} = {}): CatalogRegistry {
  return {
    version: 'test',
    schemas: new Map(),
    tools: new Map(),
    skills: new Map((input.skills ?? []).map((item) => [item.id, item])),
    packs: new Map(),
    profiles: new Map((input.profiles ?? []).map((item) => [item.id, item])),
    knowledge: new Map(),
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CODEX_AGENT_PROVIDER_ID,
  CODEX_MOVSCRIPT_AGENT_PROVIDER_ID,
  CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  CODEX_SYSTEM_AGENT_PROVIDER_ID,
  DEFAULT_AGENT_PROVIDER_SETTINGS,
  MOVSCRIPT_MANAGED_CODEX_HOME,
  agentThreadRefKey,
  createAgentThreadRef,
  normalizeAgentProviderSettings,
  resolveCodexAgentProvider,
  resolveCodexAppServerProfile,
} from './agentProviderConfigStore'

test('default Codex provider is a movscript-owned app-server profile using MovScript CODEX_HOME', () => {
  const provider = resolveCodexAgentProvider(DEFAULT_AGENT_PROVIDER_SETTINGS)

  assert.equal(CODEX_AGENT_PROVIDER_ID, CODEX_SYSTEM_AGENT_PROVIDER_ID)
  assert.equal(provider?.id, CODEX_SYSTEM_AGENT_PROVIDER_ID)
  assert.equal(provider?.endpoint, undefined)
  assert.deepEqual(resolveCodexAppServerProfile(provider), {
    id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
    label: 'MovScript Codex',
    codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
    lifecycle: 'movscript-owned',
  })
})

test('default settings expose one MovScript-managed Codex app-server provider', () => {
  const settings = normalizeAgentProviderSettings(DEFAULT_AGENT_PROVIDER_SETTINGS)
  const codexProviders = settings.providers.filter((provider) => provider.kind === 'codex')
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_SYSTEM_AGENT_PROVIDER_ID)

  assert.equal(codexProviders.length, 1)
  assert.equal(codexProvider?.kind, 'codex')
  assert.equal(codexProvider?.endpoint, undefined)
  assert.deepEqual(resolveCodexAppServerProfile(codexProvider), {
    id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
    label: 'MovScript Codex',
    codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
    lifecycle: 'movscript-owned',
  })
})

test('normalizes custom Codex profiles without falling back to endpoint-only configuration', () => {
  const settings = normalizeAgentProviderSettings({
    providers: [{
      id: CODEX_AGENT_PROVIDER_ID,
      kind: 'codex',
      label: 'Codex',
      enabled: true,
      codexProfile: {
        id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
        label: 'MovScript Codex',
        executablePath: '/opt/movscript/codex',
        codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
        workspaceDir: '/workspace/project',
        lifecycle: 'movscript-owned',
      },
    }],
  })

  const provider = resolveCodexAgentProvider(settings)
  assert.deepEqual(resolveCodexAppServerProfile(provider), {
    id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
    label: 'MovScript Codex',
    executablePath: '/opt/movscript/codex',
    codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
    workspaceDir: '/workspace/project',
    lifecycle: 'movscript-owned',
  })
})

test('normalizes legacy attached Codex settings back to managed app-server profiles', () => {
  const settings = normalizeAgentProviderSettings({
    providers: [{
      id: CODEX_AGENT_PROVIDER_ID,
      kind: 'codex',
      label: 'Legacy attached Codex',
      enabled: true,
      endpoint: 'ws://127.0.0.1:48766',
      codexProfile: {
        id: 'legacy-attached',
        label: 'Legacy attached',
        codexHome: '~/.codex',
        lifecycle: 'attached',
      },
    }],
  } as unknown as Parameters<typeof normalizeAgentProviderSettings>[0])
  const provider = resolveCodexAgentProvider(settings)

  assert.equal(provider?.endpoint, undefined)
  assert.deepEqual(resolveCodexAppServerProfile(provider), {
    id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
    label: 'Legacy attached',
    codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
    lifecycle: 'movscript-owned',
  })
})

test('normalizes legacy duplicate Codex provider id into the single MovScript-managed provider', () => {
  const settings = normalizeAgentProviderSettings({
    providers: [{
      id: CODEX_MOVSCRIPT_AGENT_PROVIDER_ID,
      kind: 'codex',
      label: 'Legacy duplicate',
      enabled: true,
      codexProfile: {
        id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
        label: 'Legacy duplicate',
        codexHome: '~/.codex',
        lifecycle: 'movscript-owned',
      },
    }],
  })
  const codexProviders = settings.providers.filter((provider) => provider.kind === 'codex')

  assert.equal(codexProviders.length, 1)
  assert.equal(codexProviders[0]?.id, CODEX_AGENT_PROVIDER_ID)
  assert.equal(resolveCodexAppServerProfile(codexProviders[0]).codexHome, MOVSCRIPT_MANAGED_CODEX_HOME)
})

test('thread refs include provider and profile identity to prevent cross-agent collisions', () => {
  const provider = resolveCodexAgentProvider(DEFAULT_AGENT_PROVIDER_SETTINGS)
  assert.ok(provider)

  const ref = createAgentThreadRef({
    provider,
    threadId: 'thread_1',
    workspaceDir: '/workspace/project',
  })

  assert.equal(ref.providerKind, 'codex')
  assert.equal(ref.providerInstanceId, CODEX_MOVSCRIPT_HOME_PROFILE_ID)
  assert.equal(agentThreadRefKey(ref), 'codex:codex:codex-movscript-home:/workspace/project:thread_1')
})

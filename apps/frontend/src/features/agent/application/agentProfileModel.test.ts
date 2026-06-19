import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentProfilesFromProviderSettings,
  providerSupportsAgentProfile,
} from '@/features/agent/application/agentProfileModel'
import {
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
} from '@/shared/infrastructure/providerConfigStore'

test('agent profiles include app-server backed Codex and Mova providers', () => {
  const profiles = agentProfilesFromProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const codex = profiles.find((profile) => profile.id === CODEX_PROVIDER_ID)
  const mova = profiles.find((profile) => profile.id === MOVA_PROVIDER_ID)

  assert.equal(codex?.connectionKind, 'app-server')
  assert.equal(codex?.connectionLabel, 'app-server 连接')
  assert.equal(mova?.connectionKind, 'app-server')
  assert.equal(mova?.connectionLabel, 'app-server 连接')
})

test('agent profile support accepts host-backed app-server runtimes', () => {
  const codex = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  const mova = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === MOVA_PROVIDER_ID)

  assert.equal(providerSupportsAgentProfile(codex), true)
  assert.equal(providerSupportsAgentProfile(mova), true)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentProfileFromProvider,
  agentProfilesFromProviderSettings,
  providerSupportsAgentProfile,
  runtimeAccountPolicyFromProvider,
  runtimeBackendProfileFromProvider,
} from '@/features/agent/application/agentProfileModel'
import {
  CLAUDE_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  providerInstanceId,
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

test('agent profiles expose split provider, runtime backend, and account policy projections', () => {
  const codex = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)!
  const claude = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)!
  const codexProfile = agentProfileFromProvider(codex, CODEX_PROVIDER_ID)
  const claudeProfile = agentProfileFromProvider(claude, CODEX_PROVIDER_ID)
  const claudeRuntime = runtimeBackendProfileFromProvider(claude)

  assert.deepEqual(codexProfile.providerProfile, {
    id: CODEX_PROVIDER_ID,
    kind: 'codex',
    instanceId: providerInstanceId(codex),
    protocol: 'sdk',
    messageAdapter: 'thread-turn-item',
    label: 'Codex',
    enabled: true,
  })
  assert.equal(codexProfile.runtimeBackend.id, 'codex-codex-app-server')
  assert.equal(codexProfile.runtimeBackend.api, 'codex-app-server')
  assert.equal(codexProfile.runtimeBackend.transport, 'app-server')
  assert.equal(codexProfile.runtimeBackend.executableEnvVar, 'MOVSCRIPT_CODEX_APP_SERVER')
  assert.equal(codexProfile.runtimeBackend.runtimeApiEnvVar, 'MOVSCRIPT_CODEX_RUNTIME_API')
  assert.deepEqual(codexProfile.accountPolicy, {
    mode: 'backend',
    backendGateway: true,
    trustedSide: 'electron',
    rendererCanReadSecret: false,
  })
  assert.equal(codexProfile.runtimeBackend.contract?.support.capabilities.account.supported, true)
  assert.equal(codexProfile.credentialHint, undefined)
  assert.deepEqual(codexProfile.runtimeBackend.capabilitySummary, {
    status: 'supported',
    supportedCount: 5,
    totalCount: 5,
    limitedCount: 0,
    limitedReasons: [],
  })

  assert.equal(claudeRuntime.api, 'claude-sdk')
  assert.equal(claudeRuntime.transport, 'sdk-client')
  assert.deepEqual(runtimeAccountPolicyFromProvider(claude, claudeRuntime), {
    mode: 'direct',
    backendGateway: false,
    trustedSide: 'electron',
    rendererCanReadSecret: false,
  })
  assert.equal(claudeProfile.credentialHint?.env, 'ANTHROPIC_API_KEY')
  assert.equal(claudeProfile.credentialHint?.label, 'Claude API Key')
  assert.equal(claudeProfile.credentialHint?.support.supported, false)
  assert.equal(claudeProfile.credentialHint?.support.reason?.includes('ANTHROPIC_*'), true)
  assert.deepEqual(claudeProfile.credentialHint?.providerKeys, ['claude', 'claude-sdk', 'claude-code'])
  assert.equal(claudeProfile.runtimeBackend.capabilitySummary.status, 'limited')
  assert.equal(claudeProfile.runtimeBackend.capabilitySummary.supportedCount, 3)
  assert.equal(claudeProfile.runtimeBackend.capabilitySummary.totalCount, 5)
  assert.equal(claudeProfile.runtimeBackend.capabilitySummary.limitedCount, 2)
  assert.equal(claudeProfile.runtimeBackend.capabilitySummary.limitedReasons.some((reason) => reason.includes('ANTHROPIC_*')), true)
})

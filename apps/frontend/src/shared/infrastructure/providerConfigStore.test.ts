import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_API_ENV,
  CODEX_RUNTIME_PACKAGE_ENV,
  CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_RUNTIME_SDK_PACKAGE_ENV,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_RUNTIME_API_ENV,
  MOVA_RUNTIME_BINARY_PACKAGE_ENV,
  MOVA_RUNTIME_PACKAGE_ENV,
  MOVA_RUNTIME_PACKAGE_VERSION_ENV,
  createProviderThreadRef,
  normalizeProviderSettings,
  normalizeProviderSettingsWithRuntimeEnv,
  providerMessageAdapter,
  providerProtocol,
  providerRuntimeApi,
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerSettingsWithRuntimeEnv,
  providerThreadRefKey,
  providerWithRuntimeApi,
  resolveDefaultProvider,
  resolveNewConversationProvider,
  resolveProviderByKind,
} from '@/shared/infrastructure/providerConfigStore'
import { setRuntimeConfigSnapshot } from '@/shared/infrastructure/config'

test('default settings expose exactly the three built-in SDK agents', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)

  assert.equal(settings.defaultProviderId, CODEX_PROVIDER_ID)
  assert.equal(settings.newConversationProviderId, CODEX_PROVIDER_ID)
  assert.deepEqual(settings.providers.map((provider) => provider.kind).sort(), ['claude', 'codex', 'mova'])
  assert.deepEqual(settings.providers.map((provider) => provider.id).sort(), [CLAUDE_PROVIDER_ID, CODEX_PROVIDER_ID, MOVA_PROVIDER_ID])

  for (const provider of settings.providers) {
    assert.equal(provider.enabled, true)
    assert.equal(hasOwn(provider, 'endpoint'), false)
  }
})

test('legacy disabled built-in agents are re-enabled by the SDK-only provider model', () => {
  const settings = normalizeProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    providers: DEFAULT_PROVIDER_SETTINGS.providers.map((provider) => ({
      ...provider,
      enabled: false,
    })),
  })

  assert.deepEqual(settings.providers.map((provider) => [provider.id, provider.enabled]), [
    [MOVA_PROVIDER_ID, true],
    [CODEX_PROVIDER_ID, true],
    [CLAUDE_PROVIDER_ID, true],
  ])
  assert.equal(resolveProviderByKind(settings, 'claude')?.id, CLAUDE_PROVIDER_ID)
})

test('legacy built-in agent labels are normalized to user-facing agent names', () => {
  const settings = normalizeProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    providers: [
      {
        ...DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === MOVA_PROVIDER_ID)!,
        label: 'MovScript Mova',
      },
      {
        ...DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)!,
        label: 'MovScript Codex',
      },
      {
        ...DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)!,
        label: 'Claude',
      },
    ],
  })

  assert.equal(settings.providers.find((provider) => provider.id === MOVA_PROVIDER_ID)?.label, 'Mova')
  assert.equal(settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)?.label, 'Codex')
  assert.equal(settings.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)?.label, 'Claude Code')
})

test('Codex defaults to the Codex SDK runtime', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'codex')

  assert.equal(provider?.id, CODEX_PROVIDER_ID)
  assert.equal(providerProtocol(provider!), 'sdk')
  assert.equal(providerMessageAdapter(provider!), 'thread-turn-item')
  assert.equal(providerRuntimeApi(provider!), 'codex-sdk')
  assert.deepEqual(providerRuntimeApiOptions(provider!).map((option) => option.api), ['codex-sdk'])
  assert.deepEqual(providerRuntimeProfile(provider!), {
    id: 'codex-codex-sdk',
    api: 'codex-sdk',
    label: 'Codex SDK',
    packageName: '@openai/codex',
    sdkPackageName: '@openai/codex-sdk',
    apiEnvVar: CODEX_RUNTIME_API_ENV,
    packageNameEnvVar: CODEX_RUNTIME_PACKAGE_ENV,
    sdkPackageNameEnvVar: CODEX_RUNTIME_SDK_PACKAGE_ENV,
    packageVersionEnvVar: CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  })
})

test('Mova defaults to a Codex-compatible Mova SDK runtime without a published package name', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'mova')

  assert.equal(provider?.id, MOVA_PROVIDER_ID)
  assert.equal(providerProtocol(provider!), 'sdk')
  assert.equal(providerMessageAdapter(provider!), 'thread-turn-item')
  assert.equal(providerRuntimeApi(provider!), 'mova-sdk')
  assert.deepEqual(providerRuntimeApiOptions(provider!).map((option) => option.api), ['mova-sdk'])
  assert.deepEqual(providerRuntimeProfile(provider!), {
    id: 'mova-mova-sdk',
    api: 'mova-sdk',
    label: 'Mova SDK',
    binaryPackageName: '@movscript/mova',
    apiEnvVar: MOVA_RUNTIME_API_ENV,
    packageNameEnvVar: MOVA_RUNTIME_PACKAGE_ENV,
    binaryPackageNameEnvVar: MOVA_RUNTIME_BINARY_PACKAGE_ENV,
    packageVersionEnvVar: MOVA_RUNTIME_PACKAGE_VERSION_ENV,
  })
  assert.equal(hasOwn(providerRuntimeProfile(provider!), 'packageName'), false)
})

test('Claude Code defaults to the Claude SDK runtime', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'claude')

  assert.equal(provider?.id, CLAUDE_PROVIDER_ID)
  assert.equal(providerProtocol(provider!), 'claude-code')
  assert.equal(providerMessageAdapter(provider!), 'claude-thread-message')
  assert.equal(providerRuntimeApi(provider!), 'claude-sdk')
  assert.deepEqual(providerRuntimeApiOptions(provider!).map((option) => option.api), ['claude-sdk'])
  assert.deepEqual(providerRuntimeProfile(provider!), {
    id: 'claude-sdk',
    api: 'claude-sdk',
    label: 'Claude Agent SDK',
    packageName: '@anthropic-ai/claude-agent-sdk',
    binaryPackageName: '@anthropic-ai/claude-code',
    apiEnvVar: CLAUDE_RUNTIME_API_ENV,
    packageNameEnvVar: CLAUDE_RUNTIME_PACKAGE_ENV,
    binaryPackageNameEnvVar: CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
    packageVersionEnvVar: CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
  })
})

test('new conversations use the default SDK provider unless explicitly selected', () => {
  const settings = normalizeProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    defaultProviderId: CODEX_PROVIDER_ID,
    newConversationProviderId: CODEX_PROVIDER_ID,
  })
  const explicitMova = normalizeProviderSettings({
    ...settings,
    newConversationProviderId: MOVA_PROVIDER_ID,
  })

  assert.equal(resolveDefaultProvider(settings).id, CODEX_PROVIDER_ID)
  assert.equal(resolveNewConversationProvider(settings).id, CODEX_PROVIDER_ID)
  assert.equal(resolveNewConversationProvider(explicitMova).id, MOVA_PROVIDER_ID)
})

test('built-in providers reject unsupported runtime selection even when persisted or env-provided', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      protocol: 'legacy-protocol',
      enabled: true,
      runtime: { api: 'legacy-runtime', apiSource: 'user' },
    }],
  })
  const codexProvider = resolveProviderByKind(settings, 'codex')
  assert.ok(codexProvider)

  assert.equal(providerProtocol(codexProvider), 'sdk')
  assert.equal(providerRuntimeApi(codexProvider), 'codex-sdk')
  assert.deepEqual(providerRuntimeApiOptions(codexProvider).map((option) => option.api), ['codex-sdk'])

  const afterEnvRefresh = providerSettingsWithRuntimeEnv(settings, {
    [CODEX_RUNTIME_API_ENV]: 'legacy-runtime',
    [MOVA_RUNTIME_API_ENV]: 'legacy-runtime',
    [CLAUDE_RUNTIME_API_ENV]: 'legacy-runtime',
  })
  assert.equal(providerRuntimeApi(resolveProviderByKind(afterEnvRefresh, 'codex')!), 'codex-sdk')
  assert.equal(providerRuntimeApi(resolveProviderByKind(afterEnvRefresh, 'mova')!), 'mova-sdk')
  assert.equal(providerRuntimeApi(resolveProviderByKind(afterEnvRefresh, 'claude')!), 'claude-sdk')

  const unsupportedSelected = providerWithRuntimeApi(codexProvider, 'legacy-runtime')
  assert.equal(providerRuntimeApi(unsupportedSelected), 'codex-sdk')
})

test('runtime package metadata can be selected from startup environment without changing provider identity', () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_SDK_PACKAGE_ENV]: '@example/codex-sdk',
    [CODEX_RUNTIME_PACKAGE_VERSION_ENV]: '1.2.3',
    [MOVA_RUNTIME_PACKAGE_ENV]: '/local/mova-sdk/dist/index.js',
    [MOVA_RUNTIME_BINARY_PACKAGE_ENV]: '@example/mova-binary',
    [MOVA_RUNTIME_PACKAGE_VERSION_ENV]: '2.3.4',
    [CLAUDE_RUNTIME_PACKAGE_ENV]: '@example/claude-agent-sdk',
    [CLAUDE_RUNTIME_PACKAGE_VERSION_ENV]: '4.5.6',
  })
  const codexProvider = resolveProviderByKind(settings, 'codex')
  const movaProvider = resolveProviderByKind(settings, 'mova')
  const claudeProvider = resolveProviderByKind(settings, 'claude')
  assert.ok(codexProvider)
  assert.ok(movaProvider)
  assert.ok(claudeProvider)

  assert.equal(providerRuntimeProfile(codexProvider).id, 'codex-codex-sdk')
  assert.equal(providerRuntimeProfile(codexProvider).sdkPackageName, '@example/codex-sdk')
  assert.equal(providerRuntimeProfile(codexProvider).packageVersion, '1.2.3')
  assert.equal(providerRuntimeProfile(movaProvider).id, 'mova-mova-sdk')
  assert.equal(providerRuntimeProfile(movaProvider).packageName, '/local/mova-sdk/dist/index.js')
  assert.equal(providerRuntimeProfile(movaProvider).binaryPackageName, '@example/mova-binary')
  assert.equal(providerRuntimeProfile(movaProvider).packageVersion, '2.3.4')
  assert.equal(providerRuntimeProfile(claudeProvider).id, 'claude-sdk')
  assert.equal(providerRuntimeProfile(claudeProvider).packageName, '@example/claude-agent-sdk')
  assert.equal(providerRuntimeProfile(claudeProvider).packageVersion, '4.5.6')
})

test('runtime environment snapshot is applied when normalizing provider settings', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    workspaceDir: '/tmp/movscript-home',
    apiBaseURL: 'http://localhost:8766',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    localAPIBaseURL: 'http://localhost:8766',
    providerRuntimeEnv: {
      [CODEX_RUNTIME_SDK_PACKAGE_ENV]: '@example/codex-sdk',
      [MOVA_RUNTIME_PACKAGE_ENV]: '/snapshot/mova-sdk/dist/index.js',
      [MOVA_RUNTIME_PACKAGE_VERSION_ENV]: '9.9.9',
    },
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766' },
  })
  try {
    const settings = normalizeProviderSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS)
    const codexProvider = resolveProviderByKind(settings, 'codex')
    const movaProvider = resolveProviderByKind(settings, 'mova')

    assert.ok(codexProvider)
    assert.ok(movaProvider)
    assert.equal(providerRuntimeProfile(codexProvider).sdkPackageName, '@example/codex-sdk')
    assert.equal(providerRuntimeProfile(movaProvider).packageName, '/snapshot/mova-sdk/dist/index.js')
    assert.equal(providerRuntimeProfile(movaProvider).packageVersion, '9.9.9')
  } finally {
    setRuntimeConfigSnapshot(null)
  }
})

test('future custom providers fall back to SDK-compatible protocol defaults', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: 'studio-protocol',
      kind: 'studio-agent',
      label: 'Studio Agent',
      protocol: 'studio-session',
      messageAdapter: 'studio-thread-message',
      enabled: true,
      runtime: {
        id: 'studio-runtime',
        api: 'studio-sdk',
        label: 'Studio SDK',
      },
    }],
  })
  const provider = settings.providers.find((item) => item.id === 'studio-protocol')

  assert.ok(provider)
  assert.equal(providerProtocol(provider), 'sdk')
  assert.equal(providerMessageAdapter(provider), 'thread-turn-item')
  assert.equal(providerRuntimeApi(provider), 'studio-sdk')
})

test('thread refs include provider and SDK runtime identity to prevent cross-provider collisions', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const codex = resolveProviderByKind(settings, 'codex')
  const mova = resolveProviderByKind(settings, 'mova')
  const claude = resolveProviderByKind(settings, 'claude')
  assert.ok(codex)
  assert.ok(mova)
  assert.ok(claude)

  const codexRef = createProviderThreadRef({ provider: codex, threadId: 'thread_1', workspaceDir: '/workspace/project' })
  const movaRef = createProviderThreadRef({ provider: mova, threadId: 'thread_1', workspaceDir: '/workspace/project' })
  const claudeRef = createProviderThreadRef({ provider: claude, threadId: 'thread_1', workspaceDir: '/workspace/project' })

  assert.equal(codexRef.providerKind, 'codex')
  assert.equal(codexRef.providerInstanceId, 'codex-codex-sdk')
  assert.equal(providerThreadRefKey(codexRef), 'codex:codex:codex-codex-sdk:/workspace/project:thread_1')
  assert.equal(movaRef.providerKind, 'mova')
  assert.equal(movaRef.providerInstanceId, 'mova-mova-sdk')
  assert.equal(providerThreadRefKey(movaRef), 'mova:mova:mova-mova-sdk:/workspace/project:thread_1')
  assert.equal(claudeRef.providerKind, 'claude')
  assert.equal(claudeRef.providerInstanceId, 'claude-sdk')
  assert.equal(providerThreadRefKey(claudeRef), 'claude:claude:claude-sdk:/workspace/project:thread_1')
})

function hasOwn(value: unknown, key: PropertyKey): boolean {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key)
}

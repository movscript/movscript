import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_PROVIDER_ID,
  CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  CODEX_RUNTIME_PACKAGE_ENV,
  CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_RUNTIME_API_ENV,
  CODEX_RUNTIME_SDK_PACKAGE_ENV,
  DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  MOVSCRIPT_MANAGED_CODEX_HOME,
  providerMessageAdapter,
  providerProtocol,
  providerRuntimeApi,
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerWithRuntimeApi,
  normalizeProviderSettingsWithRuntimeEnv,
  providerSettingsWithRuntimeEnv,
  providerThreadRefKey,
  createProviderThreadRef,
  normalizeProviderSettings,
  resolveDefaultProvider,
  resolveProviderByKind,
  resolveAppServerProfile,
  resolveNewConversationProvider,
} from '@/shared/infrastructure/providerConfigStore'
import { setRuntimeConfigSnapshot } from '@/shared/infrastructure/config'

test('built-in Codex provider is a MovScript-managed app-server profile using the Codex compatibility home', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'codex')

  assert.equal(provider?.id, CODEX_PROVIDER_ID)
  assert.equal(hasOwn(provider, 'endpoint'), false)
  assert.deepEqual(resolveAppServerProfile(provider), DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE)
})

test('provider defaults expose Codex as one optional MovScript-managed app-server provider', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const codexProviders = settings.providers.filter((provider) => provider.kind === 'codex')
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)

  assert.equal(codexProviders.length, 1)
  assert.equal(codexProvider?.kind, 'codex')
  assert.equal(hasOwn(codexProvider, 'endpoint'), false)
  assert.ok(codexProvider?.appServerProfile)
  assert.equal(hasOwn(codexProvider, ['codex', 'Profile'].join('')), false)
  assert.equal(hasOwn(codexProvider, ['mova', 'Profile'].join('')), false)
  assert.deepEqual(resolveAppServerProfile(codexProvider), DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE)
})

test('default settings expose Mova as a separate app-server protocol provider', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const movaProvider = settings.providers.find((provider) => provider.id === MOVA_PROVIDER_ID)

  assert.equal(settings.defaultProviderId, MOVA_PROVIDER_ID)
  assert.equal(settings.providers[0]?.id, MOVA_PROVIDER_ID)
  assert.deepEqual(settings.providers.map((provider) => provider.kind).sort(), ['claude', 'codex', 'mova'])
  assert.equal(movaProvider?.kind, 'mova')
  assert.ok(movaProvider?.appServerProfile)
  assert.equal(hasOwn(movaProvider, ['codex', 'Profile'].join('')), false)
  assert.equal(hasOwn(movaProvider, ['mova', 'Profile'].join('')), false)
  assert.equal(providerProtocol(movaProvider!), 'app-server')
  assert.equal(providerMessageAdapter(movaProvider!), 'thread-turn-item')
  assert.equal(providerRuntimeApi(movaProvider!), 'app-server')
  assert.deepEqual(resolveAppServerProfile(movaProvider), DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE)
})

test('new conversations use the default app-server provider unless explicitly selected', () => {
  const settings = normalizeProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    defaultProviderId: MOVA_PROVIDER_ID,
  })
  const explicitCodex = normalizeProviderSettings({
    ...settings,
    newConversationProviderId: CODEX_PROVIDER_ID,
  })

  assert.equal(resolveNewConversationProvider(settings).id, MOVA_PROVIDER_ID)
  assert.equal(resolveNewConversationProvider(explicitCodex).id, CODEX_PROVIDER_ID)
})

test('startup environment can default SDK dev launches to Codex without locking runtime selection', () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
    MOVSCRIPT_DEFAULT_PROVIDER: CODEX_PROVIDER_ID,
    MOVSCRIPT_NEW_CONVERSATION_PROVIDER: CODEX_PROVIDER_ID,
  })
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  assert.ok(codexProvider)

  assert.equal(settings.defaultProviderId, CODEX_PROVIDER_ID)
  assert.equal(resolveNewConversationProvider(settings).id, CODEX_PROVIDER_ID)
  assert.equal(providerRuntimeApi(codexProvider), 'codex-sdk')
  assert.deepEqual(providerRuntimeApiOptions(codexProvider).map((option) => option.api), ['codex-sdk', 'app-server'])

  const userSelectedAppServer = normalizeProviderSettings({
    ...settings,
    providers: settings.providers.map((provider) => provider.id === CODEX_PROVIDER_ID
      ? providerWithRuntimeApi(provider, 'app-server')
      : provider),
  })
  const afterEnvRefresh = providerSettingsWithRuntimeEnv(userSelectedAppServer, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const refreshedCodex = afterEnvRefresh.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  assert.ok(refreshedCodex)
  assert.equal(providerRuntimeApi(refreshedCodex), 'app-server')
  assert.equal(providerRuntimeProfile(refreshedCodex).apiSource, 'user')
})

test('default provider resolution falls back to Mova rather than provider array order', () => {
  const settings = normalizeProviderSettings({
    providers: [
      { id: CODEX_PROVIDER_ID, kind: 'codex', enabled: false },
      { id: MOVA_PROVIDER_ID, kind: 'mova', enabled: false },
    ],
  })

  assert.equal(settings.defaultProviderId, MOVA_PROVIDER_ID)
  assert.equal(resolveDefaultProvider(settings).id, MOVA_PROVIDER_ID)
})

test('normalizes future Claude providers without binding them to the app-server protocol', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: CLAUDE_PROVIDER_ID,
      kind: 'claude',
      label: 'Claude',
      enabled: false,
    }],
  })
  const provider = settings.providers.find((item) => item.kind === 'claude')

  assert.ok(provider)
  assert.equal(provider?.id, CLAUDE_PROVIDER_ID)
  assert.equal(provider?.enabled, false)
  assert.equal(providerProtocol(provider), 'claude-code')
  assert.equal(providerMessageAdapter(provider), 'claude-thread-message')
  assert.equal(providerRuntimeApi(provider), 'claude-sdk')
  assert.deepEqual(providerRuntimeProfile(provider), {
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

test('default provider runtime profiles keep SDK package metadata out of app-server profile config', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  const claudeProvider = settings.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)

  assert.ok(codexProvider)
  assert.ok(claudeProvider)
  assert.deepEqual(providerRuntimeProfile(codexProvider), {
    id: 'codex-app-server',
    api: 'app-server',
    label: 'Codex app-server',
    packageName: '@openai/codex',
    sdkPackageName: '@openai/codex-sdk',
    apiEnvVar: CODEX_RUNTIME_API_ENV,
    packageNameEnvVar: CODEX_RUNTIME_PACKAGE_ENV,
    sdkPackageNameEnvVar: CODEX_RUNTIME_SDK_PACKAGE_ENV,
    packageVersionEnvVar: CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  })
  assert.equal(resolveAppServerProfile(codexProvider).executableEnvVar, 'MOVSCRIPT_CODEX_APP_SERVER_BIN')
  assert.equal(hasOwn(resolveAppServerProfile(codexProvider), 'packageName'), false)
  assert.equal(providerRuntimeApi(claudeProvider), 'claude-sdk')
  assert.equal(hasOwn(claudeProvider, 'appServerProfile'), false)
})

test('runtime API can be selected from startup environment without changing provider identity', () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  assert.ok(codexProvider)

  assert.equal(providerRuntimeApi(codexProvider), 'codex-sdk')
  assert.equal(providerProtocol(codexProvider), 'app-server')
  assert.equal(providerRuntimeProfile(codexProvider).id, 'codex-codex-sdk')
  assert.equal(createProviderThreadRef({
    provider: codexProvider,
    threadId: 'thread_1',
  }).providerInstanceId, 'codex-codex-sdk')
})

test('runtime package metadata can be selected from startup environment without changing provider identity', () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
    [CODEX_RUNTIME_SDK_PACKAGE_ENV]: '@example/codex-sdk',
    [CODEX_RUNTIME_PACKAGE_VERSION_ENV]: '1.2.3',
    [CLAUDE_RUNTIME_PACKAGE_ENV]: '@example/claude-agent-sdk',
    [CLAUDE_RUNTIME_PACKAGE_VERSION_ENV]: '4.5.6',
  })
  const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)
  const claudeProvider = settings.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)
  assert.ok(codexProvider)
  assert.ok(claudeProvider)

  assert.equal(providerRuntimeProfile(codexProvider).id, 'codex-codex-sdk')
  assert.equal(providerRuntimeProfile(codexProvider).sdkPackageName, '@example/codex-sdk')
  assert.equal(providerRuntimeProfile(codexProvider).packageVersion, '1.2.3')
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
      [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
      [CODEX_RUNTIME_SDK_PACKAGE_ENV]: '@example/codex-sdk',
      [CODEX_RUNTIME_PACKAGE_VERSION_ENV]: '1.2.3',
    },
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766' },
  })
  try {
    const settings = normalizeProviderSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS)
    const codexProvider = settings.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)

    assert.ok(codexProvider)
    assert.equal(providerRuntimeApi(codexProvider), 'codex-sdk')
    assert.equal(providerRuntimeProfile(codexProvider).sdkPackageName, '@example/codex-sdk')
    assert.equal(providerRuntimeProfile(codexProvider).packageVersion, '1.2.3')
  } finally {
    setRuntimeConfigSnapshot(null)
  }
})

test('runtime API env ignores unsupported provider/runtime combinations', () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CLAUDE_RUNTIME_API_ENV]: 'app-server',
  })
  const claudeProvider = settings.providers.find((provider) => provider.id === CLAUDE_PROVIDER_ID)
  assert.ok(claudeProvider)

  assert.equal(providerRuntimeApi(claudeProvider), 'claude-sdk')
  assert.equal(providerRuntimeProfile(claudeProvider).id, 'claude-sdk')
})

test('normalizes custom app-server providers without binding them to Codex or Mova', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: 'studio-agent',
      kind: 'studio-agent',
      label: 'Studio Agent',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      enabled: true,
      appServerProfile: {
        id: 'studio-agent-home',
        providerKey: 'studio-agent',
        label: 'Studio Agent',
        home: '.studio-agent',
        lifecycle: 'movscript-owned',
      },
    }],
  })
  const provider = settings.providers.find((item) => item.id === 'studio-agent')

  assert.ok(provider)
  assert.equal(provider.kind, 'studio-agent')
  assert.equal(providerProtocol(provider), 'app-server')
  assert.equal(providerMessageAdapter(provider), 'thread-turn-item')
  assert.deepEqual(resolveAppServerProfile(provider), {
    id: 'studio-agent-home',
    label: 'Studio Agent',
    providerKey: 'studio-agent',
    home: '.studio-agent',
    lifecycle: 'movscript-owned',
  })
})

test('drops unsupported persisted app-server message adapters back to the neutral adapter', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      protocol: 'app-server',
      messageAdapter: 'codex-thread-turn-item',
      label: 'Codex',
      enabled: true,
    }],
  })
  const provider = settings.providers.find((item) => item.id === CODEX_PROVIDER_ID)

  assert.ok(provider)
  assert.equal(providerMessageAdapter(provider), 'thread-turn-item')
})

test('preserves future provider protocols and message adapters without forcing app-server defaults', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: 'studio-protocol',
      kind: 'studio-agent',
      label: 'Studio Agent',
      protocol: 'studio-session',
      messageAdapter: 'studio-thread-message',
      enabled: true,
    }],
  })
  const provider = settings.providers.find((item) => item.id === 'studio-protocol')

  assert.ok(provider)
  assert.equal(provider.kind, 'studio-agent')
  assert.equal(providerProtocol(provider), 'studio-session')
  assert.equal(providerMessageAdapter(provider), 'studio-thread-message')
  assert.equal(hasOwn(provider, 'appServerProfile'), false)
})

test('normalizes custom app-server profiles through the shared app-server profile contract', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      label: 'Codex',
      enabled: true,
      appServerProfile: {
        id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
        label: 'MovScript Codex',
        executablePath: '/opt/movscript/codex',
        home: MOVSCRIPT_MANAGED_CODEX_HOME,
        workspaceDir: '/workspace/project',
        lifecycle: 'movscript-owned',
      },
    }],
  })

  const provider = resolveProviderByKind(settings, 'codex')
  assert.ok(provider)
  assert.deepEqual(resolveAppServerProfile(provider), {
    ...DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
    executablePath: '/opt/movscript/codex',
    workspaceDir: '/workspace/project',
  })
})

test('preserves built-in app-server profile ids for provider instance isolation', () => {
  const settings = normalizeProviderSettings({
    providers: [{
      id: 'mova-sandbox',
      kind: 'mova',
      label: 'Mova Sandbox',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      enabled: true,
      appServerProfile: {
        id: 'mova-sandbox-home',
        label: 'Mova Sandbox',
        providerKey: 'mova',
        home: '.mova/sandbox',
        lifecycle: 'movscript-owned',
      },
    }],
  })
  const provider = settings.providers.find((item) => item.id === 'mova-sandbox')
  assert.ok(provider)

  assert.deepEqual(resolveAppServerProfile(provider), {
    id: 'mova-sandbox-home',
    label: 'Mova Sandbox',
    providerKey: 'mova',
    home: '.mova/sandbox',
    lifecycle: 'movscript-owned',
  })
  assert.equal(createProviderThreadRef({
    provider,
    threadId: 'thread_1',
  }).providerInstanceId, 'mova-sandbox-home')
})

test('thread refs include provider and profile identity to prevent cross-provider collisions', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'codex')
  assert.ok(provider)

  const ref = createProviderThreadRef({
    provider,
    threadId: 'thread_1',
    workspaceDir: '/workspace/project',
  })

  assert.equal(ref.providerKind, 'codex')
  assert.equal(ref.providerInstanceId, CODEX_MOVSCRIPT_HOME_PROFILE_ID)
  assert.equal(providerThreadRefKey(ref), 'codex:codex:codex-movscript-home:/workspace/project:thread_1')
})

test('default Codex profile can resolve a workspace debug app-server before PATH fallback', () => {
  const provider = resolveProviderByKind(DEFAULT_PROVIDER_SETTINGS, 'codex')
  assert.ok(provider)

  assert.equal(provider.appServerProfile?.executableCommand, 'codex')
  assert.equal(provider.appServerProfile?.executableEnvVar, 'MOVSCRIPT_CODEX_APP_SERVER_BIN')
  assert.deepEqual(provider.appServerProfile?.compatibilityBinEnvNames, ['MOVSCRIPT_CODEX_BIN'])
  assert.ok(provider.appServerProfile?.candidateRootRelativePaths?.some((path) => path.includes('../codex/codex-rs/target/debug')))
  assert.ok(provider.appServerProfile?.candidateBinaryNames?.includes('codex-app-server'))
  assert.equal(provider.appServerProfile?.pathFallbackReady, false)
})

test('Mova thread refs use a distinct provider identity while sharing the app-server protocol', () => {
  const settings = normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS)
  const provider = settings.providers.find((item) => item.kind === 'mova')
  assert.ok(provider)

  const ref = createProviderThreadRef({
    provider,
    threadId: 'thread_1',
    workspaceDir: '/workspace/project',
  })

  assert.equal(ref.providerKind, 'mova')
  assert.equal(ref.providerInstanceId, MOVA_MOVSCRIPT_HOME_PROFILE_ID)
  assert.equal(providerThreadRefKey(ref), 'mova:mova:mova-movscript-home:/workspace/project:thread_1')
})

function hasOwn(value: unknown, key: PropertyKey): boolean {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key)
}

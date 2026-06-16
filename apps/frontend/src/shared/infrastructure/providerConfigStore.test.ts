import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CODEX_PROVIDER_ID,
  CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  MOVSCRIPT_MANAGED_CODEX_HOME,
  providerMessageAdapter,
  providerProtocol,
  providerThreadRefKey,
  createProviderThreadRef,
  normalizeProviderSettings,
  resolveDefaultProvider,
  resolveProviderByKind,
  resolveAppServerProfile,
  resolveNewConversationProvider,
} from '@/shared/infrastructure/providerConfigStore'

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
  assert.deepEqual(settings.providers.map((provider) => provider.kind).sort(), ['codex', 'mova'])
  assert.equal(movaProvider?.kind, 'mova')
  assert.ok(movaProvider?.appServerProfile)
  assert.equal(hasOwn(movaProvider, ['codex', 'Profile'].join('')), false)
  assert.equal(hasOwn(movaProvider, ['mova', 'Profile'].join('')), false)
  assert.equal(providerProtocol(movaProvider!), 'app-server')
  assert.equal(providerMessageAdapter(movaProvider!), 'thread-turn-item')
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
      id: 'claude',
      kind: 'claude',
      label: 'Claude',
      enabled: false,
    }],
  })
  const provider = settings.providers.find((item) => item.kind === 'claude')

  assert.ok(provider)
  assert.equal(provider?.id, 'claude')
  assert.equal(provider?.enabled, false)
  assert.equal(providerProtocol(provider), 'claude-code')
  assert.equal(providerMessageAdapter(provider), 'claude-thread-message')
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

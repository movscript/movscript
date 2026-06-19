import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_API_ENV,
  MOVA_PROVIDER_ID,
  PROVIDER_CONFIG_STORAGE_KEY,
  normalizeProviderSettings,
  providerRuntimeApi,
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerSettingsWithRuntimeEnv,
  useProviderConfigStore,
} from './providerConfigStore'

test('provider config persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/providerConfigStore.ts'), 'utf8')

  assert.equal(PROVIDER_CONFIG_STORAGE_KEY, 'movscript-provider-config')
  assert.match(source, /createDesktopStateStorage\(PROVIDER_CONFIG_STORAGE_KEY, fallback\)/)
})

test('provider config store keeps a normalized default provider selection', () => {
  useProviderConfigStore.setState({
    settings: normalizeProviderSettings({ defaultProviderId: 'claude' }),
    savedAt: null,
  })

  assert.equal(useProviderConfigStore.getState().settings.defaultProviderId, 'claude')
  useProviderConfigStore.getState().setDefaultProviderId('mova')
  assert.equal(useProviderConfigStore.getState().settings.defaultProviderId, 'mova')
})

test('provider config defaults Codex and Mova to app-server runtimes', () => {
  const settings = normalizeProviderSettings(undefined)
  const codex = settings.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const mova = settings.providers.find((item) => item.id === MOVA_PROVIDER_ID)!

  assert.equal(providerRuntimeApi(codex), 'codex-app-server')
  assert.equal(providerRuntimeProfile(codex).id, 'codex-codex-app-server')
  assert.equal(providerRuntimeProfile(codex).executableEnvVar, 'MOVSCRIPT_CODEX_APP_SERVER')
  assert.deepEqual(providerRuntimeApiOptions(codex).map((option) => option.api), ['codex-app-server', 'codex-sdk'])

  assert.equal(providerRuntimeApi(mova), 'mova-app-server')
  assert.equal(providerRuntimeProfile(mova).id, 'mova-mova-app-server')
  assert.equal(providerRuntimeProfile(mova).executableEnvVar, 'MOVSCRIPT_MOVA_APP_SERVER')
  assert.deepEqual(providerRuntimeApiOptions(mova).map((option) => option.api), ['mova-app-server', 'mova-sdk'])
})

test('provider config migrates built-in SDK defaults without overriding explicit choices', () => {
  const migrated = normalizeProviderSettings({
    providers: [
      {
        id: CODEX_PROVIDER_ID,
        kind: 'codex',
        runtime: { id: 'codex-codex-sdk', api: 'codex-sdk', label: 'Codex SDK' },
      },
      {
        id: MOVA_PROVIDER_ID,
        kind: 'mova',
        runtime: { id: 'mova-mova-sdk', api: 'mova-sdk', label: 'Mova SDK' },
      },
    ],
  })
  assert.equal(providerRuntimeApi(migrated.providers.find((item) => item.id === CODEX_PROVIDER_ID)!), 'codex-app-server')
  assert.equal(providerRuntimeApi(migrated.providers.find((item) => item.id === MOVA_PROVIDER_ID)!), 'mova-app-server')

  const explicit = normalizeProviderSettings({
    providers: [{
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      runtime: { id: 'codex-codex-sdk', api: 'codex-sdk', apiSource: 'user', label: 'Codex SDK' },
    }],
  })
  assert.equal(providerRuntimeApi(explicit.providers.find((item) => item.id === CODEX_PROVIDER_ID)!), 'codex-sdk')

  const envSelected = providerSettingsWithRuntimeEnv(migrated, { [CODEX_RUNTIME_API_ENV]: 'codex-sdk' })
  assert.equal(providerRuntimeApi(envSelected.providers.find((item) => item.id === CODEX_PROVIDER_ID)!), 'codex-sdk')
})

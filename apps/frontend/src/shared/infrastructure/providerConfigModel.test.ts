import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_EXECUTABLE_ENV,
  DEFAULT_PROVIDER_SETTINGS,
  createProviderThreadRef,
  normalizeProviderSettings,
  providerRuntimeProfile,
  providerSettingsWithRuntimeEnv,
  providerThreadRefKey,
} from './providerConfigStore'

test('provider config store delegates settings and runtime helpers through model boundaries', () => {
  const storeSource = readFileSync(resolve('src/shared/infrastructure/providerConfigStore.ts'), 'utf8')
  const modelSource = readFileSync(resolve('src/shared/infrastructure/providerConfigModel.ts'), 'utf8')
  const runtimeSource = readFileSync(resolve('src/shared/infrastructure/providerConfigRuntimeModel.ts'), 'utf8')

  assert.match(storeSource, /from '@\/shared\/infrastructure\/providerConfigModel'/)
  for (const helperName of [
    'normalizeProviderSettings',
    'providerSettingsWithRuntimeEnv',
    'createProviderThreadRef',
    'providerThreadRefKey',
  ]) {
    assert.match(modelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(storeSource, new RegExp(`function ${helperName}\\b`))
  }
  for (const helperName of [
    'providerRuntimeProfile',
    'providerRuntimeApi',
    'providerWithRuntimeApi',
    'providerWithRuntimeEnv',
  ]) {
    assert.match(runtimeSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(modelSource, new RegExp(`function ${helperName}\\b`))
    assert.doesNotMatch(storeSource, new RegExp(`function ${helperName}\\b`))
  }
})

test('provider config model applies runtime env overrides without changing explicit user API choices', () => {
  const settings = normalizeProviderSettings({
    providers: [
      {
        id: CODEX_PROVIDER_ID,
        kind: 'codex',
        runtime: {
          api: 'codex-sdk',
          apiSource: 'user',
          executableEnvVar: CODEX_RUNTIME_EXECUTABLE_ENV,
        },
      },
    ],
  })

  const withEnv = providerSettingsWithRuntimeEnv(settings, {
    MOVSCRIPT_DEFAULT_PROVIDER: 'codex',
    MOVSCRIPT_CODEX_RUNTIME_API: 'codex-app-server',
    [CODEX_RUNTIME_EXECUTABLE_ENV]: 'codex-local-server',
  })
  const codex = withEnv.providers.find((provider) => provider.id === CODEX_PROVIDER_ID)!

  assert.equal(withEnv.defaultProviderId, CODEX_PROVIDER_ID)
  assert.equal(providerRuntimeProfile(codex).api, 'codex-sdk')
  assert.equal(providerRuntimeProfile(codex).apiSource, 'user')
  assert.equal(providerRuntimeProfile(codex).executableCommand, 'codex-local-server')
})

test('provider config model builds stable provider thread ref keys including runtime identity and workspace', () => {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const ref = createProviderThreadRef({
    provider,
    threadId: 'thread_1',
    workspaceDir: ' /tmp/project ',
  })

  assert.deepEqual(ref, {
    providerId: 'codex',
    providerKind: 'codex',
    providerInstanceId: 'codex-codex-app-server',
    threadId: 'thread_1',
    workspaceDir: '/tmp/project',
  })
  assert.equal(providerThreadRefKey(ref), 'codex:codex:codex-codex-app-server:/tmp/project:thread_1')
})

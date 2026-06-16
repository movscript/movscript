import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const storeSource = readSource('apps/frontend/src/shared/infrastructure/providerConfigStore.ts')
const defaultsSource = readSource('apps/frontend/src/shared/infrastructure/providerConfigDefaults.ts')
const appServerProfileSource = readSource('apps/frontend/src/shared/infrastructure/providerConfigAppServerProfile.ts')

test('provider config store delegates defaults and app-server profile normalization', () => {
  assert.match(storeSource, /from '@\/shared\/infrastructure\/providerConfigDefaults'/)
  assert.match(storeSource, /from '@\/shared\/infrastructure\/providerConfigAppServerProfile'/)
  assert.match(storeSource, /export \{ normalizeAppServerProfile \} from '@\/shared\/infrastructure\/providerConfigAppServerProfile'/)

  assert.match(defaultsSource, /export const DEFAULT_PROVIDER_SETTINGS/)
  assert.match(defaultsSource, /export const DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE/)
  assert.match(defaultsSource, /export const DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE/)
  assert.match(appServerProfileSource, /export function normalizeAppServerProfile/)
  assert.match(appServerProfileSource, /export function appServerProviderKindForProvider/)
  assert.match(appServerProfileSource, /function normalizedStringListField/)
  assert.match(appServerProfileSource, /function managedAppServerHome/)

  assert.doesNotMatch(storeSource, /export const DEFAULT_PROVIDER_SETTINGS =/)
  assert.doesNotMatch(storeSource, /export const DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE =/)
  assert.doesNotMatch(storeSource, /export function normalizeAppServerProfile\(/)
  assert.doesNotMatch(storeSource, /function normalizedStringListField/)
  assert.doesNotMatch(storeSource, /function managedAppServerHome/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const storeSource = readSource('apps/frontend/src/shared/infrastructure/providerConfigStore.ts')
const defaultsSource = readSource('apps/frontend/src/shared/infrastructure/providerConfigDefaults.ts')

test('provider config store delegates defaults without app-server profile compatibility', () => {
  assert.match(storeSource, /from '@\/shared\/infrastructure\/providerConfigDefaults'/)
  assert.match(defaultsSource, /export const DEFAULT_PROVIDER_SETTINGS/)
  assert.equal(existsSync(resolve('apps/frontend/src/shared/infrastructure/providerConfigAppServerProfile.ts')), false)
  assert.doesNotMatch(storeSource, /providerConfigAppServerProfile|normalizeAppServerProfile|appServerProfile|usesAppServerProtocol|resolveAppServerProfile/)
  assert.doesNotMatch(storeSource, /export const DEFAULT_PROVIDER_SETTINGS =/)
  assert.doesNotMatch(defaultsSource, /DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE|DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE|MOVSCRIPT_MANAGED_CODEX_HOME|MOVSCRIPT_MANAGED_MOVA_HOME/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

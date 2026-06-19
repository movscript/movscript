import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('root scripts expose SDK runtime entrypoints without app-server commands', () => {
  const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const frontendPackage = JSON.parse(readFileSync(resolve('apps/frontend/package.json'), 'utf8'))
  const rootScripts = rootPackage.scripts ?? {}
  const frontendScripts = frontendPackage.scripts ?? {}
  const rootScriptSuite = rootPackage.testSuites?.scripts ?? []

  assert.equal(rootScriptSuite.includes('tests/scripts/sdk-runtime-entrypoints.test.mjs'), true)
  assert.equal(rootScripts['prepare:sdk-runtimes'], 'node scripts/prepare-sdk-runtime-seed.mjs')
  assert.equal(rootScripts['smoke:sdk-runtimes'], 'node scripts/smoke-sdk-runtimes.mjs')
  assert.equal(Object.hasOwn(rootScripts, 'app-server:install-plugin'), false)
  assert.equal(Object.hasOwn(rootScripts, 'sync:app-server-protocol'), false)
  assert.equal(Object.hasOwn(frontendScripts, 'verify:app-server'), false)

  for (const removedPath of [
    'scripts/install-app-server-plugin.mjs',
    'scripts/sync-app-server-protocol.mjs',
    'apps/frontend/scripts/verify-app-server.mjs',
    'apps/frontend/electron/services/appServerConfigDistribution.ts',
    'apps/frontend/electron/services/appServerManager.ts',
    'apps/frontend/src/shared/infrastructure/app-server',
  ]) {
    assert.equal(existsSync(resolve(removedPath)), false)
  }
})

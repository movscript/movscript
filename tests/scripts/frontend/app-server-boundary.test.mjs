import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const sdkRuntimeDefaultHandlers = readSource('apps/frontend/electron/services/sdkRuntimeDefaultHandlers.ts')
const electronApi = readSource('apps/frontend/src/shared/contracts/electronApi.ts')
const ipcIndex = readSource('apps/frontend/electron/ipc/index.ts')
const preloadApi = readSource('apps/frontend/electron/preload/api.ts')

test('app-server runtime infrastructure is removed from frontend product surfaces', () => {
  for (const removedPath of [
    'apps/frontend/src/shared/infrastructure/app-server',
    'apps/frontend/src/shared/contracts/electronApiAppServer.ts',
    'apps/frontend/electron/ipc/appServerIpc.ts',
    'apps/frontend/electron/ipc/appServerHubIpc.ts',
    'apps/frontend/electron/preload/api/appServer.ts',
    'apps/frontend/electron/services/appServerManager.ts',
    'apps/frontend/electron/services/appServerHub.ts',
    'apps/frontend/electron/services/appServerConfigDistribution.ts',
    'apps/frontend/electron/services/appServerLaunch.ts',
  ]) {
    assert.equal(existsSync(resolve(removedPath)), false)
  }
  assert.doesNotMatch(electronApi, /ensureAppServer|getAppServerStatus|stopAppServer|distributeAppServerConfig|appServerHub/)
  assert.doesNotMatch(ipcIndex, /registerAppServerIpcHandlers|registerAppServerHubIpcHandlers/)
  assert.doesNotMatch(preloadApi, /createAppServerAPI/)
})

test('SDK runtime handlers do not depend on app-server config distribution', () => {
  assert.doesNotMatch(sdkRuntimeDefaultHandlers, /appServerConfigDistribution/)
  assert.match(sdkRuntimeDefaultHandlers, /from '\.\/agentRuntimeAccountResolver'/)
  assert.match(sdkRuntimeDefaultHandlers, /from '\.\/agentRuntimeHomeResolver'/)
  assert.match(sdkRuntimeDefaultHandlers, /from '\.\/sdkRuntimeConfigInjector'/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

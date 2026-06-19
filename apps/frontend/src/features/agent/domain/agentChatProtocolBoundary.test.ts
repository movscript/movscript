import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('agent chat uses neutral protocol through SDK runtime boundaries', () => {
  const uiProtocol = readSource('../../packages/core/src/agent/chat/agentChatProtocol.ts')
  const neutralRuntime = readSource('../../packages/core/src/agent/chat/agentChatRuntime.ts')
  const notificationDispatcher = readSource('../../packages/core/src/agent/chat/agentChatNotificationDispatcher.ts')
  const dataSourceFactory = readSource('src/features/agent/application/agentChatDataSourceFactory.ts')
  const sdkRuntimeDataSource = readSource('src/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource.ts')
  const agentRuntimeShell = readSource('src/features/agent/components/AgentRuntimeChatShell.tsx')
  const providerConfigStore = readSource('src/shared/infrastructure/providerConfigStore.ts')
  const providerConfigDefaults = readSource('src/shared/infrastructure/providerConfigDefaults.ts')
  const electronApi = readSource('src/shared/contracts/electronApi.ts')
  const electronContractTypes = readSource('src/shared/contracts/electronApiContractTypes.ts')
  const ipcIndex = readSource('electron/ipc/index.ts')
  const preloadApi = readSource('electron/preload/api.ts')
  const managedBootstrap = readSource('electron/managedServices/bootstrap.ts')
  const managedShutdown = readSource('electron/managedServices/shutdown.ts')

  assert.match(uiProtocol, /export type AgentChatProviderKind = 'codex' \| 'mova' \| 'claude' \| \(string & \{\}\)/)
  assert.match(uiProtocol, /providerId\?: string/)
  assert.match(uiProtocol, /providerInstanceId\?: string/)
  assert.match(neutralRuntime, /export function agentChatRuntimeReducer/)
  assert.match(notificationDispatcher, /notification\.method === 'thread\/goal\/updated'/)
  assert.match(dataSourceFactory, /createSdkRuntimeChatDataSource/)
  assert.match(dataSourceFactory, /providerRuntimeApiContract/)
  assert.match(sdkRuntimeDataSource, /client\.request/)
  assert.match(sdkRuntimeDataSource, /turn\/text\/start/)
  assert.match(agentRuntimeShell, /<AgentChatDataSourceShell/)
  assert.match(agentRuntimeShell, /providerInstanceId\(provider\)/)

  for (const source of [
    dataSourceFactory,
    sdkRuntimeDataSource,
    agentRuntimeShell,
    providerConfigStore,
    providerConfigDefaults,
    electronApi,
    electronContractTypes,
    ipcIndex,
    preloadApi,
    managedBootstrap,
    managedShutdown,
  ]) {
    assert.doesNotMatch(source, /shared\/infrastructure\/app-server/)
    assert.doesNotMatch(source, /AppServer|appServer|APP_SERVER/)
  }

  assert.match(providerConfigStore, /export type BuiltInProviderProtocol = 'sdk' \| 'claude-code'/)
  assert.match(providerConfigStore, /export type BuiltInProviderRuntimeApi = 'codex-sdk' \| 'mova-sdk' \| 'claude-sdk'/)
  assert.doesNotMatch(providerConfigStore, /appServerProfile|usesAppServerProtocol|resolveAppServerProfile|providerSupportsAppServerRuntime/)
  assert.doesNotMatch(providerConfigDefaults, /DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE|DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE|MOVSCRIPT_MANAGED_CODEX_HOME|MOVSCRIPT_MANAGED_MOVA_HOME/)
  assert.doesNotMatch(electronApi, /ensureAppServer|getAppServerStatus|stopAppServer|distributeAppServerConfig|appServerHub/)
  assert.doesNotMatch(electronContractTypes, /electronApiAppServer/)

  for (const removedPath of [
    'src/shared/infrastructure/app-server',
    'src/shared/infrastructure/providerConfigAppServerProfile.ts',
    'src/shared/contracts/electronApiAppServer.ts',
    'electron/ipc/appServerIpc.ts',
    'electron/ipc/appServerHubIpc.ts',
    'electron/preload/api/appServer.ts',
    'electron/services/appServerManager.ts',
    'electron/services/appServerHub.ts',
    'electron/services/appServerConfigDistribution.ts',
    'electron/services/appServerLaunch.ts',
  ]) {
    assert.equal(existsSync(resolve(removedPath)), false)
  }
})

test('agent chat item rendering stays layered around neutral core items', () => {
  const neutralItemProtocol = readSource('../../packages/core/src/agent/chat/agentChatThreadItems.ts')
  const neutralItemView = readSource('src/features/agent/components/agent-chat-items/AgentChatThreadItemView.tsx')
  const neutralItemRenderers = [
    readSource('src/features/agent/components/agent-chat-items/AgentChatMessageItemRenderers.tsx'),
    readSource('src/features/agent/components/agent-chat-items/AgentChatProcessItemRenderers.tsx'),
    readSource('src/features/agent/components/agent-chat-items/AgentChatSystemItemRenderers.tsx'),
    readSource('src/features/agent/components/agent-chat-items/AgentChatToolItemRenderers.tsx'),
  ].join('\n')

  assert.match(neutralItemProtocol, /export type AgentChatThreadItem/)
  assert.match(neutralItemView, /assertNeverAgentChatThreadItem/)
  assert.match(neutralItemRenderers, /from '@movscript\/core\/agent\/chat'/)
  assert.doesNotMatch(neutralItemProtocol, /CodexThread|CodexTurn|CodexThreadItem|AgentRunStep/)
  assert.doesNotMatch(neutralItemView, /shared\/infrastructure\/app-server|codexAppServerProtocol|codexAgentChatThreadItems/)
  assert.doesNotMatch(neutralItemRenderers, /shared\/infrastructure\/app-server|codexAppServerProtocol|codexAgentChatThreadItems/)
})

function readSource(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('agent chat uses neutral protocol through Agent runtime boundaries', () => {
  const uiProtocol = readSource('../../packages/core/src/agent/chat/agentChatProtocol.ts')
  const neutralRuntime = readSource('../../packages/core/src/agent/chat/agentChatRuntime.ts')
  const notificationDispatcher = readSource('../../packages/core/src/agent/chat/agentChatNotificationDispatcher.ts')
  const dataSourceFactory = readSource('src/features/agent/application/agentChatDataSourceFactory.ts')
  const agentRuntimeDataSource = readSource('src/shared/infrastructure/agent-runtime/agentRuntimeChatDataSource.ts')
  const sdkRuntimeDataSource = readSource('src/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource.ts')
  const agentRuntimeProtocol = readSource('src/shared/infrastructure/agent-runtime/agentRuntimeProtocol.ts')
  const sdkRuntimeProtocol = readSource('src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol.ts')
  const runtimeCatalog = readSource('src/shared/infrastructure/providerRuntimeApiCatalog.ts')
  const runtimeCatalogContracts = readSource('src/shared/infrastructure/providerRuntimeApiCatalogContracts.ts')
  const appServerRuntimeBackend = readSource('electron/services/appServerRuntimeBackend.ts')
  const appServerRuntimeHandler = readSource('electron/services/appServerRuntimeHandler.ts')
  const sdkRuntimeBackend = readSource('electron/services/sdkRuntimeBackend.ts')
  const sdkRuntimeDefaultHandlers = readSource('electron/services/sdkRuntimeDefaultHandlers.ts')
  const agentRuntimeCapabilities = readSource('electron/services/agentRuntimeCapabilities.ts')
  const sdkRuntimeCapabilities = readSource('electron/services/sdkRuntimeCapabilities.ts')
  const agentRuntimeDefaultHandlers = readSource('electron/services/agentRuntimeDefaultHandlers.ts')
  const appServerRuntimeCommand = readSource('electron/services/appServerRuntimeCommand.ts')
  const appServerRuntimeConnection = readSource('electron/services/appServerRuntimeConnection.ts')
  const appServerRuntimeContext = readSource('electron/services/appServerRuntimeContext.ts')
  const appServerRuntimeMapper = readSource('electron/services/appServerRuntimeMapper.ts')
  const appServerRuntimeParams = readSource('electron/services/appServerRuntimeParams.ts')
  const appServerRuntimeReadiness = readSource('electron/services/appServerRuntimeReadiness.ts')
  const appServerRuntimeServerRequests = readSource('electron/services/appServerRuntimeServerRequests.ts')
  const agentRuntimeHost = readSource('electron/services/agentRuntimeHost.ts')
  const sdkRuntimeHost = readSource('electron/services/sdkRuntimeHost.ts')
  const agentRuntimeShell = readSource('src/features/agent/components/AgentRuntimeChatShell.tsx')
  const providerConfigStore = readSource('src/shared/infrastructure/providerConfigStore.ts')
  const providerConfigModel = readSource('src/shared/infrastructure/providerConfigModel.ts')
  const providerConfigDefaults = readSource('src/shared/infrastructure/providerConfigDefaults.ts')
  const electronApi = readSource('src/shared/contracts/electronApi.ts')
  const electronRuntimeContract = readSource('src/shared/contracts/electronApiSdkRuntime.ts')
  const electronAgentRuntimeClient = readSource('src/shared/infrastructure/agent-runtime/electronAgentRuntimeClient.ts')
  const electronContractTypes = readSource('src/shared/contracts/electronApiContractTypes.ts')
  const agentSessionTaskModel = readSource('src/features/agent/state/agentSessionTaskModel.ts')
  const agentPageTaskStateBlock = interfaceBlock(agentSessionTaskModel, 'AgentPageTaskState')

  assert.match(uiProtocol, /export type AgentChatProviderKind = 'codex' \| 'mova' \| 'claude' \| \(string & \{\}\)/)
  assert.match(uiProtocol, /providerId\?: string/)
  assert.match(uiProtocol, /providerInstanceId\?: string/)
  assert.match(neutralRuntime, /export function agentChatRuntimeReducer/)
  assert.match(notificationDispatcher, /notification\.method === 'thread\/goal\/updated'/)
  assert.match(dataSourceFactory, /createAgentRuntimeChatDataSource/)
  assert.match(dataSourceFactory, /providerRuntimeApiContract/)
  assert.match(agentRuntimeDataSource, /export function createAgentRuntimeChatDataSource/)
  assert.match(agentRuntimeDataSource, /AgentRuntimeClient/)
  assert.doesNotMatch(agentRuntimeDataSource, /sdk-runtime/)
  assert.match(sdkRuntimeDataSource, /createAgentRuntimeChatDataSource/)
  assert.doesNotMatch(sdkRuntimeDataSource, /client\.request\('thread\/list'/)
  assert.match(agentRuntimeProtocol, /export type AgentRuntimeRpcMethod =/)
  assert.match(agentRuntimeProtocol, /export const AGENT_RUNTIME_REQUIRED_RPC_METHODS/)
  assert.doesNotMatch(agentRuntimeProtocol, /sdk-runtime\/sdkRuntimeProtocol|SdkRuntimeRpcMethod|SDK_RUNTIME_REQUIRED_RPC_METHODS/)
  assert.match(sdkRuntimeProtocol, /AgentRuntimeRpcMethod as SdkRuntimeRpcMethod/)
  assert.match(sdkRuntimeProtocol, /AGENT_RUNTIME_REQUIRED_RPC_METHODS as SDK_RUNTIME_REQUIRED_RPC_METHODS/)
  assert.doesNotMatch(sdkRuntimeProtocol, /export type SdkRuntimeRpcMethod =/)
  assert.match(runtimeCatalog, /export interface RuntimeBackendSupportContract/)
  assert.match(runtimeCatalog, /support: RuntimeBackendSupportContract/)
  assert.match(runtimeCatalog, /runtimeBackendSupport/)
  assert.match(runtimeCatalogContracts, /transport: 'app-server'/)
  assert.match(runtimeCatalogContracts, /AGENT_RUNTIME_REQUIRED_RPC_METHODS/)
  assert.match(agentRuntimeProtocol, /support: ProviderRuntimeApiContract\['support'\]/)
  assert.match(agentRuntimeCapabilities, /export function agentRuntimeCapabilitiesResponse/)
  assert.match(agentRuntimeCapabilities, /runtimeBackendUnsupportedReasons/)
  assert.doesNotMatch(agentRuntimeCapabilities, /sdkRuntimeCapabilities|SdkRuntime/)
  assert.match(sdkRuntimeCapabilities, /agentRuntimeCapabilitiesResponse as sdkRuntimeCapabilitiesResponse/)
  assert.doesNotMatch(sdkRuntimeCapabilities, /providerRuntimeApiContract|unsupported\.config|unsupported\.account/)
  assert.match(appServerRuntimeBackend, /createCodexAppServerRuntimeHandler/)
  assert.match(sdkRuntimeBackend, /export function installSdkRuntimeBackendHandlers/)
  assert.match(sdkRuntimeBackend, /createCodexSdkRuntimeHandler/)
  assert.match(sdkRuntimeBackend, /createMovaSdkRuntimeHandler/)
  assert.match(sdkRuntimeBackend, /createClaudeSdkRuntimeHandler/)
  assert.match(agentRuntimeDefaultHandlers, /createCodexAppServerRuntimeHandler/)
  assert.match(agentRuntimeDefaultHandlers, /createMovaAppServerRuntimeHandler/)
  assert.match(agentRuntimeDefaultHandlers, /installSdkRuntimeBackendHandlers/)
  assert.doesNotMatch(sdkRuntimeDefaultHandlers, /createCodexAppServerRuntimeHandler|createMovaAppServerRuntimeHandler|codex-app-server|mova-app-server/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeConnection'/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeContext'/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeReadiness'/)
  assert.match(appServerRuntimeHandler, /ElectronAgentRuntimeRequestInput/)
  assert.doesNotMatch(appServerRuntimeHandler, /ElectronSdkRuntimeRequestInput/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeParams'/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeCommand'/)
  assert.match(appServerRuntimeHandler, /from '.\/appServerRuntimeMapper'/)
  assert.match(appServerRuntimeCommand, /export function resolveAppServerCommand/)
  assert.match(appServerRuntimeConnection, /export class AppServerConnection/)
  assert.match(appServerRuntimeConnection, /requestAgentRuntimeServerRequest/)
  assert.match(appServerRuntimeContext, /export function appServerContext/)
  assert.match(appServerRuntimeParams, /export function appServerThreadStartParams/)
  assert.match(appServerRuntimeMapper, /export function normalizeAppServerThread/)
  assert.match(appServerRuntimeReadiness, /export function probeAppServerRuntime/)
  assert.match(appServerRuntimeReadiness, /export function describeAppServerRuntime/)
  assert.match(appServerRuntimeServerRequests, /export function appServerAgentRequest/)
  assert.match(electronRuntimeContract, /AgentRuntimeRpcMethod/)
  assert.match(electronRuntimeContract, /ElectronAgentRuntimeRequestInput/)
  assert.match(electronRuntimeContract, /ElectronSdkRuntimeRequestInput<.*> = ElectronAgentRuntimeRequestInput/)
  assert.doesNotMatch(electronRuntimeContract, /sdk-runtime\/sdkRuntimeProtocol/)
  assert.match(electronAgentRuntimeClient, /export interface ElectronAgentRuntimeClientInput/)
  assert.doesNotMatch(electronAgentRuntimeClient, /ElectronSdkRuntimeClientInput/)
  assert.doesNotMatch(appServerRuntimeHandler, /node:child_process/)
  assert.doesNotMatch(appServerRuntimeHandler, /class AppServerConnection/)
  assert.doesNotMatch(appServerRuntimeHandler, /requestAgentRuntimeServerRequest/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerContext/)
  assert.doesNotMatch(appServerRuntimeHandler, /function probeAppServerRuntime/)
  assert.doesNotMatch(appServerRuntimeHandler, /function describeAppServerRuntime/)
  assert.doesNotMatch(appServerRuntimeHandler, /function resolveAppServerCommand/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerBinaryCandidates/)
  assert.doesNotMatch(appServerRuntimeHandler, /function splitCommand/)
  assert.doesNotMatch(appServerRuntimeHandler, /function shellWords/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerThreadStartParams/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerTurnStartParams/)
  assert.doesNotMatch(appServerRuntimeHandler, /function normalizeAppServerThread/)
  assert.doesNotMatch(appServerRuntimeHandler, /function normalizeAppServerThreadItem/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerAgentRequest/)
  assert.doesNotMatch(appServerRuntimeHandler, /function appServerResponseForAgentResponse/)
  assert.match(agentRuntimeHost, /ElectronAgentRuntimeRequestInput/)
  assert.match(agentRuntimeHost, /export function registerAgentRuntimeHandler/)
  assert.match(agentRuntimeHost, /export async function requestAgentRuntime/)
  assert.doesNotMatch(agentRuntimeHost, /sdkRuntimeHost|registerSdkRuntimeHandler|requestSdkRuntime/)
  assert.match(sdkRuntimeHost, /registerAgentRuntimeHandler as registerSdkRuntimeHandler/)
  assert.match(sdkRuntimeHost, /requestAgentRuntime as requestSdkRuntime/)
  assert.match(agentPageTaskStateBlock, /providerSessionTreeId\?: string/)
  assert.doesNotMatch(agentPageTaskStateBlock, /sessionId\?: string/)
  assert.match(agentRuntimeShell, /<AgentChatDataSourceShell/)
  assert.match(agentRuntimeShell, /providerInstanceId\(provider\)/)

  for (const source of [
    dataSourceFactory,
    agentRuntimeDataSource,
    agentRuntimeShell,
  ]) {
    assert.doesNotMatch(source, /shared\/infrastructure\/app-server/)
    assert.doesNotMatch(source, /providerSessionClient/)
  }

  assert.match(providerConfigStore, /from '@\/shared\/infrastructure\/providerConfigModel'/)
  assert.match(providerConfigModel, /export type BuiltInProviderProtocol = 'sdk' \| 'claude-code'/)
  assert.match(providerConfigModel, /export type BuiltInProviderRuntimeApi = 'codex-app-server' \| 'mova-app-server' \| 'codex-sdk' \| 'mova-sdk' \| 'claude-sdk'/)
  assert.doesNotMatch(providerConfigStore, /appServerProfile|usesAppServerProtocol|resolveAppServerProfile|providerSupportsAppServerRuntime/)
  assert.doesNotMatch(providerConfigModel, /appServerProfile|usesAppServerProtocol|resolveAppServerProfile|providerSupportsAppServerRuntime/)
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

test('ordinary agent chat surfaces do not import provider-session clients', () => {
  const dataSourceShell = readSource('src/features/agent/components/AgentChatDataSourceShell.tsx')
  const dataSourceShellController = [
    readSource('src/features/agent/application/useAgentChatDataSourceShellController.ts'),
    readSource('src/features/agent/application/useAgentChatDataSourceShellRuntimeSetup.ts'),
  ].join('\n')
  const ordinaryChatSources = [
    dataSourceShell,
    readSource('src/features/agent/components/AgentRuntimeChatShell.tsx'),
    readSource('src/features/agent/application/agentChatDataSourceFactory.ts'),
    dataSourceShellController,
    readSource('src/features/agent/application/useAgentChatConversationRegistry.ts'),
    readSource('src/features/agent/application/useAgentChatShellCoreState.ts'),
    readSource('src/features/agent/application/useAgentChatThreadCreation.ts'),
    readSource('src/features/agent/application/useAgentChatTurnControls.ts'),
    readSource('src/features/agent/presentation/useAgentComposerController.ts'),
    readSource('src/features/agent/presentation/useAgentChatShellPresentationState.ts'),
    readSource('src/features/agent/components/agent-chat-items/AgentChatThreadItemView.tsx'),
  ].join('\n')

  assert.match(dataSourceShell, /useAgentChatDataSourceShellController/)
  assert.match(dataSourceShellController, /useAgentChatShellCoreState/)
  assert.match(dataSourceShellController, /useAgentChatTurnControls/)
  assert.doesNotMatch(dataSourceShell, /useAgentChatShellCoreState|useAgentChatTurnControls|useAgentChatThreadTabs|useAgentChatServerRequests/)
  assert.doesNotMatch(ordinaryChatSources, /providerSessionClient|providerSessionHttpClient|shared\/infrastructure\/providerSessionClient|shared\/infrastructure\/providerSessionHttpClient|shared\/infrastructure\/provider-session-client/)
})

test('agent feature provider-session HTTP access is routed through the compatibility gateway', () => {
  const directProviderSessionClientImports = featureAgentSourceFiles()
    .filter((path) => !/\.(test|spec)\.[cm]?[tj]sx?$/.test(path))
    .filter((path) => {
      const source = readSource(path)
      return source.includes("shared/infrastructure/providerSessionClient")
        || source.includes("shared/infrastructure/providerSessionHttpClient")
        || source.includes("shared/infrastructure/provider-session-client")
    })

  assert.deepEqual(directProviderSessionClientImports, [
    'src/features/agent/infrastructure/agentProviderSessionCompatibility.ts',
  ])

  const gateway = readSource('src/features/agent/infrastructure/agentProviderSessionCompatibility.ts')
  assert.match(gateway, /export type AgentProviderSessionCompatibilityOwner =/)
  assert.match(gateway, /AGENT_PROVIDER_SESSION_COMPATIBILITY_OWNERS/)
  assert.match(gateway, /agentProviderSessionCompatibilityClient/)
  assert.match(gateway, /createAgentProviderSessionCompatibilityClient/)
  assert.match(gateway, /agentProviderSessionTreeIdForCompatibilityInput/)
})

test('provider-session compatibility services normalize legacy session ids at the boundary', () => {
  const commandService = readSource('src/features/agent/application/agentProviderSessionCommandService.ts')
  const healthService = readSource('src/features/agent/application/agentProviderSessionHealthService.ts')
  const planSnapshotService = readSource('src/features/agent/application/agentPlanSnapshotService.ts')
  const runTraceService = readSource('src/features/agent/application/agentRunTraceService.ts')
  const sessionOutputService = readSource('src/features/agent/application/agentSessionOutputService.ts')
  const agentControlCenter = readSource('src/features/agent/application/agentControlCenter.ts')
  const providerSessionContext = readSource('src/features/agent/presentation/useProviderSessionContextController.ts')
  const activePlanSnapshot = readSource('src/features/agent/presentation/useAgentActivePlanSnapshot.ts')
  const runResultActions = readSource('src/features/agent/presentation/useAgentRunResultActions.ts')
  const runInteractionActions = readSource('src/features/agent/presentation/useAgentRunInteractionActionBindings.ts')
  const planActionBindings = readSource('src/features/agent/presentation/useAgentPlanActionBindings.ts')
  const runStopAction = readSource('src/features/agent/presentation/useAgentRunStopAction.ts')
  const planOverviewPanel = readSource('src/features/agent/components/AgentPlanOverviewPanel.tsx')
  const agentQueryKeys = readSource('src/features/agent/application/agentQueryKeys.ts')
  const providerSessionQueryKeys = readSource('src/features/agent/application/providerSessionQueryKeys.ts')
  const providerSessionStatusLightController = readSource('src/features/agent/presentation/providerSessionStatusLightController.ts')
  const conversationTabStatusLights = readSource('src/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights.ts')

  for (const source of [commandService, healthService, planSnapshotService, runTraceService]) {
    assert.match(source, /providerSessionTreeId\?: string/)
    assert.match(source, /sessionId\?: string .*legacy provider-session input/)
    assert.match(source, /agentProviderSessionTreeIdForCompatibilityInput/)
  }
  for (const source of [providerSessionContext, activePlanSnapshot, runResultActions, runInteractionActions, planActionBindings, runStopAction]) {
    assert.match(source, /providerSessionTreeId\?: string/)
    assert.match(source, /sessionId\?: string .*legacy provider-session input/)
    assert.match(source, /normalizedProviderSessionTreeId/)
  }
  assert.doesNotMatch([
    providerSessionContext,
    activePlanSnapshot,
    runResultActions,
    runInteractionActions,
    planActionBindings,
    runStopAction,
    planOverviewPanel,
  ].join('\n'), /createAgentProviderSessionCommandService\(\{\s*sessionId|ensureAgentProviderSessionHealth\(\{\s*sessionId|fetchAgentPlanTaskGraphSnapshot\(\{\s*sessionId|streamAgentPlanTaskGraphSnapshot\(\{\s*sessionId|getAgentRunTraceSummary\(\{\s*sessionId|listAgentRunTraceEvents\(\{\s*sessionId/)
  assert.match(planOverviewPanel, /providerSessionTreeId: snapshotProviderSessionTreeId/)
  assert.match(agentQueryKeys, /taskGraphSnapshot: \(\s*providerSessionTreeId: string \| null/)
  assert.doesNotMatch(agentQueryKeys, /taskGraphSnapshot: \(\s*sessionId: string \| null/)
  assert.match(providerSessionQueryKeys, /health: \(providerSessionTreeId: string \| null\)/)
  assert.doesNotMatch(providerSessionQueryKeys, /health: \(sessionId: string \| null\)/)
  assert.match(providerSessionStatusLightController, /providerSessionTreeId\?: string/)
  assert.doesNotMatch(providerSessionStatusLightController, /sessionId\?: string/)
  assert.match(providerSessionStatusLightController, /forSession\(\{ sessionId: providerSessionTreeId \}\)/)
  assert.match(conversationTabStatusLights, /providerSessionTreeId\?: string/)
  assert.doesNotMatch(conversationTabStatusLights, /sessionId\?: string/)
  assert.match(sessionOutputService, /providerSessionTreeId\?: string/)
  assert.match(sessionOutputService, /forSession\(\{ sessionId: providerSessionTreeId \}\)/)
  assert.doesNotMatch(sessionOutputService, /const sessionId =/)
  assert.match(agentControlCenter, /providerSessionTreeId: session\.session\.id\.trim\(\)/)
  assert.match(agentControlCenter, /sessionId: session\.providerSessionTreeId/)
  assert.doesNotMatch(agentControlCenter, /sessionId: session\.session\.id\.trim\(\)/)
})

test('provider-session tree ids are explicit in core compatibility models', () => {
  const threadProtocol = readSource('../../packages/core/src/agent/agentThreadProtocol.ts')
  const runProtocol = readSource('../../packages/core/src/agent/agentRunProtocol.ts')
  const taskGraphProtocol = readSource('../../packages/core/src/agent/agentTaskGraphProtocol.ts')
  const timelineProtocol = readSource('../../packages/core/src/agent/agentTimelineProtocol.ts')
  const providerSessionProtocol = readSource('../../packages/core/src/agent/providerSessionProtocol.ts')
  const providerInteractionProtocol = readSource('../../packages/core/src/agent/providerInteractionProtocol.ts')
  const providerSessionThreadCache = readSource('src/features/agent/application/providerSessionThreadQueryCache.ts')
  const threadHydration = readSource('src/features/agent/application/useAgentThreadRegistryHydration.ts')
  const consoleIntegrationPanel = readSource('src/features/agent/components/AgentConsoleSessionIntegrationPanel.tsx')
  const planUi = readSource('src/features/agent/domain/agentPlanUi.ts')

  for (const source of [
    interfaceBlock(threadProtocol, 'AgentThread'),
    interfaceBlock(threadProtocol, 'AgentThreadSummary'),
    interfaceBlock(runProtocol, 'AgentRun'),
    interfaceBlock(taskGraphProtocol, 'AgentTaskGraph'),
    interfaceBlock(timelineProtocol, 'AgentTimelineProviderSessionRefs'),
    interfaceBlock(timelineProtocol, 'AgentTimelineItem'),
    interfaceBlock(providerSessionProtocol, 'ProviderSessionEventCausalityV2'),
    interfaceBlock(providerInteractionProtocol, 'ProviderWork'),
    interfaceBlock(providerInteractionProtocol, 'ProviderWorkStartInput'),
    interfaceBlock(providerInteractionProtocol, 'ProviderInteraction'),
  ]) {
    assert.match(source, /providerSessionTreeId\?: string/)
    assert.match(source, /@deprecated Prefer providerSessionTreeId/)
  }

  assert.match(providerSessionThreadCache, /providerSessionTreeId: summary\.session\.id/)
  assert.match(providerSessionThreadCache, /providerSessionTreeId: run\.providerSessionTreeId\?\.trim\(\) \|\| run\.sessionId\?\.trim\(\) \|\| summary\.session\.id/)
  assert.match(threadHydration, /thread\.providerSessionTreeId\?\.trim\(\) \|\| thread\.sessionId\?\.trim\(\)/)
  assert.match(consoleIntegrationPanel, /providerSessionTreeIdForThread/)
  assert.match(planUi, /providerSessionTreeId = run\.providerSessionTreeId\?\.trim\(\) \|\| run\.sessionId\?\.trim\(\)/)
})

test('agent plan artifact projections stay isolated from the plan overview model', () => {
  const planUi = readSource('src/features/agent/domain/agentPlanUi.ts')
  const planArtifactUi = readSource('src/features/agent/domain/agentPlanArtifactUi.ts')

  assert.match(planUi, /from '@\/features\/agent\/domain\/agentPlanArtifactUi'/)
  assert.match(planUi, /buildPlanArtifactSummary/)
  assert.match(planUi, /buildTaskArtifactViews/)
  assert.doesNotMatch(planUi, /export function buildPlanArtifactSummary/)
  assert.doesNotMatch(planUi, /export function buildTaskArtifactViews/)
  assert.doesNotMatch(planUi, /function formatArtifactView/)

  assert.match(planArtifactUi, /export function buildPlanArtifactSummary/)
  assert.match(planArtifactUi, /export function buildTaskArtifactViews/)
  assert.match(planArtifactUi, /export function formatPlanArtifactView/)
  assert.doesNotMatch(planArtifactUi, /AgentPlanWorkerView/)
  assert.doesNotMatch(planArtifactUi, /pendingInputRequests|pendingApprovals/)
})

test('ordinary agent chat render path does not import legacy transcript or timeline projection', () => {
  const ordinaryChatSources = readOrdinaryAgentChatSurfaceSource()
  const legacyConversationTabs = readSource('src/features/agent/components/AgentConversationTabs.tsx')
  const legacyConversationTabsModel = readSource('src/features/agent/presentation/agentLegacyConversationTabsModel.ts')

  assert.doesNotMatch(ordinaryChatSources, /agentConversationThreadItems|agentTranscriptMessageItems|agentConversationProjection|agentTimelineActivityItems|agentMessageBoundaries|agentMessageFacts|providerThreadRunState|providerSessionResult|transcriptMessages|AgentTimelineItem/)
  assert.match(legacyConversationTabs, /legacyConversationTabMessageCount/)
  assert.doesNotMatch(legacyConversationTabs, /agentMessageBoundaries/)
  assert.match(legacyConversationTabsModel, /transcriptMessageCount/)
  assert.match(legacyConversationTabsModel, /agentMessageBoundaries/)
})

test('agent runtime credentials expose renderer-safe summaries', () => {
  const agentConsoleCredentialPanel = readSource('src/features/agent/components/AgentConsoleCapabilityPanels.tsx')
  const electronSdkRuntimeClient = readSource('src/shared/infrastructure/sdk-runtime/electronSdkRuntimeClient.ts')
  const electronApi = readSource('src/shared/contracts/electronApi.ts')
  const electronCoreContracts = readSource('src/shared/contracts/electronApiCore.ts')
  const settingsIpc = readSource('electron/ipc/settingsIpc.ts')
  const settingsPreload = readSource('electron/preload/api/settings.ts')
  const settingsSecrets = readSource('electron/services/appSettingsSecrets.ts')

  assert.match(electronCoreContracts, /export type ElectronAgentRuntimeCredentialSummary = \{[\s\S]*savedProviderKeys: string\[\]/)
  assert.match(electronApi, /getAgentRuntimeCredentialSummary\?: \(\) => Promise<ElectronAgentRuntimeCredentialSummary>/)
  assert.match(electronApi, /setAgentRuntimeApiKey\?: .*Promise<ElectronAgentRuntimeCredentialSummary>/)
  assert.match(settingsPreload, /getAgentRuntimeCredentialSummary: \(\) => ipcRenderer\.invoke\('app:get-agent-runtime-credential-summary'\)/)
  assert.match(settingsIpc, /ipcMain\.handle\('app:get-agent-runtime-credential-summary'/)
  assert.match(settingsIpc, /rendererAppSettingsSecrets\(readAppSettingsSecrets/)
  assert.match(settingsIpc, /return summary/)
  assert.match(settingsSecrets, /export function rendererAppSettingsSecrets/)
  assert.match(settingsSecrets, /agentRuntimeApiKeys: \{\}/)
  assert.match(agentConsoleCredentialPanel, /getAgentRuntimeCredentialSummary/)
  assert.match(electronSdkRuntimeClient, /getAgentRuntimeCredentialSummary/)
  assert.doesNotMatch(agentConsoleCredentialPanel, /getAppSettingsSecrets|agentRuntimeApiKeys/)
  assert.doesNotMatch(electronSdkRuntimeClient, /getAppSettingsSecrets|secrets\.agentRuntimeApiKeys/)
})

function readSource(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

function interfaceBlock(source: string, name: string): string {
  const match = new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`).exec(source)
  assert.ok(match, `Missing interface ${name}`)
  return match[0]
}

function readOrdinaryAgentChatSurfaceSource(): string {
  return [
    'src/features/agent/components/AgentRuntimeChatShell.tsx',
    'src/features/agent/components/AgentChatDataSourceShell.tsx',
    'src/features/agent/components/AgentChatShellView.tsx',
    'src/features/agent/components/AgentChatDataSourceShellParts.tsx',
    'src/features/agent/components/agent-chat-events/AgentChatRecentCapabilityEventCard.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatMessageItemRenderers.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatProcessItemRenderers.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatServerRequestCard.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatSystemItemRenderers.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatThreadItemView.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatToolItemRenderers.tsx',
    'src/features/agent/application/agentChatDataSourceFactory.ts',
    'src/features/agent/application/useAgentChatConversationRegistry.ts',
    'src/features/agent/application/useAgentChatDataSourceLoadEffect.ts',
    'src/features/agent/application/useAgentChatDataSourceShellController.ts',
    'src/features/agent/application/useAgentChatDataSourceShellRuntimeSetup.ts',
    'src/features/agent/application/useAgentChatRuntimeController.ts',
    'src/features/agent/application/useAgentChatShellCoreState.ts',
    'src/features/agent/application/useAgentChatThreadCreation.ts',
    'src/features/agent/application/useAgentChatThreadTabs.ts',
    'src/features/agent/application/useAgentChatThreadViewport.ts',
    'src/features/agent/application/useAgentChatTurnControls.ts',
    'src/features/agent/presentation/agentChatDataSourceShellModel.ts',
    'src/features/agent/presentation/agentChatThreadProjectionModel.ts',
    'src/features/agent/presentation/useAgentChatShellPresentationState.ts',
    'src/features/agent/presentation/useAgentComposerController.ts',
  ].map(readSource).join('\n')
}

function featureAgentSourceFiles(parent: string = 'src/features/agent'): string[] {
  const absoluteParent = resolve(parent)
  return readdirSync(absoluteParent).flatMap((entry) => {
    const path = `${parent}/${entry}`
    const absolutePath = resolve(path)
    const stat = statSync(absolutePath)
    if (stat.isDirectory()) return featureAgentSourceFiles(path)
    return /\.[cm]?[tj]sx?$/.test(entry) ? [path] : []
  })
}

import type { AppSettings } from './appSettings'
import type { GenerationToolServer, GenerationToolsSettings } from './generationTools'
import type { MCPContextUpdate } from './mcpContext'
import type { MovScriptWorkspaceService } from '@movscript/workspace'
import type {
  ContentCandidateRecord,
  ContentSourceWorkspaceData,
  ContentSourceWorkspaceSnapshot,
} from '@movscript/core/content'
import type {
  ElectronAppServerCloseInput,
  ElectronAppServerConnectInput,
  ElectronAppServerConnection,
  ElectronAppServerEnsureInput,
  ElectronAppServerLogEvent,
  ElectronAppServerMessage,
  ElectronAppServerSendInput,
  ElectronAppServerStatus,
  ElectronAppServerStatusInput,
  ElectronAppServerStopInput,
  ElectronAdminAuthSessionInput,
  ElectronAppUpdateStatus,
  ElectronAppWindowContext,
  ElectronBackendAuthSessionInput,
  ElectronBackendStatus,
  ElectronEmbeddedBrowserBounds,
  ElectronEmbeddedBrowserState,
  ElectronGenerationToolServerTestResult,
  ElectronLocalTerminalCreateInput,
  ElectronLocalTerminalCreateResult,
  ElectronLocalTerminalEvent,
  ElectronLocalTerminalKillInput,
  ElectronLocalTerminalResizeInput,
  ElectronLocalTerminalWriteInput,
  ElectronMCPServerStatus,
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineProjectInput,
  ElectronMovScriptEngineStoryboardTimelineInput,
  ElectronMovScriptEngineTransitionInput,
  ElectronMovScriptEngineWorkspaceAppendCandidateInput,
  ElectronMovScriptEngineWorkspaceCandidateCreateInput,
  ElectronMovScriptEngineWorkspaceDeleteEntityInput,
  ElectronMovScriptEngineWorkspaceQueryAssetsInput,
  ElectronMovScriptEngineWorkspaceQueryEntitiesInput,
  ElectronMovScriptEngineWorkspaceQuerySettingsInput,
  ElectronMovScriptEngineWorkspaceReadScriptSourceInput,
  ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput,
  ElectronMovScriptEngineWorkspaceSelectCandidateInput,
  ElectronMovScriptEngineWorkspaceUpsertAssetInput,
  ElectronMovScriptEngineWorkspaceUpsertContentUnitInput,
  ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput,
  ElectronMovScriptEngineWorkspaceUpsertScriptInput,
  ElectronMovScriptEngineWorkspaceUpsertSettingInput,
  ElectronMovScriptWorkspaceConfig,
  ElectronMovScriptWorkspaceConfigSaveInput,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFileWriteInput,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceMediaFileReadResult,
  ElectronMovScriptWorkspaceInterpretActionInput,
  ElectronMovScriptWorkspaceRootResult,
  ElectronPluginCatalogPackInstallInput,
  ElectronPluginCatalogPackInstallResult,
  ElectronPluginCatalogPackPlugin,
  ElectronPluginCatalogPackStoreDirs,
  ElectronPluginCatalogPackUninstallInput,
  ElectronPluginCatalogPackUninstallResult,
  ElectronProjectPluginInstallInput,
  ElectronProjectPluginSnapshot,
  ElectronProjectSkillToggleInput,
  ElectronProjectGitActionInput,
  ElectronProjectGitActionResult,
  ElectronProviderSessionSummary,
  ElectronShotCutInput,
  ElectronShotCutResult,
  ElectronTimelineVideoInput,
  ElectronTimelineVideoResult,
  ElectronVideoClipInput,
  ElectronVideoClipResult,
  ElectronVideoClipStatus,
  ElectronWindowControlAction,
  ElectronOpenProjectWindowInput,
  ElectronWindowState,
} from './electronApiContractTypes'

export type * from './electronApiContractTypes'

export type ElectronAPI = {
  platform?: NodeJS.Platform
  openFile?: () => Promise<string | null>
  saveFile?: (defaultPath?: string) => Promise<string | null>
  windowControl?: (action: ElectronWindowControlAction) => Promise<ElectronWindowState | undefined>
  getWindowState?: () => Promise<ElectronWindowState>
  onWindowState?: (handler: (state: ElectronWindowState) => void) => () => void
  getAppWindowContext?: () => Promise<ElectronAppWindowContext>
  openHomeWindow?: () => Promise<ElectronAppWindowContext>
  openAgentWindow?: () => Promise<ElectronAppWindowContext>
  openProjectWindow?: (input: ElectronOpenProjectWindowInput) => Promise<ElectronAppWindowContext>
  updateMCPContext?: (snapshot: MCPContextUpdate) => Promise<void>
  getMCPStatus?: () => Promise<ElectronMCPServerStatus>
  setAppSettings?: (settings: AppSettings) => Promise<void>
  setGenerationToolsSettings?: (settings: GenerationToolsSettings) => Promise<void>
  testGenerationToolServer?: (server: Partial<GenerationToolServer>) => Promise<ElectronGenerationToolServerTestResult>
  onBackendStatus?: (handler: (status: ElectronBackendStatus) => void) => () => void
  getBackendStatus?: () => Promise<ElectronBackendStatus>
  setBackendAuthSession?: (session: ElectronBackendAuthSessionInput | null) => Promise<void>
  handleBackendAuthExpired?: () => Promise<ElectronAppWindowContext[]>
  onBackendAuthSessionExpired?: (handler: () => void) => () => void
  getAppUpdateStatus?: () => Promise<ElectronAppUpdateStatus>
  checkForAppUpdate?: () => Promise<ElectronAppUpdateStatus>
  openAppUpdateDownload?: () => Promise<ElectronAppUpdateStatus>
  onAppUpdateStatus?: (handler: (status: ElectronAppUpdateStatus) => void) => () => void
  openAdminConsole?: (input?: { baseURL?: string; path?: string; authSession?: ElectronAdminAuthSessionInput | null }) => Promise<{ url: string }>
  embeddedBrowserNavigate?: (input: { tabId?: string; url: string; bounds?: ElectronEmbeddedBrowserBounds | null }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserActivate?: (input: { tabId: string; bounds?: ElectronEmbeddedBrowserBounds | null }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserSetBounds?: (input: { bounds?: ElectronEmbeddedBrowserBounds | null } | null) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserHide?: () => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserGetState?: (input?: { tabId?: string }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserClose?: (input: { tabId: string }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserGoBack?: (input?: { tabId?: string }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserGoForward?: (input?: { tabId?: string }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserReload?: (input?: { tabId?: string }) => Promise<ElectronEmbeddedBrowserState>
  embeddedBrowserStop?: (input?: { tabId?: string }) => Promise<ElectronEmbeddedBrowserState>
  onEmbeddedBrowserState?: (handler: (state: ElectronEmbeddedBrowserState) => void) => () => void
  distributeAppServerConfig?: (input: ElectronAppServerEnsureInput) => Promise<ElectronAppServerStatus>
  ensureAppServer?: (input: ElectronAppServerEnsureInput) => Promise<ElectronAppServerStatus>
  getAppServerStatus?: (input?: ElectronAppServerStatusInput) => Promise<ElectronAppServerStatus>
  stopAppServer?: (input?: ElectronAppServerStopInput) => Promise<ElectronAppServerStatus>
  appServerConnect?: (input: ElectronAppServerConnectInput) => Promise<ElectronAppServerConnection>
  appServerSend?: (input: ElectronAppServerSendInput) => Promise<void>
  appServerClose?: (input: ElectronAppServerCloseInput) => Promise<void>
  onAppServerMessage?: (handler: (message: ElectronAppServerMessage) => void) => () => void
  onAppServerLog?: (handler: (event: ElectronAppServerLogEvent) => void) => () => void
  createLocalTerminal?: (input: ElectronLocalTerminalCreateInput) => Promise<ElectronLocalTerminalCreateResult>
  writeLocalTerminal?: (input: ElectronLocalTerminalWriteInput) => Promise<void>
  resizeLocalTerminal?: (input: ElectronLocalTerminalResizeInput) => Promise<void>
  killLocalTerminal?: (input: ElectronLocalTerminalKillInput) => Promise<void>
  onLocalTerminalEvent?: (handler: (event: ElectronLocalTerminalEvent) => void) => () => void
  listProviderSessions?: (input?: { workspaceDir?: string; providerProfileKey?: string }) => Promise<{ sessions: ElectronProviderSessionSummary[] }>
  getMovScriptWorkspaceRoot?: (input?: { workspaceDir?: string }) => Promise<ElectronMovScriptWorkspaceRootResult>
  getMovScriptWorkspaceConfig?: (input?: { workspaceDir?: string; providerProfileKey?: string }) => Promise<ElectronMovScriptWorkspaceConfig>
  saveMovScriptWorkspaceConfig?: (input: ElectronMovScriptWorkspaceConfigSaveInput) => Promise<ElectronMovScriptWorkspaceConfig>
  listMovScriptWorkspaceFiles?: (input?: ElectronMovScriptWorkspaceFilesInput) => Promise<ElectronMovScriptWorkspaceFilesListResult>
  readMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFilesInput) => Promise<ElectronMovScriptWorkspaceFileReadResult>
  readMovScriptWorkspaceMediaFile?: (input: ElectronMovScriptWorkspaceFilesInput) => Promise<ElectronMovScriptWorkspaceMediaFileReadResult>
  writeMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFileWriteInput) => Promise<ElectronMovScriptWorkspaceFileReadResult>
  deleteMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFilesInput) => Promise<{ ok: true }>
  reviewMovScriptWorkspace?: (input?: ElectronMovScriptWorkspaceInterpretActionInput) => Promise<unknown>
  interpretMovScriptWorkspace?: (input?: ElectronMovScriptWorkspaceInterpretActionInput) => Promise<unknown>
  queryMovScriptEngineWorkspaceEntities?: (input: ElectronMovScriptEngineWorkspaceQueryEntitiesInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['queryEntities']>>>
  queryMovScriptEngineWorkspaceSettings?: (input: ElectronMovScriptEngineWorkspaceQuerySettingsInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['querySettings']>>>
  queryMovScriptEngineWorkspaceAssets?: (input: ElectronMovScriptEngineWorkspaceQueryAssetsInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['queryAssets']>>>
  upsertMovScriptEngineWorkspaceSetting?: (input: ElectronMovScriptEngineWorkspaceUpsertSettingInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['upsertSetting']>>>
  upsertMovScriptEngineWorkspaceAsset?: (input: ElectronMovScriptEngineWorkspaceUpsertAssetInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['upsertAsset']>>>
  upsertMovScriptEngineWorkspaceScript?: (input: ElectronMovScriptEngineWorkspaceUpsertScriptInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['upsertScript']>>>
  readMovScriptEngineWorkspaceScriptSource?: (input: ElectronMovScriptEngineWorkspaceReadScriptSourceInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['readScriptSource']>>>
  deleteMovScriptEngineWorkspaceEntity?: (input: ElectronMovScriptEngineWorkspaceDeleteEntityInput) => Promise<void>
  saveMovScriptEngineWorkspaceProductionSnapshot?: (input: ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>>>
  upsertMovScriptEngineWorkspaceProjectStandards?: (input: ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['upsertProjectStandards']>>>
  upsertMovScriptEngineWorkspaceContentUnit?: (input: ElectronMovScriptEngineWorkspaceUpsertContentUnitInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['upsertContentUnit']>>>
  selectMovScriptEngineWorkspaceCandidate?: (input: ElectronMovScriptEngineWorkspaceSelectCandidateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['selectCandidate']>>>
  appendMovScriptEngineWorkspaceCandidate?: (input: ElectronMovScriptEngineWorkspaceAppendCandidateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['appendCandidate']>>>
  createMovScriptEngineWorkspaceAssetSlotCandidate?: (input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['createAssetSlotCandidate']>>>
  createMovScriptEngineWorkspaceKeyframeCandidate?: (input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['createKeyframeCandidate']>>>
  loadMovScriptEngineContentWorkspaceSnapshot?: (input: ElectronMovScriptEngineProjectInput) => Promise<ContentSourceWorkspaceSnapshot>
  loadMovScriptEngineContentWorkspace?: (input: ElectronMovScriptEngineProjectInput) => Promise<ContentSourceWorkspaceData>
  createMovScriptEngineContentCandidate?: (input: ElectronMovScriptEngineContentCandidateCreateInput) => Promise<ContentCandidateRecord>
  selectMovScriptEngineContentUnitCandidate?: (input: ElectronMovScriptEngineContentCandidateSelectInput) => Promise<void>
  updateMovScriptEngineContentUnitEditPrompt?: (input: ElectronMovScriptEngineContentUnitEditPromptInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['updateContentUnitEditPrompt']>>>
  updateMovScriptEngineExpressionUnit?: (input: ElectronMovScriptEngineExpressionUnitInput) => Promise<void>
  updateMovScriptEngineAudioCue?: (input: ElectronMovScriptEngineAudioCueInput) => Promise<void>
  updateMovScriptEngineTransition?: (input: ElectronMovScriptEngineTransitionInput) => Promise<void>
  updateMovScriptEngineStoryboardTimeline?: (input: ElectronMovScriptEngineStoryboardTimelineInput) => Promise<void>
  writeMovScriptEngineHierarchyNode?: (input: ElectronMovScriptEngineHierarchyNodeWriteInput) => Promise<void>
  syncMovScriptEngineContentWorkspace?: (input: ElectronMovScriptEngineProjectInput) => Promise<void>
  initProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  commitProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  pullProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  pushProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  listPluginCatalogPackPlugins?: () => Promise<{ dirs: ElectronPluginCatalogPackStoreDirs; plugins: ElectronPluginCatalogPackPlugin[] }>
  installPluginCatalogPack?: (input: ElectronPluginCatalogPackInstallInput) => Promise<ElectronPluginCatalogPackInstallResult>
  uninstallPluginCatalogPack?: (input: ElectronPluginCatalogPackUninstallInput) => Promise<ElectronPluginCatalogPackUninstallResult>
  getProjectPluginSnapshot?: (input?: { workspaceDir?: string; projectId?: string | number; userId?: string | number; orgId?: string | number }) => Promise<ElectronProjectPluginSnapshot>
  installProjectPlugin?: (input: ElectronProjectPluginInstallInput) => Promise<ElectronProjectPluginSnapshot>
  setProjectSkillEnabled?: (input: ElectronProjectSkillToggleInput) => Promise<ElectronProjectPluginSnapshot>
  clipVideo?: (input: ElectronVideoClipInput) => Promise<ElectronVideoClipResult>
  exportTimelineVideo?: (input: ElectronTimelineVideoInput) => Promise<ElectronTimelineVideoResult>
  getVideoClipStatus?: () => Promise<ElectronVideoClipStatus>
  analyzeShotCuts?: (input: ElectronShotCutInput) => Promise<ElectronShotCutResult>
  onMCPOpenRoute?: (handler: (route: string) => void) => () => void
}

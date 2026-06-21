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
  ElectronSdkRuntimeNotifyInput,
  ElectronSdkRuntimeNotificationEvent,
  ElectronSdkRuntimePackageCancelInput,
  ElectronSdkRuntimePackageCancelResult,
  ElectronSdkRuntimePackageStatus,
  ElectronSdkRuntimePackageStatusInput,
  ElectronSdkRuntimeRequestInput,
  ElectronSdkRuntimeRequestResult,
  ElectronSdkRuntimeServerRequestEvent,
  ElectronSdkRuntimeServerRequestResponseInput,
  ElectronAppServerRuntimeInstallResult,
  ElectronAdminAuthSessionInput,
  ElectronAgentSessionStateResult,
  ElectronAgentSessionStateSaveInput,
  ElectronDesktopStateInput,
  ElectronDesktopStateResult,
  ElectronDesktopStateSaveInput,
  ElectronAppUpdateStatus,
  ElectronAppWindowContext,
  ElectronAppSettingsSecrets,
  ElectronAgentRuntimeCredentialSummary,
  ElectronBackendAuthSessionInput,
  ElectronRuntimeConfig,
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
  ElectronMovScriptHomeInput,
  ElectronMCPServerStatus,
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineAssetCreateInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentUnitBackendPromptBuildInput,
  ElectronMovScriptEngineContentUnitBackendPromptBuildResult,
  ElectronMovScriptEngineContentUnitCreateInput,
  ElectronMovScriptEngineContentUnitEnsureInput,
  ElectronMovScriptEngineContentUnitGenerationPromptReadInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineEntityBasicsUpdateInput,
  ElectronMovScriptEngineExpressionUnitCreateInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineKeyframeInput,
  ElectronMovScriptEngineProductionCreateInput,
  ElectronMovScriptEngineProjectInput,
  ElectronMovScriptEngineSceneMomentCreateInput,
  ElectronMovScriptEngineSceneMomentSettingConnectInput,
  ElectronMovScriptEngineSegmentCreateInput,
  ElectronMovScriptEngineSettingCreateInput,
  ElectronMovScriptEngineSettingStateCreateInput,
  ElectronMovScriptEngineStoryboardInput,
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
  ElectronMovScriptEngineWorkspaceUpdatedEvent,
  ElectronMovScriptWorkspaceConfig,
  ElectronMovScriptWorkspaceConfigSaveInput,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFileWriteInput,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceMediaFileReadResult,
  ElectronLocalProjectCreateInput,
  ElectronLocalProjectBindInput,
  ElectronLocalProjectInspectInput,
  ElectronLocalProjectInspection,
  ElectronLocalProjectOpenInput,
  ElectronLocalProjectResult,
  ElectronMovScriptWorkspaceInterpretActionInput,
  ElectronMovScriptWorkspaceRootResult,
  ElectronPluginCatalogPackInstallInput,
  ElectronPluginCatalogPackInstallResult,
  ElectronPluginCatalogPackPlugin,
  ElectronPluginCatalogPackStoreDirs,
  ElectronPluginCatalogPackUninstallInput,
  ElectronPluginCatalogPackUninstallResult,
  ElectronProjectPluginInstallInput,
  ElectronProjectPluginToggleInput,
  ElectronProjectPluginSnapshot,
  ElectronProjectSkillToggleInput,
  ElectronSystemPluginInstallInput,
  ElectronSystemPluginUninstallInput,
  ElectronProjectGitActionInput,
  ElectronProjectGitActionResult,
  ElectronProviderSessionSummary,
  ElectronShotCutInput,
  ElectronShotCutResult,
  ElectronMediaPipelineTaskLogs,
  ElectronMediaPipelineTaskEvent,
  ElectronMediaEditingProjectEvent,
  ElectronMediaPipelineCapabilities,
  ElectronMediaEditingProjectDeleteResult,
  ElectronMediaEditingProjectGetResult,
  ElectronMediaEditingProjectListResult,
  ElectronMediaEditingProjectSaveResult,
  ElectronMediaExportImportInput,
  ElectronMediaExportImportResult,
  ElectronMediaExportSaveLocalInput,
  ElectronMediaExportSaveLocalResult,
  ElectronMediaHlsPublishInput,
  ElectronMediaHlsPublishResult,
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskRequest,
  ElectronMediaPipelineTaskState,
  ElectronDockShortcutSnapshot,
  ElectronOpenCanvasWindowInput,
  ElectronOpenEditingProjectWindowInput,
  ElectronOpenToolWindowInput,
  ElectronUpdateAppWindowRouteContextInput,
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
  openDirectory?: () => Promise<string | null>
  saveFile?: (defaultPath?: string) => Promise<string | null>
  revealFileInFolder?: (input: { path: string }) => Promise<{ ok: true }>
  windowControl?: (action: ElectronWindowControlAction) => Promise<ElectronWindowState | undefined>
  getWindowState?: () => Promise<ElectronWindowState>
  onWindowState?: (handler: (state: ElectronWindowState) => void) => () => void
  getAppWindowContext?: () => Promise<ElectronAppWindowContext>
  openHomeWindow?: () => Promise<ElectronAppWindowContext>
  openAgentWindow?: () => Promise<ElectronAppWindowContext>
  openProjectWindow?: (input: ElectronOpenProjectWindowInput) => Promise<ElectronAppWindowContext>
  openEditingWindow?: () => Promise<ElectronAppWindowContext>
  openEditingProjectWindow?: (input: ElectronOpenEditingProjectWindowInput) => Promise<ElectronAppWindowContext>
  openCanvasWindow?: (input?: ElectronOpenCanvasWindowInput) => Promise<ElectronAppWindowContext>
  openToolWindow?: (input?: ElectronOpenToolWindowInput) => Promise<ElectronAppWindowContext>
  updateAppWindowRouteContext?: (input: ElectronUpdateAppWindowRouteContextInput) => Promise<ElectronAppWindowContext>
  updateDockShortcutMenu?: (snapshot: ElectronDockShortcutSnapshot) => Promise<void>
  updateMCPContext?: (snapshot: MCPContextUpdate) => Promise<void>
  getMCPStatus?: () => Promise<ElectronMCPServerStatus>
  setAppSettings?: (settings: AppSettings) => Promise<void>
  getAppSettings?: () => Promise<AppSettings | null>
  onAppSettingsUpdated?: (handler: (settings: AppSettings) => void) => () => void
  getAppSettingsSecrets?: () => Promise<ElectronAppSettingsSecrets>
  getAgentRuntimeCredentialSummary?: () => Promise<ElectronAgentRuntimeCredentialSummary>
  getAgentSessionState?: (input?: ElectronMovScriptHomeInput) => Promise<ElectronAgentSessionStateResult>
  setAgentSessionState?: (input: ElectronMovScriptHomeInput & ElectronAgentSessionStateSaveInput) => Promise<ElectronAgentSessionStateResult>
  getDesktopState?: (input: ElectronDesktopStateInput) => Promise<ElectronDesktopStateResult>
  setDesktopState?: (input: ElectronDesktopStateSaveInput) => Promise<ElectronDesktopStateResult>
  removeDesktopState?: (input: ElectronDesktopStateInput) => Promise<{ ok: true; key: string; movScriptHomeDir: string; workspaceDir: string; path: string }>
  setAgentRuntimeApiKey?: (input: { providerKey?: string; providerKeys?: string[]; apiKey?: string | null }) => Promise<ElectronAgentRuntimeCredentialSummary>
  getRuntimeConfig?: () => Promise<ElectronRuntimeConfig>
  setGenerationToolsSettings?: (settings: GenerationToolsSettings) => Promise<void>
  testGenerationToolServer?: (server: Partial<GenerationToolServer>) => Promise<ElectronGenerationToolServerTestResult>
  onBackendStatus?: (handler: (status: ElectronBackendStatus) => void) => () => void
  onCrossPageNotification?: (handler: (event: unknown) => void) => () => void
  getBackendStatus?: () => Promise<ElectronBackendStatus>
  setBackendAuthSession?: (session: ElectronBackendAuthSessionInput | null) => Promise<void>
  handleBackendAuthExpired?: () => Promise<ElectronAppWindowContext[]>
  onBackendAuthSessionExpired?: (handler: () => void) => () => void
  getAppUpdateStatus?: () => Promise<ElectronAppUpdateStatus>
  checkForAppUpdate?: () => Promise<ElectronAppUpdateStatus>
  openAppUpdateDownload?: () => Promise<ElectronAppUpdateStatus>
  onAppUpdateStatus?: (handler: (status: ElectronAppUpdateStatus) => void) => () => void
  openAdminConsole?: (input?: { baseURL?: string; path?: string; authSession?: ElectronAdminAuthSessionInput | null }) => Promise<{ url: string }>
  openExternalURL?: (input: { url: string }) => Promise<{ url: string }>
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
  sdkRuntimeRequest?: <T = ElectronSdkRuntimeRequestResult>(input: ElectronSdkRuntimeRequestInput) => Promise<T>
  sdkRuntimePackageStatus?: (input: ElectronSdkRuntimePackageStatusInput) => Promise<ElectronSdkRuntimePackageStatus>
  sdkRuntimeCancelPackageInstall?: (input: ElectronSdkRuntimePackageCancelInput) => Promise<ElectronSdkRuntimePackageCancelResult>
  sdkRuntimeInstallAppServerPackage?: () => Promise<ElectronAppServerRuntimeInstallResult>
  sdkRuntimeNotify?: (input: ElectronSdkRuntimeNotifyInput) => Promise<void>
  sdkRuntimeRespondToServerRequest?: (input: ElectronSdkRuntimeServerRequestResponseInput) => Promise<void>
  onSdkRuntimeNotification?: (handler: (event: ElectronSdkRuntimeNotificationEvent) => void) => () => void
  onSdkRuntimeServerRequest?: (handler: (event: ElectronSdkRuntimeServerRequestEvent) => void) => () => void
  createLocalTerminal?: (input: ElectronLocalTerminalCreateInput) => Promise<ElectronLocalTerminalCreateResult>
  writeLocalTerminal?: (input: ElectronLocalTerminalWriteInput) => Promise<void>
  resizeLocalTerminal?: (input: ElectronLocalTerminalResizeInput) => Promise<void>
  killLocalTerminal?: (input: ElectronLocalTerminalKillInput) => Promise<void>
  onLocalTerminalEvent?: (handler: (event: ElectronLocalTerminalEvent) => void) => () => void
  listProviderSessions?: (input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }) => Promise<{ sessions: ElectronProviderSessionSummary[] }>
  getMovScriptWorkspaceRoot?: (input?: ElectronMovScriptHomeInput) => Promise<ElectronMovScriptWorkspaceRootResult>
  inspectLocalMovScriptProject?: (input: ElectronLocalProjectInspectInput) => Promise<ElectronLocalProjectInspection>
  createLocalMovScriptProject?: (input: ElectronLocalProjectCreateInput) => Promise<ElectronLocalProjectResult>
  openLocalMovScriptProject?: (input: ElectronLocalProjectOpenInput) => Promise<ElectronLocalProjectResult>
  bindLocalMovScriptProject?: (input: ElectronLocalProjectBindInput) => Promise<ElectronLocalProjectResult>
  getMovScriptWorkspaceConfig?: (input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }) => Promise<ElectronMovScriptWorkspaceConfig>
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
  readMovScriptEngineContentUnitGenerationPrompt?: (input: ElectronMovScriptEngineContentUnitGenerationPromptReadInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['readContentUnitGenerationPrompt']>>>
  buildMovScriptEngineContentUnitBackendPrompt?: (input: ElectronMovScriptEngineContentUnitBackendPromptBuildInput) => Promise<ElectronMovScriptEngineContentUnitBackendPromptBuildResult>
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
  createMovScriptEngineContentUnit?: (input: ElectronMovScriptEngineContentUnitCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createContentUnit']>>>
  ensureMovScriptEngineContentUnitForEntity?: (input: ElectronMovScriptEngineContentUnitEnsureInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['ensureContentUnitForEntity']>>>
  createMovScriptEngineSetting?: (input: ElectronMovScriptEngineSettingCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createSetting']>>>
  createMovScriptEngineSettingState?: (input: ElectronMovScriptEngineSettingStateCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createSettingState']>>>
  createMovScriptEngineAsset?: (input: ElectronMovScriptEngineAssetCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createAsset']>>>
  updateMovScriptEngineEntityBasics?: (input: ElectronMovScriptEngineEntityBasicsUpdateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['updateEntityBasics']>>>
  connectMovScriptEngineSceneMomentSetting?: (input: ElectronMovScriptEngineSceneMomentSettingConnectInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['connectSceneMomentSetting']>>>
  createMovScriptEngineProduction?: (input: ElectronMovScriptEngineProductionCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createProduction']>>>
  createMovScriptEngineSegment?: (input: ElectronMovScriptEngineSegmentCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createSegment']>>>
  createMovScriptEngineSceneMoment?: (input: ElectronMovScriptEngineSceneMomentCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createSceneMoment']>>>
  createMovScriptEngineExpressionUnit?: (input: ElectronMovScriptEngineExpressionUnitCreateInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createExpressionUnit']>>>
  updateMovScriptEngineContentUnitEditPrompt?: (input: ElectronMovScriptEngineContentUnitEditPromptInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['updateContentUnitEditPrompt']>>>
  createMovScriptEngineKeyframe?: (input: ElectronMovScriptEngineKeyframeInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createKeyframe']>>>
  createMovScriptEngineStoryboard?: (input: ElectronMovScriptEngineStoryboardInput) => Promise<Awaited<ReturnType<import('@movscript/engine').MovScriptEngine['createStoryboard']>>>
  updateMovScriptEngineExpressionUnit?: (input: ElectronMovScriptEngineExpressionUnitInput) => Promise<void>
  updateMovScriptEngineAudioCue?: (input: ElectronMovScriptEngineAudioCueInput) => Promise<void>
  updateMovScriptEngineTransition?: (input: ElectronMovScriptEngineTransitionInput) => Promise<void>
  updateMovScriptEngineStoryboardTimeline?: (input: ElectronMovScriptEngineStoryboardTimelineInput) => Promise<void>
  writeMovScriptEngineHierarchyNode?: (input: ElectronMovScriptEngineHierarchyNodeWriteInput) => Promise<void>
  syncMovScriptEngineContentWorkspace?: (input: ElectronMovScriptEngineProjectInput) => Promise<void>
  onMovScriptEngineWorkspaceUpdated?: (handler: (event: ElectronMovScriptEngineWorkspaceUpdatedEvent) => void) => () => void
  initProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  getProjectGitWorkspaceStatus?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  commitProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  pullProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  pushProjectGitWorkspace?: (input: ElectronProjectGitActionInput) => Promise<ElectronProjectGitActionResult>
  listPluginCatalogPackPlugins?: () => Promise<{ dirs: ElectronPluginCatalogPackStoreDirs; plugins: ElectronPluginCatalogPackPlugin[] }>
  installPluginCatalogPack?: (input: ElectronPluginCatalogPackInstallInput) => Promise<ElectronPluginCatalogPackInstallResult>
  uninstallPluginCatalogPack?: (input: ElectronPluginCatalogPackUninstallInput) => Promise<ElectronPluginCatalogPackUninstallResult>
  getProjectPluginSnapshot?: (input?: ElectronMovScriptHomeInput & { projectDir?: string; userId?: string | number; orgId?: string | number }) => Promise<ElectronProjectPluginSnapshot>
  installSystemPlugin?: (input: ElectronSystemPluginInstallInput) => Promise<ElectronProjectPluginSnapshot>
  uninstallSystemPlugin?: (input: ElectronSystemPluginUninstallInput) => Promise<ElectronProjectPluginSnapshot>
  installProjectPlugin?: (input: ElectronProjectPluginInstallInput) => Promise<ElectronProjectPluginSnapshot>
  setProjectPluginEnabled?: (input: ElectronProjectPluginToggleInput) => Promise<ElectronProjectPluginSnapshot>
  setProjectSkillEnabled?: (input: ElectronProjectSkillToggleInput) => Promise<ElectronProjectPluginSnapshot>
  renderMediaPipelineSingleClip?: (input: ElectronVideoClipInput) => Promise<ElectronVideoClipResult>
  renderMediaPipelineTimelineVideo?: (input: ElectronTimelineVideoInput) => Promise<ElectronTimelineVideoResult>
  getMediaPipelineFFmpegStatus?: () => Promise<ElectronVideoClipStatus>
  analyzeMediaPipelineShotCuts?: (input: ElectronShotCutInput) => Promise<ElectronShotCutResult>
  saveMediaEditingProject?: (input: {
    editingProject?: ElectronMediaPipelineEditingProject
    editing_project?: ElectronMediaPipelineEditingProject
    expectedRevision?: number
    expected_revision?: number
  }) => Promise<ElectronMediaEditingProjectSaveResult>
  getMediaEditingProject?: (input: { projectId?: string; project_id?: string; editingProjectId?: string; editing_project_id?: string }) => Promise<ElectronMediaEditingProjectGetResult>
  listMediaEditingProjects?: () => Promise<ElectronMediaEditingProjectListResult>
  deleteMediaEditingProject?: (input: { projectId?: string; project_id?: string; editingProjectId?: string; editing_project_id?: string }) => Promise<ElectronMediaEditingProjectDeleteResult>
  importMediaExportResource?: (input: ElectronMediaExportImportInput) => Promise<ElectronMediaExportImportResult>
  saveMediaExportLocal?: (input: ElectronMediaExportSaveLocalInput) => Promise<ElectronMediaExportSaveLocalResult>
  publishMediaHlsStream?: (input: ElectronMediaHlsPublishInput) => Promise<ElectronMediaHlsPublishResult>
  getMediaPipelineCapabilities?: () => Promise<ElectronMediaPipelineCapabilities>
  createMediaPipelineTask?: (input: ElectronMediaPipelineTaskRequest) => Promise<ElectronMediaPipelineTaskState>
  getMediaPipelineTask?: (input: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => Promise<ElectronMediaPipelineTaskState | null>
  cancelMediaPipelineTask?: (input: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => Promise<ElectronMediaPipelineTaskState>
  getMediaPipelineTaskLogs?: (input: { taskId?: string; task_id?: string; projectId?: string; project_id?: string }) => Promise<ElectronMediaPipelineTaskLogs>
  onMediaPipelineTaskEvent?: (handler: (event: ElectronMediaPipelineTaskEvent) => void) => () => void
  onMediaEditingProjectEvent?: (handler: (event: ElectronMediaEditingProjectEvent) => void) => () => void
  onMCPOpenRoute?: (handler: (route: string) => void) => () => void
}

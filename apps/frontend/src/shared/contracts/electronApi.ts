import type { AppSettings } from './appSettings'
import type { GenerationToolServer, GenerationToolsSettings } from './generationTools'
import type { MCPContextUpdate } from './mcpContext'
import type { MovScriptWorkspaceConfig, MovScriptWorkspaceRootManifest } from '@movscript/core/workspace'
import type { MovScriptWorkspaceService } from '@movscript/workspace'
import type {
  ContentCandidateRecord,
  ContentSourceWorkspaceAudioCuePatch,
  ContentSourceWorkspaceData,
  ContentSourceWorkspaceEditPromptPatch,
  ContentSourceWorkspaceExpressionUnitPatch,
  ContentSourceWorkspaceSnapshot,
  ContentSourceWorkspaceStoryboardTimelinePatch,
  ContentSourceWorkspaceTransitionPatch,
} from '@movscript/core/content'

export type ElectronBackendStatus = {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

export type ElectronMCPServerStatus = {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  error?: string
}

export type ElectronEmbeddedBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ElectronEmbeddedBrowserState = {
  tabId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

export type ElectronVideoClipInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourcePath?: string
  sourceName?: string
  startMs: number
  endMs: number
  outputName?: string
  mode?: 'fast' | 'accurate'
  fadeInMs?: number
  fadeOutMs?: number
}

export type ElectronVideoClipResult = {
  ok: boolean
  outputPath?: string
  outputName?: string
  mode?: 'fast' | 'accurate'
  fallbackApplied?: boolean
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}

export type ElectronTimelineVideoInput = {
  clips: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    startMs: number
    endMs: number
    timelineStartMs?: number
    layerIndex?: number
    volume?: number
    muted?: boolean
    speed?: number
    fadeInMs?: number
    fadeOutMs?: number
    cropLeftPercent?: number
    cropRightPercent?: number
    cropTopPercent?: number
    cropBottomPercent?: number
  }>
  captions?: Array<{
    startMs: number
    endMs: number
    text: string
    layerIndex?: number
    fontSize?: number
    yPercent?: number
    textColor?: string
    boxOpacityPercent?: number
  }>
  audioClips?: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    startMs: number
    endMs: number
    timelineStartMs: number
    volume?: number
    fadeInMs?: number
    fadeOutMs?: number
  }>
  overlays?: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    sourceKind?: 'image' | 'video'
    startMs: number
    endMs: number
    sourceStartMs?: number
    sourceEndMs?: number
    layerIndex?: number
    fadeInMs?: number
    fadeOutMs?: number
    cropLeftPercent?: number
    cropRightPercent?: number
    cropTopPercent?: number
    cropBottomPercent?: number
    xPercent?: number
    yPercent?: number
    scalePercent?: number
    opacityPercent?: number
  }>
  outputName?: string
}

export type ElectronTimelineVideoResult = {
  ok: boolean
  outputName?: string
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}

export type ElectronVideoClipStatus = {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
  expectedBundledPath?: string
  platform?: string
  arch?: string
}

export type ElectronShotCutInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export type ElectronShotCutSegment = {
  startSec: number
  endSec: number
}

export type ElectronShotCutResult = {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: ElectronShotCutSegment[]
  error?: string
  code?: string
}

export type ElectronAppServerConnectInput = {
  url: string
}

export type ElectronAppServerLifecycle = 'movscript-owned'
export type ElectronMovScriptWorkspaceScope = 'global' | 'project' | 'production'

export type ElectronMovScriptWorkspaceContext = {
  scope?: ElectronMovScriptWorkspaceScope
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  productionId?: string | number
}

export type ElectronLocalTerminalCreateInput = {
  sessionId?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext
  size?: {
    rows: number
    cols: number
  }
}

export type ElectronLocalTerminalCreateResult = {
  sessionId: string
  cwd: string
  shell: string
  pid?: number
}

export type ElectronLocalTerminalWriteInput = {
  sessionId: string
  data: string
}

export type ElectronLocalTerminalResizeInput = {
  sessionId: string
  size: {
    rows: number
    cols: number
  }
}

export type ElectronLocalTerminalKillInput = {
  sessionId: string
}

export type ElectronLocalTerminalEvent =
  | {
    kind: 'output'
    sessionId: string
    data: string
  }
  | {
    kind: 'exit'
    sessionId: string
    exitCode: number
    signal?: number
  }
  | {
    kind: 'error'
    sessionId: string
    error: string
  }

export type ElectronAppServerProfile = {
  id: string
  label?: string
  providerKey?: 'codex' | 'mova' | (string & {})
  executablePath?: string
  executableCommand?: string
  executableEnvVar?: string
  compatibilityBinEnvNames?: string[]
  candidateRootRelativePaths?: string[]
  candidateBinaryNames?: string[]
  pathFallbackReady?: boolean
  home?: string
  compatibilityHomeEnvNames?: string[]
  workspaceDir?: string
  lifecycle?: ElectronAppServerLifecycle
}

export type ElectronAppServerEnsureInput = {
  profile: ElectronAppServerProfile
  workspaceContext?: ElectronMovScriptWorkspaceContext
}

export type ElectronAppServerStatusInput = {
  profileId?: string
}

export type ElectronAppServerStopInput = {
  profileId?: string
}

export type ElectronAppServerConfigStatus = {
  ok: boolean
  sourceConfigPath: string
  configTomlPath: string
  authJsonPath: string
  baseURL: string
  apiKind: string
  apiKeyConfigured: boolean
  accountConfigured: boolean
  accountSource: 'movscript-account' | 'movscript-environment' | 'movscript-model-config' | 'movscript-backend-session' | 'local-home' | 'managed-home' | 'custom-config' | 'none'
  distributedAt: string
  warning?: string
}

export type ElectronAppServerPluginStatus = {
  ok: boolean
  marketplaceName: string
  pluginName: string
  pluginKey: string
  pluginSourcePath: string
  marketplaceRoot: string
  installedPluginRoot: string
  version: string
  hash: string
  error?: string
}

export type ElectronAppServerExecutableDiagnostic = {
  ok: boolean
  message: string
  envVar?: string
  cwd?: string
  sourceDir?: string
  candidatePaths?: string[]
}

export type ElectronAppServerStatus = {
  ok: boolean
  running: boolean
  managed: boolean
  profileId: string
  label?: string
  endpoint?: string
  pid?: number
  executablePath?: string
  home?: string
  rustLog?: string
  workspaceDir?: string
  cliBinDir?: string
  cliEnv?: Record<string, string>
  config?: ElectronAppServerConfigStatus
  workspaceContext?: ElectronMovScriptWorkspaceContext
  providerSessionCwd?: string
  preflight?: {
    ok: boolean
    configTomlExists: boolean
    authJsonExists: boolean
    spawnEnvReady: boolean
    accountConfigured: boolean
    detail: string
  }
  plugin?: ElectronAppServerPluginStatus
  executableDiagnostic?: ElectronAppServerExecutableDiagnostic
  error?: string
}

export type ElectronAppServerConnection = {
  connectionId: string
}

export type ElectronAppServerSendInput = {
  connectionId: string
  payload: string
}

export type ElectronAppServerCloseInput = {
  connectionId: string
}

export type ElectronAppServerMessage = {
  connectionId: string
  kind: 'message' | 'error' | 'close'
  data?: string
  error?: string
}

export type ElectronAppServerLogEvent = {
  profileId: string
  providerKey: string
  label?: string
  stream: 'stdout' | 'stderr'
  chunk: string
  at: string
  transport: 'stdio' | 'websocket'
  endpoint?: string
}

export type ElectronProviderRunSummary = {
  id: string
  sessionId?: string
  threadId: string
  status: string
  role?: string
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  pendingApprovals?: unknown[]
  pendingInputRequests?: unknown[]
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  warnings?: string[]
  steps: unknown[]
}

export type ElectronProviderSessionSummary = {
  session: {
    id: string
    title?: string
    projectId?: number
    createdAt: string
    updatedAt: string
    archived?: boolean
  }
  workspaceDir?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext
  providerSessionCwd?: string
  state?: {
    rootThreadId?: string
    interactiveThreadId?: string
    activeThreadId?: string
    title?: string
    projectId?: number
    archived?: boolean
    status?: string
    threadUpdatedAt?: string
    messageCount: number
    lastMessageAt?: string
  }
  runs?: ElectronProviderRunSummary[]
}

export type ElectronMovScriptWorkspaceConfig = {
  schema: MovScriptWorkspaceConfig['schema']
  updatedAt: string
  modelConfig?: Record<string, unknown>
  toolProviders?: Array<Record<string, unknown>>
  modelProviders?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  environment?: Record<string, string>
  providers?: Record<string, Record<string, unknown>>
}

export type ElectronMovScriptWorkspaceConfigSaveInput = {
  providerProfileKey?: string
  workspaceDir?: string
  modelConfig?: Record<string, unknown> | null
  toolProviders?: Array<Record<string, unknown>> | null
  modelProviders?: Array<Record<string, unknown>> | null
  permissions?: Record<string, unknown> | null
  environment?: Record<string, string> | null
  providers?: Record<string, Record<string, unknown>> | null
}

export type ElectronMovScriptWorkspaceRootManifest = MovScriptWorkspaceRootManifest

export type ElectronMovScriptWorkspaceRootResult = {
  workspaceDir: string
  rootDir: string
  controlDir: string
  configTomlPath: string
  manifestPath: string
  providersDir: string
  backendDir: string
  binDir: string
  manifest: ElectronMovScriptWorkspaceRootManifest
}

export type ElectronMovScriptWorkspaceFileEntry = {
  name: string
  path: string
  kind: 'file' | 'directory'
  size: number
  updatedAt: string
}

export type ElectronMovScriptWorkspaceFilesInput = {
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
  path?: string
}

export type ElectronMovScriptWorkspaceFilesListResult = {
  rootPath: string
  path: string
  entries: ElectronMovScriptWorkspaceFileEntry[]
}

export type ElectronMovScriptWorkspaceFileReadResult = {
  rootPath: string
  path: string
  content: string
  size: number
  updatedAt: string
}

export type ElectronMovScriptWorkspaceFileWriteInput = ElectronMovScriptWorkspaceFilesInput & {
  content: string
}

export type ElectronMovScriptWorkspaceInterpretActionInput = {
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
}

export type ElectronMovScriptEngineProjectInput = ElectronMovScriptWorkspaceInterpretActionInput

export type ElectronMovScriptEngineWorkspaceQueryEntitiesInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['queryEntities']>[0]
}

export type ElectronMovScriptEngineWorkspaceQuerySettingsInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['querySettings']>[0]
}

export type ElectronMovScriptEngineWorkspaceQueryAssetsInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['queryAssets']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertSettingInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertSetting']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertAssetInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertAsset']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertScriptInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertScript']>[0]
}

export type ElectronMovScriptEngineWorkspaceReadScriptSourceInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['readScriptSource']>[0]
}

export type ElectronMovScriptEngineWorkspaceDeleteEntityInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['deleteEntity']>[0]
}

export type ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['saveProductionSnapshot']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertProjectStandards']>[0]
}

export type ElectronMovScriptEngineWorkspaceCandidateCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['createAssetSlotCandidate']>[0]
}

export type ElectronMovScriptEngineContentCandidateCreateInput = {
  projectId: number | string
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
  contentUnitId: string | number
  candidateId: string | number
  source: 'ai_generate' | 'resource_library'
  status: 'queued' | 'imported'
  producer: Record<string, unknown>
  outputs: Array<{
    kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
    resource_id: string | number
    mime_type?: string
    width?: number
    height?: number
    duration_sec?: number
    metadata?: Record<string, unknown>
  }>
  promptSnapshot: Record<string, unknown>
  createdAt: string
}

export type ElectronMovScriptEngineContentCandidateSelectInput = {
  projectId: number | string
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
  contentUnitId: string | number
  candidateId: string | number
  resourceId?: string | number
  reason: 'content_source_workspace_selection'
}

export type ElectronMovScriptEngineContentUnitEditPromptInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceEditPromptPatch

export type ElectronMovScriptEngineExpressionUnitInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceExpressionUnitPatch

export type ElectronMovScriptEngineAudioCueInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceAudioCuePatch

export type ElectronMovScriptEngineTransitionInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceTransitionPatch

export type ElectronMovScriptEngineStoryboardTimelineInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceStoryboardTimelinePatch

export type ElectronMovScriptEngineHierarchyNodeWriteInput = ElectronMovScriptEngineProjectInput & {
  targetPath: string
  record: Record<string, unknown>
}

export type ElectronProjectGitActionInput = {
  projectId: number | string
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
}

export type ElectronProjectGitActionResult = {
  ok: boolean
  operation: 'commit' | 'init' | 'pull' | 'push'
  projectId: number
  workspaceDir: string
  path: string
  remoteURL?: string
  branch?: string
  stdout?: string
  stderr?: string
  error?: string
}

export type ElectronPluginCatalogPackStoreDirs = {
  rootDir: string
  skillsDir: string
  toolsDir: string
  packsDir: string
  configFilesDir: string
}

export type ElectronPluginCatalogPackFile = {
  path: string
  content: string
}

export type ElectronPluginCatalogPackInstallInput = {
  pluginId: string
  files: ElectronPluginCatalogPackFile[]
}

export type ElectronPluginCatalogPackInstallResult = {
  pluginId: string
  dirs: ElectronPluginCatalogPackStoreDirs
  targetDirs: Partial<Record<'skills' | 'tools' | 'packs' | 'configFiles', string>>
  installedFiles: string[]
}

export type ElectronPluginCatalogPackUninstallInput = {
  pluginId: string
}

export type ElectronPluginCatalogPackUninstallResult = {
  pluginId: string
  dirs: ElectronPluginCatalogPackStoreDirs
  removed: boolean
}

export type ElectronPluginCatalogPackPlugin = {
  pluginId: string
  kinds: Array<'skills' | 'tools' | 'packs' | 'configFiles'>
  paths: Partial<Record<'skills' | 'tools' | 'packs' | 'configFiles', string>>
}

export type ElectronWindowControlAction = 'close' | 'minimize' | 'toggleFullscreen'

export type ElectronWindowState = {
  fullscreen: boolean
  focused: boolean
}

export type ElectronGenerationToolServerTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
  server?: unknown
  data?: unknown
}

export type ElectronAPI = {
  platform?: NodeJS.Platform
  openFile?: () => Promise<string | null>
  saveFile?: (defaultPath?: string) => Promise<string | null>
  windowControl?: (action: ElectronWindowControlAction) => Promise<ElectronWindowState | undefined>
  getWindowState?: () => Promise<ElectronWindowState>
  onWindowState?: (handler: (state: ElectronWindowState) => void) => () => void
  updateMCPContext?: (snapshot: MCPContextUpdate) => Promise<void>
  getMCPStatus?: () => Promise<ElectronMCPServerStatus>
  setAppSettings?: (settings: AppSettings) => Promise<void>
  setGenerationToolsSettings?: (settings: GenerationToolsSettings) => Promise<void>
  testGenerationToolServer?: (server: Partial<GenerationToolServer>) => Promise<ElectronGenerationToolServerTestResult>
  onBackendStatus?: (handler: (status: ElectronBackendStatus) => void) => () => void
  getBackendStatus?: () => Promise<ElectronBackendStatus>
  openAdminConsole?: (input?: { baseURL?: string; path?: string }) => Promise<{ url: string }>
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
  createMovScriptEngineWorkspaceAssetSlotCandidate?: (input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['createAssetSlotCandidate']>>>
  createMovScriptEngineWorkspaceKeyframeCandidate?: (input: ElectronMovScriptEngineWorkspaceCandidateCreateInput) => Promise<Awaited<ReturnType<MovScriptWorkspaceService['createKeyframeCandidate']>>>
  loadMovScriptEngineContentWorkspaceSnapshot?: (input: ElectronMovScriptEngineProjectInput) => Promise<ContentSourceWorkspaceSnapshot>
  loadMovScriptEngineContentWorkspace?: (input: ElectronMovScriptEngineProjectInput) => Promise<ContentSourceWorkspaceData>
  createMovScriptEngineContentCandidate?: (input: ElectronMovScriptEngineContentCandidateCreateInput) => Promise<ContentCandidateRecord>
  selectMovScriptEngineContentUnitCandidate?: (input: ElectronMovScriptEngineContentCandidateSelectInput) => Promise<void>
  updateMovScriptEngineContentUnitEditPrompt?: (input: ElectronMovScriptEngineContentUnitEditPromptInput) => Promise<void>
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
  clipVideo?: (input: ElectronVideoClipInput) => Promise<ElectronVideoClipResult>
  exportTimelineVideo?: (input: ElectronTimelineVideoInput) => Promise<ElectronTimelineVideoResult>
  getVideoClipStatus?: () => Promise<ElectronVideoClipStatus>
  analyzeShotCuts?: (input: ElectronShotCutInput) => Promise<ElectronShotCutResult>
  onMCPOpenRoute?: (handler: (route: string) => void) => () => void
}

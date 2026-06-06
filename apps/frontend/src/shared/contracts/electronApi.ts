import type { AppSettings } from './appSettings'
import type { GenerationToolServer, GenerationToolsSettings } from './generationTools'
import type { MCPContextUpdate } from './mcpContext'
import type { MovScriptWorkspaceConfig } from '@movscript/core/workspace'

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
  projectId?: string | number
  productionId?: string | number
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
  workspaceDir?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext
  lifecycle?: ElectronAppServerLifecycle
}

export type ElectronAppServerEnsureInput = {
  profile: ElectronAppServerProfile
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
  accountSource: 'movscript-account' | 'movscript-environment' | 'movscript-model-config' | 'local-home' | 'managed-home' | 'custom-config' | 'none'
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
  workspaceDir?: string
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

export type ElectronMovScriptWorkspaceRootManifest = {
  schema: 'movscript.workspace-root.v1'
  workspaceId: string
  createdAt: string
  updatedAt: string
  backend?: {
    kind?: 'local' | 'cloud' | 'custom'
    baseURL?: string
  }
  activeUserId?: number
  layout: {
    projectionRoot: 'data'
    reviewsRoot: 'reviews'
    syncRoot: 'sync'
    providerConfigRoot: 'providers'
  }
}

export type ElectronMovScriptWorkspaceRootResult = {
  workspaceDir: string
  controlDir: string
  manifestPath: string
  projectionRootDir: string
  reviewsDir: string
  syncDir: string
  providersDir: string
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

export type ElectronMovScriptWorkspaceCloudActionInput = {
  namespace?: string
  path?: string
  cwd?: string
  reviewPath?: string
  mode?: 'safe' | 'merge' | 'overwrite' | 'review_required' | 'path_compat'
  userId?: number | string
}

export type ElectronProjectGitActionInput = {
  projectId: number | string
  workspaceDir?: string
  userId?: number | string
  orgId?: number | string
}

export type ElectronProjectGitActionResult = {
  ok: boolean
  operation: 'push'
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
  ensureAppServer?: (input: ElectronAppServerEnsureInput) => Promise<ElectronAppServerStatus>
  getAppServerStatus?: (input?: ElectronAppServerStatusInput) => Promise<ElectronAppServerStatus>
  stopAppServer?: (input?: ElectronAppServerStopInput) => Promise<ElectronAppServerStatus>
  appServerConnect?: (input: ElectronAppServerConnectInput) => Promise<ElectronAppServerConnection>
  appServerSend?: (input: ElectronAppServerSendInput) => Promise<void>
  appServerClose?: (input: ElectronAppServerCloseInput) => Promise<void>
  onAppServerMessage?: (handler: (message: ElectronAppServerMessage) => void) => () => void
  listProviderSessions?: (input?: { workspaceDir?: string; providerProfileKey?: string }) => Promise<{ sessions: ElectronProviderSessionSummary[] }>
  getMovScriptWorkspaceRoot?: (input?: { workspaceDir?: string }) => Promise<ElectronMovScriptWorkspaceRootResult>
  getMovScriptWorkspaceConfig?: (input?: { workspaceDir?: string; providerProfileKey?: string }) => Promise<ElectronMovScriptWorkspaceConfig>
  saveMovScriptWorkspaceConfig?: (input: ElectronMovScriptWorkspaceConfigSaveInput) => Promise<ElectronMovScriptWorkspaceConfig>
  listMovScriptWorkspaceFiles?: (input?: ElectronMovScriptWorkspaceFilesInput) => Promise<ElectronMovScriptWorkspaceFilesListResult>
  readMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFilesInput) => Promise<ElectronMovScriptWorkspaceFileReadResult>
  writeMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFileWriteInput) => Promise<ElectronMovScriptWorkspaceFileReadResult>
  deleteMovScriptWorkspaceFile?: (input: ElectronMovScriptWorkspaceFilesInput) => Promise<{ ok: true }>
  updateMovScriptWorkspaceProjection?: (input?: ElectronMovScriptWorkspaceCloudActionInput) => Promise<unknown>
  previewMovScriptWorkspaceApply?: (input?: ElectronMovScriptWorkspaceCloudActionInput) => Promise<unknown>
  applyMovScriptWorkspaceProjection?: (input?: ElectronMovScriptWorkspaceCloudActionInput) => Promise<unknown>
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

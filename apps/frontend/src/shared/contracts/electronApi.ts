import type { AppSettings } from './appSettings'
import type { GenerationToolServer, GenerationToolsSettings } from './generationTools'
import type { MCPContextUpdate } from './mcpContext'

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

export type ElectronMCPObjectSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type ElectronMCPPluginTool = {
  pluginId: string
  name: string
  description: string
  inputSchema: ElectronMCPObjectSchema
  outputSchema?: ElectronMCPObjectSchema
}

export type ElectronMCPPluginToolCall = {
  pluginId: string
  toolName: string
  args: Record<string, unknown>
}

export type ElectronAgentBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ElectronAgentBrowserState = {
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

export type ElectronAgentRuntimeTransportKind = 'http' | 'unix-socket' | 'named-pipe' | 'websocket'

export type ElectronAgentRuntimeEnsureInput = {
  baseURL?: string
  transportKind?: ElectronAgentRuntimeTransportKind
  socketPath?: string
  workspaceDir?: string
  sessionId?: string
  source?: string
}

export type ElectronAgentRuntimeStatus = {
  ok: boolean
  running: boolean
  managed: boolean
  started: boolean
  baseURL: string
  transportKind?: ElectronAgentRuntimeTransportKind
  endpoint?: string
  socketPath?: string
  workspaceDir?: string
  sessionId?: string
  pid?: number
  error?: string
}

export type ElectronAgentRuntimeRequestInput = ElectronAgentRuntimeEnsureInput & {
  path: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type ElectronAgentRuntimeResponse = {
  status: number
  statusText?: string
  headers: Record<string, string>
  body: string
}

export type ElectronAgentRuntimeStreamInput = ElectronAgentRuntimeRequestInput & {
  streamId: string
}

export type ElectronAgentRuntimeStreamCloseInput = {
  streamId: string
}

export type ElectronAgentRuntimeStreamMessage = {
  streamId: string
  kind: 'message' | 'error' | 'end'
  data?: string
  error?: string
}

export type ElectronAgentRuntimeRunSummary = {
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

export type ElectronAgentRuntimeSessionSummary = {
  session: {
    id: string
    title?: string
    projectId?: number
    createdAt: string
    updatedAt: string
    archived?: boolean
  }
  workspaceDir?: string
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
  runs?: ElectronAgentRuntimeRunSummary[]
  paths: {
    sessionDate: string
    sessionDir: string
    runtimeLogPath: string
    runtimePath: string
    lockPath: string
    heartbeatPath: string
    socketPath: string
  }
  runtime?: {
    pid: number
    endpoint: string
    transport: 'http' | 'unix-socket' | 'stdio'
    startedAt: string
    heartbeatAt: string
    version: string
    startedBy: 'desktop' | 'cli' | 'agent' | 'unknown'
  }
  running: boolean
  stale: boolean
  heartbeatAgeMs?: number
}

export type ElectronAgentWorkspaceConfig = {
  schema: 'movscript.agent.workspace-config.v1'
  updatedAt: string
  modelConfig?: Record<string, unknown>
  toolProviders?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  environment?: Record<string, string>
}

export type ElectronAgentWorkspaceConfigSaveInput = {
  workspaceDir?: string
  modelConfig?: Record<string, unknown> | null
  toolProviders?: Array<Record<string, unknown>> | null
  permissions?: Record<string, unknown> | null
  environment?: Record<string, string> | null
}

export type ElectronAgentCatalogPackStoreDirs = {
  rootDir: string
  skillsDir: string
  toolsDir: string
  packsDir: string
  configFilesDir: string
}

export type ElectronAgentCatalogPackFile = {
  path: string
  content: string
}

export type ElectronAgentCatalogPackInstallInput = {
  pluginId: string
  files: ElectronAgentCatalogPackFile[]
}

export type ElectronAgentCatalogPackInstallResult = {
  pluginId: string
  dirs: ElectronAgentCatalogPackStoreDirs
  targetDirs: Partial<Record<'skills' | 'tools' | 'packs' | 'configFiles', string>>
  installedFiles: string[]
}

export type ElectronAgentCatalogPackUninstallInput = {
  pluginId: string
}

export type ElectronAgentCatalogPackUninstallResult = {
  pluginId: string
  dirs: ElectronAgentCatalogPackStoreDirs
  removed: boolean
}

export type ElectronAgentCatalogPackPlugin = {
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
  updateMCPPluginTools?: (tools: ElectronMCPPluginTool[]) => Promise<void>
  getMCPStatus?: () => Promise<ElectronMCPServerStatus>
  onMCPPluginToolCall?: (handler: (call: ElectronMCPPluginToolCall) => Promise<unknown>) => () => void
  setAppSettings?: (settings: AppSettings) => Promise<void>
  setGenerationToolsSettings?: (settings: GenerationToolsSettings) => Promise<void>
  testGenerationToolServer?: (server: Partial<GenerationToolServer>) => Promise<ElectronGenerationToolServerTestResult>
  onBackendStatus?: (handler: (status: ElectronBackendStatus) => void) => () => void
  getBackendStatus?: () => Promise<ElectronBackendStatus>
  openAdminConsole?: (input?: { baseURL?: string; path?: string }) => Promise<{ url: string }>
  agentBrowserNavigate?: (input: { tabId?: string; url: string; bounds?: ElectronAgentBrowserBounds | null }) => Promise<ElectronAgentBrowserState>
  agentBrowserActivate?: (input: { tabId: string; bounds?: ElectronAgentBrowserBounds | null }) => Promise<ElectronAgentBrowserState>
  agentBrowserSetBounds?: (input: { bounds?: ElectronAgentBrowserBounds | null } | null) => Promise<ElectronAgentBrowserState>
  agentBrowserHide?: () => Promise<ElectronAgentBrowserState>
  agentBrowserGetState?: (input?: { tabId?: string }) => Promise<ElectronAgentBrowserState>
  agentBrowserClose?: (input: { tabId: string }) => Promise<ElectronAgentBrowserState>
  agentBrowserGoBack?: (input?: { tabId?: string }) => Promise<ElectronAgentBrowserState>
  agentBrowserGoForward?: (input?: { tabId?: string }) => Promise<ElectronAgentBrowserState>
  agentBrowserReload?: (input?: { tabId?: string }) => Promise<ElectronAgentBrowserState>
  agentBrowserStop?: (input?: { tabId?: string }) => Promise<ElectronAgentBrowserState>
  onAgentBrowserState?: (handler: (state: ElectronAgentBrowserState) => void) => () => void
  ensureAgentRuntime?: (input?: ElectronAgentRuntimeEnsureInput) => Promise<ElectronAgentRuntimeStatus>
  agentRuntimeRequest?: (input: ElectronAgentRuntimeRequestInput) => Promise<ElectronAgentRuntimeResponse>
  agentRuntimeOpenEventStream?: (input: ElectronAgentRuntimeStreamInput) => Promise<ElectronAgentRuntimeResponse>
  agentRuntimeCloseEventStream?: (input: ElectronAgentRuntimeStreamCloseInput) => Promise<void>
  onAgentRuntimeStreamMessage?: (handler: (message: ElectronAgentRuntimeStreamMessage) => void) => () => void
  listAgentRuntimeSessions?: (input?: { workspaceDir?: string }) => Promise<{ sessions: ElectronAgentRuntimeSessionSummary[] }>
  getAgentWorkspaceConfig?: (input?: { workspaceDir?: string }) => Promise<ElectronAgentWorkspaceConfig>
  saveAgentWorkspaceConfig?: (input: ElectronAgentWorkspaceConfigSaveInput) => Promise<ElectronAgentWorkspaceConfig>
  listAgentCatalogPackPlugins?: () => Promise<{ dirs: ElectronAgentCatalogPackStoreDirs; plugins: ElectronAgentCatalogPackPlugin[] }>
  installAgentCatalogPack?: (input: ElectronAgentCatalogPackInstallInput) => Promise<ElectronAgentCatalogPackInstallResult>
  uninstallAgentCatalogPack?: (input: ElectronAgentCatalogPackUninstallInput) => Promise<ElectronAgentCatalogPackUninstallResult>
  clipVideo?: (input: ElectronVideoClipInput) => Promise<ElectronVideoClipResult>
  exportTimelineVideo?: (input: ElectronTimelineVideoInput) => Promise<ElectronTimelineVideoResult>
  getVideoClipStatus?: () => Promise<ElectronVideoClipStatus>
  analyzeShotCuts?: (input: ElectronShotCutInput) => Promise<ElectronShotCutResult>
  onMCPOpenRoute?: (handler: (route: string) => void) => () => void
}

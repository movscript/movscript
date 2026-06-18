export type ElectronBackendStatus = {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

export type ElectronRuntimeConfig = {
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  apiBaseURL: string
  apiV1BaseURL: string
  localAPIBaseURL: string
  providerRuntimeEnv?: Record<string, string>
  backendStatus: ElectronBackendStatus
}

export type ElectronAppSettingsSecrets = {
  shotLibrarySourceAuthTokens: Record<string, string>
}

export type ElectronBackendAuthSessionInput = {
  baseURL?: string
  token?: string | null
  expiresAt?: string | null
  user?: {
    id?: string | number
    ID?: string | number
    username?: string
    displayName?: string
    display_name?: string
    primaryEmail?: string
    primary_email?: string
    locale?: string
    systemRole?: string
    system_role?: string
  } | null
  gitCredential?: {
    provider: 'gitea'
    username: string
    token?: string
    maskedToken?: string
    masked_token?: string
    status?: string
    lastError?: string
    last_error?: string
  } | null
}

export type ElectronAdminAuthSessionInput = {
  token?: string | null
  expires_at?: string | null
  user?: {
    id?: string | number
    ID?: string | number
    username?: string
    system_role?: string
    systemRole?: string
  } | null
  org_memberships?: unknown[]
  current_org_id?: number | null
  api_base_url?: string | null
  theme?: 'light' | 'dark' | null
  language?: 'zh-CN' | 'en-US' | null
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

export type ElectronWindowControlAction = 'close' | 'minimize' | 'toggleFullscreen'

export type ElectronWindowState = {
  fullscreen: boolean
  focused: boolean
}

export type ElectronAppUpdateStatus = {
  available: boolean
  checking: boolean
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  releaseNotesUrl?: string
  releaseNotes?: string
  channel?: string
  mandatory?: boolean
  checkedAt?: string
  error?: string
}

export type ElectronAppWindowKind = 'home' | 'agent' | 'project' | 'editingProject' | 'canvas' | 'tool'

export type ElectronAppWindowProjectSnapshot = {
  ID: number
  owner_id?: number
  name?: string
  description?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export type ElectronAppWindowContext = {
  kind: ElectronAppWindowKind
  route: string
  search?: string
  projectId?: number
  project?: ElectronAppWindowProjectSnapshot | null
  editingProjectId?: string
  editingProjectTitle?: string
  canvasId?: number
  title?: string
}

export type ElectronUpdateAppWindowRouteContextInput = {
  route: string
  search?: string
  title?: string
}

export type ElectronOpenProjectWindowInput = {
  projectId: number
  project?: ElectronAppWindowProjectSnapshot | null
  route?: string
  search?: string
}

export type ElectronOpenEditingProjectWindowInput = {
  editingProjectId: string
  title?: string
  route?: string
  search?: string
}

export type ElectronOpenCanvasWindowInput = {
  canvasId?: number
  title?: string
  route?: string
  search?: string
}

export type ElectronDockShortcutProject = {
  id: number
  name: string
  updatedAt?: string
  project?: ElectronAppWindowProjectSnapshot | null
}

export type ElectronDockShortcutEditingProject = {
  id: string
  title: string
  updatedAt?: string
}

export type ElectronDockShortcutCanvas = {
  id: number
  name: string
}

export type ElectronDockShortcutSnapshot = {
  projects?: ElectronDockShortcutProject[]
  editingProjects?: ElectronDockShortcutEditingProject[]
  canvases?: ElectronDockShortcutCanvas[]
}

export type ElectronGenerationToolServerTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
  server?: unknown
  data?: unknown
}

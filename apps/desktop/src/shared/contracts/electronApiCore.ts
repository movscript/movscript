import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentConversationWorkspace } from '@movscript/agent-protocol'
import type {
  MovScriptDataConnectionContext,
  MovScriptRuntimeBundleCompatibility,
  MovScriptRuntimeConnectionDescriptor,
  MovScriptRuntimeDescriptor,
} from '@movscript/shared'

export type ElectronMovScriptHomeInput = {
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir?: string
}

export type ElectronBackendStatus = {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
  logPath?: string
  recentOutput?: string
}

export type ElectronRuntimeConfig = {
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  runtimeConnection: MovScriptRuntimeConnectionDescriptor
  runtime: MovScriptRuntimeDescriptor
  dataConnection: MovScriptDataConnectionContext
  runtimeBundleStatus?: ElectronRuntimeBundleStatus
  /** @deprecated Use runtime.gateway.baseURL. */
  gatewayBaseURL?: string
  /** @deprecated Use runtime.gateway.baseURL for daemon calls and dataConnection for status/config intent. */
  apiBaseURL: string
  /** @deprecated Use daemon gateway clients; this remains only for legacy Data API callers. */
  apiV1BaseURL: string
  providerRuntimeEnv?: Record<string, string>
  backendStatus: ElectronBackendStatus
}

export type ElectronRuntimeBundleAction = 'upgrade' | 'keep' | 'repair' | 'rollback' | 'unknown'

export type ElectronRuntimeBundleIdentity = {
  version?: string
  apiVersion?: string
  minDaemonApiVersion?: string
  bundleHash?: string
  pluginRoot?: string
}

export type ElectronRuntimeBundleStatus = {
  action: ElectronRuntimeBundleAction
  reason: string
  homeCurrent?: ElectronRuntimeBundleIdentity
  desktopBundled?: ElectronRuntimeBundleIdentity
  previousRoot?: string
  comparison?: MovScriptRuntimeBundleCompatibility
}

export type ElectronRuntimeBundleActionInput = {
  action?: ElectronRuntimeBundleAction
}

export type ElectronRuntimeBundleActionResult = {
  ok: boolean
  action: ElectronRuntimeBundleAction
  runtimeConfig: ElectronRuntimeConfig
  installed?: {
    version: string
    pluginRoot: string
    installed?: boolean
    bundleHash?: string
  }
  daemon?: {
    status?: string
    detail?: Record<string, unknown>
  }
  error?: string
}

export type ElectronAppSettingsSecrets = {
  shotLibrarySourceAuthTokens: Record<string, string>
  agentRuntimeApiKeys: Record<string, string>
}

export type ElectronAgentRuntimeCredentialSummary = {
  savedProviderKeys: string[]
}

export type ElectronAgentSessionState = {
  activeConversationIdsByUser: Record<string, string | null>
  activeConversationIdsByScope: Record<string, string | null>
  conversationsById: Record<string, AgentConversationRegistryRecord>
  workspacesByUser: Record<string, Record<string, AgentConversationWorkspace>>
}

export type ElectronAgentSessionStateResult = {
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  path: string
  version: string
  state: ElectronAgentSessionState
}

export type ElectronAgentSessionStateSaveInput = {
  state: ElectronAgentSessionState
  expectedVersion?: string | null
}

export type ElectronDesktopStateInput = ElectronMovScriptHomeInput & {
  key: string
}

export type ElectronDesktopStateResult = {
  key: string
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  path: string
  version: string
  value: unknown | null
}

export type ElectronDesktopStateSaveInput = ElectronDesktopStateInput & {
  value: unknown
  expectedVersion?: string | null
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
  downloading?: boolean
  downloaded?: boolean
  installing?: boolean
  downloadProgress?: number
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  releaseNotesUrl?: string
  releaseNotes?: string
  channel?: string
  mandatory?: boolean
  policy?: 'optional' | 'required'
  severity?: 'normal' | 'security' | 'data-loss' | 'startup-blocker'
  minSupportedVersion?: string
  deadlineAt?: string
  policyTitle?: string
  policyMessage?: string
  checkedAt?: string
  error?: string
}

export type ElectronAppWindowKind = 'home' | 'agent' | 'project' | 'editingProject' | 'canvas' | 'tool' | 'projectData' | 'settings'

export type ElectronAppWindowProjectSnapshot = {
  ID: number
  owner_id?: number
  name?: string
  description?: string
  project_uid?: string
  workspace_path?: string
  project_path?: string
  local?: boolean
  CreatedAt?: string
  UpdatedAt?: string
}

export type ElectronAppWindowContext = {
  kind: ElectronAppWindowKind
  route: string
  search?: string
  projectDir?: string
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
  projectDir: string
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

export type ElectronOpenToolWindowInput = {
  title?: string
  route?: string
  search?: string
}

export type ElectronOpenProjectDataWindowInput = {
  title?: string
  route?: string
  search?: string
}

export type ElectronOpenSettingsWindowInput = {
  title?: string
  route?: string
  search?: string
}

export type ElectronDockShortcutProject = {
  id: number
  name: string
  projectDir: string
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
  labels?: {
    appHome?: string
    toolHome?: string
    editHome?: string
    canvasHome?: string
    recentProjects?: string
    recentEditingProjects?: string
    recentCanvases?: string
    emptyRecent?: string
  }
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

import type { ElectronMovScriptWorkspaceContext } from './electronApiWorkspaceContext'

export type ElectronAppServerLifecycle = 'movscript-owned'
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

export type ElectronAppServerHubConnectInput = {
  url: string
  profileId?: string
}

export type ElectronAppServerHubConnection = {
  connectionId: string
  upstreamKey: string
  url: string
}

export type ElectronAppServerHubSendInput = {
  connectionId: string
  payload: string
}

export type ElectronAppServerHubRequestInput = {
  url: string
  profileId?: string
  method: string
  params?: unknown
}

export type ElectronAppServerHubNotifyInput = {
  url: string
  profileId?: string
  method: string
  params?: unknown
}

export type ElectronAppServerHubCloseInput = {
  connectionId: string
}

export type ElectronAppServerHubSnapshotInput = {
  connectionId: string
}

export type ElectronAppServerHubMessage = {
  connectionId: string
  kind: 'message' | 'error' | 'close'
  data?: string
  error?: string
}

export type ElectronAppServerHubSnapshot = {
  connectionId: string
  upstreamKey: string
  url: string
  subscriberCount: number
  cacheKeys: string[]
  cacheEntries: Array<{
    key: string
    method: string
    updatedAt: number
  }>
  pendingServerRequests: Array<{
    id: string | number
    method: string
    params?: unknown
    receivedAt: number
  }>
  pendingClientRequestCount: number
  pendingServerRequestCount: number
  initialized: boolean
  initializedNotificationSent: boolean
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
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
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

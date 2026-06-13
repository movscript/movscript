import type {
  AgentChatInput,
  AgentChatThreadItem,
} from './agentChatThreadItems.js'

export {
  agentChatInputFromAttachment,
  agentChatInputsFromTextAndAttachments,
  agentChatTextInput,
} from './agentChatThreadItems.js'
export type {
  AgentChatCollabAgentState,
  AgentChatCommandAction,
  AgentChatHookPromptFragment,
  AgentChatInput,
  AgentChatTextElement,
  AgentChatThreadItem,
} from './agentChatThreadItems.js'

export type AgentChatProviderKind = 'codex' | 'mova' | 'claude' | (string & {})

export type AgentChatThreadStatus = 'notLoaded' | 'idle' | 'running' | 'requires_action' | 'failed' | 'completed' | 'cancelled' | 'unknown'
export type AgentChatTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress' | (string & {})
export type AgentChatTurnItemsView = 'notLoaded' | 'summary' | 'full'
export type AgentChatCollaborationMode = 'default' | 'plan'
export type AgentChatGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete' | (string & {})

export interface AgentThreadControlState {
  providerThreadId: string
  providerSessionTreeId?: string
  activeTurnId?: string
  turnStatus?: AgentChatTurnStatus
  collaborationMode?: AgentChatCollaborationMode
  goal?: AgentThreadGoalState
  executionSettings?: AgentThreadExecutionSettings
  contextState?: AgentThreadContextState
}

export interface AgentThreadGoalState {
  objective: string
  status: AgentChatGoalStatus
  tokenBudget?: number | null
  tokensUsed?: number
  timeUsedSeconds?: number
  createdAt?: number
  updatedAt?: number
}

export interface AgentThreadExecutionSettings {
  model?: string | null
  modelProvider?: string | null
  cwd?: string | null
  approvalPolicy?: string | null
  approvalsReviewer?: string | null
  sandbox?: unknown
  sandboxPolicy?: unknown
  permissions?: string | null
}

export interface AgentThreadContextState {
  tokenUsage?: number
  tokenLimit?: number
  compactedAt?: number
  summary?: string | null
}

export interface AgentChatThread {
  provider: AgentChatProviderKind
  id: string
  providerThreadId?: string
  providerSessionTreeId?: string
  /**
   * @deprecated Provider-neutral code should use providerSessionTreeId when it
   * means a related-thread tree, or provider-specific runtime session fields
   * when it means a runtime session.
   */
  sessionId?: string
  preview: string
  name: string | null
  createdAt: number
  updatedAt: number
  status: AgentChatThreadStatus
  cwd?: string | null
  goal?: AgentThreadGoalState | null
  executionSettings?: AgentThreadExecutionSettings
  turns: AgentChatTurn[]
  raw?: unknown
}

export interface AgentChatTurn {
  id: string
  items: AgentChatThreadItem[]
  itemsView: AgentChatTurnItemsView
  status: AgentChatTurnStatus
  error: { message?: string; [key: string]: unknown } | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  raw?: unknown
}

export interface AgentChatNotification {
  method: string
  params?: unknown
  event?: AgentChatNotificationEvent
  raw?: unknown
}

export type AgentChatNotificationEvent =
  | {
    type: 'commandOutput'
    processId: string
    stream: string
    deltaBase64: string
    text: string
    capReached: boolean
    raw?: unknown
  }
  | {
    type: 'processOutput'
    processHandle: string
    stream: string
    deltaBase64: string
    text: string
    capReached: boolean
    raw?: unknown
  }
  | {
    type: 'processExited'
    processHandle: string
    exitCode: number
    stdout: string
    stderr: string
    stdoutCapReached: boolean
    stderrCapReached: boolean
    raw?: unknown
  }
  | {
    type: 'fsChanged'
    watchId: string
    changedPaths: string[]
    raw?: unknown
  }
  | {
    type: 'threadLifecycle'
    action: 'archived' | 'unarchived' | 'closed'
    threadId: string
    raw?: unknown
  }
  | {
    type: 'serverRequestResolved'
    threadId?: string
    requestId: string
    raw?: unknown
  }
  | {
    type: 'realtime'
    threadId?: string
    event: 'started' | 'itemAdded' | 'transcriptDelta' | 'transcriptDone' | 'outputAudioDelta' | 'sdp' | 'error' | 'closed' | (string & {})
    realtimeSessionId?: string | null
    version?: string | null
    role?: string | null
    item?: unknown
    text?: string | null
    delta?: string | null
    audio?: unknown
    sdp?: string | null
    message?: string | null
    reason?: string | null
    raw?: unknown
  }
  | {
    type: 'account'
    event: 'updated' | 'rateLimitsUpdated' | 'loginCompleted' | (string & {})
    detail?: unknown
    raw?: unknown
  }
  | {
    type: 'mcpStatus'
    server: string
    status: string
    error?: string | null
    raw?: unknown
  }
  | {
    type: 'systemNotice'
    level: 'info' | 'warning' | 'error'
    id?: string
    code?: string
    threadId?: string
    turnId?: string
    title: string
    detail?: string | null
    raw?: unknown
  }

export type AgentChatServerRequestMethod =
  | 'item/commandExecution/requestApproval'
  | 'item/fileChange/requestApproval'
  | 'item/permissions/requestApproval'
  | 'item/tool/requestUserInput'
  | 'mcpServer/elicitation/request'
  | 'movscript/decision/request'
  | 'item/tool/call'
  | 'account/chatgptAuthTokens/refresh'
  | 'attestation/generate'
  | 'applyPatchApproval'
  | 'execCommandApproval'
  | (string & {})

export interface AgentChatServerRequest {
  id: string
  method: AgentChatServerRequestMethod
  threadId?: string
  turnId?: string
  itemId?: string
  params: unknown
  raw?: unknown
}

export type AgentChatServerRequestResponse =
  | {
    action: 'approve'
    scope?: 'turn' | 'session'
    permissions?: Record<string, unknown>
    strictAutoReview?: boolean
    execPolicyAmendment?: unknown
    networkPolicyAmendment?: unknown
  }
  | { action: 'reject'; reason?: string }
  | { action: 'cancel'; reason?: string }
  | { action: 'answer'; answers?: Record<string, unknown>; choiceIds?: string[]; text?: string }
  | { action: 'toolResult'; success: boolean; contentItems?: unknown[] }
  | { action: 'elicitation'; accepted: boolean; content?: unknown; meta?: unknown }
  | { action: 'decision'; decision: 'adopt' | 'reject' | 'defer'; reason?: string; metadata?: Record<string, unknown> }

export type AgentChatServerRequestHandler = (request: AgentChatServerRequest) => AgentChatServerRequestResponse | undefined | Promise<AgentChatServerRequestResponse | undefined>

export interface AgentChatModelSelection {
  model?: string | null
  modelProvider?: string | null
}

export interface AgentChatRunProfileSelection {
  approvalPolicy: unknown
  approvalsReviewer: unknown
  permissionProfileId: string
  fallbackSandbox: unknown
}

export interface AgentChatRunProfileOptions {
  runProfile?: AgentChatRunProfileSelection
}

export interface AgentChatThreadControlOptions {
  collaborationMode?: AgentChatCollaborationMode
  goalModeEnabled?: boolean
}

export type AgentChatThreadReadDirection = 'newer' | 'older'

export interface AgentChatThreadReadInput {
  includeTurns?: boolean
  /**
   * Return turns after this known turn id when the provider exposes turn-level
   * pagination.
   */
  afterTurnId?: string | null
  /**
   * Return turns before this known turn id when loading earlier history.
   */
  beforeTurnId?: string | null
  /**
   * Return items after this known item id when the provider supports
   * incremental reads.
   */
  afterItemId?: string | null
  /**
   * Return items before this known item id when loading earlier history.
   */
  beforeItemId?: string | null
  /**
   * Maximum number of thread items to return. Providers that do not support
   * windowed reads may ignore this and return a full thread.
   */
  limit?: number | null
  direction?: AgentChatThreadReadDirection
}

export interface AgentChatDataSource {
  provider: AgentChatProviderKind
  providerId?: string
  providerInstanceId?: string
  label: string
  serverRequestSubscriptionMode?: 'global' | 'globalWithThreadFallback'
  capabilities?: AgentChatCapabilities
  listThreads(input?: { limit?: number; cursor?: string | null }): Promise<{ threads: AgentChatThread[]; nextCursor?: string | null }>
  readThread(threadId: string, input?: AgentChatThreadReadInput): Promise<AgentChatThread>
  resumeThread?(input: { threadId: string; cwd?: string | null } & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions): Promise<AgentChatThread>
  startThread(input?: { title?: string; projectId?: number; cwd?: string | null } & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions): Promise<AgentChatThread>
  renameThread?(input: { threadId: string; name: string }): Promise<AgentChatThread | unknown>
  archiveThread?(input: { threadId: string }): Promise<AgentChatThread | unknown>
  unarchiveThread?(input: { threadId: string }): Promise<AgentChatThread | unknown>
  deleteThread?(input: { threadId: string }): Promise<unknown>
  setThreadGoal?(input: { threadId: string; objective?: string | null; status?: AgentChatGoalStatus | null; tokenBudget?: number | null }): Promise<AgentThreadGoalState | unknown>
  updateThreadSettings?(input: { threadId: string; cwd?: string | null } & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions): Promise<AgentThreadExecutionSettings | unknown>
  startTurn?(input: { threadId: string; inputs: AgentChatInput[]; clientUserMessageId?: string | null } & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions): Promise<AgentChatTurn>
  steerTurn?(input: { threadId: string; turnId: string; inputs: AgentChatInput[]; clientUserMessageId?: string | null }): Promise<unknown>
  interruptTurn?(input: { threadId: string; turnId: string; reason?: string | null }): Promise<unknown>
  startTextTurn(input: { threadId: string; text: string; clientUserMessageId?: string | null } & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions): Promise<AgentChatTurn>
  subscribeThread?(input: {
    threadId: string
    onNotification?: (notification: AgentChatNotification) => void
    onServerRequest?: AgentChatServerRequestHandler
    signal?: AbortSignal
  }): Promise<void | (() => void)> | void | (() => void)
  subscribeServerRequests?(input: {
    onServerRequest?: AgentChatServerRequestHandler
    onNotification?: (notification: AgentChatNotification) => void
    signal?: AbortSignal
  }): Promise<void | (() => void)> | void | (() => void)
}

export function providerThreadIdFromAgentChatThread(thread: Pick<AgentChatThread, 'id' | 'providerThreadId'>): string {
  return thread.providerThreadId?.trim() || thread.id
}

export function providerSessionTreeIdFromAgentChatThread(thread: Pick<AgentChatThread, 'providerSessionTreeId' | 'sessionId'>): string | undefined {
  return thread.providerSessionTreeId?.trim() || thread.sessionId?.trim() || undefined
}

export function legacySessionIdFromAgentChatThread(thread: Pick<AgentChatThread, 'providerSessionTreeId' | 'sessionId'>): string | undefined {
  return providerSessionTreeIdFromAgentChatThread(thread)
}

export interface AgentChatCapabilities {
  command?: AgentChatCommandCapability
  fs?: AgentChatFsCapability
  mcp?: AgentChatMcpCapability
  plugins?: AgentChatPluginCapability
  skills?: AgentChatSkillsCapability
  models?: AgentChatModelCapability
  config?: AgentChatConfigCapability
  account?: AgentChatAccountCapability
  realtime?: AgentChatRealtimeCapability
}

export interface AgentChatCommandCapability {
  exec(input: {
    command: string[]
    processId?: string | null
    cwd?: string | null
    env?: Record<string, string | null> | null
    tty?: boolean
    streamStdin?: boolean
    streamStdoutStderr?: boolean
    outputBytesCap?: number | null
    disableOutputCap?: boolean
    disableTimeout?: boolean
    timeoutMs?: number | null
    size?: { rows: number; cols: number } | null
    sandboxPolicy?: unknown
    raw?: Record<string, unknown>
  }): Promise<unknown>
  write?(input: { processId: string; deltaBase64?: string | null; closeStdin?: boolean; dataBase64?: string | null }): Promise<unknown>
  resize?(input: { processId: string; size: { rows: number; cols: number }; rows?: number; cols?: number }): Promise<unknown>
  terminate?(input: { processId: string }): Promise<unknown>
}

export interface AgentChatFsCapability {
  readFile(input: { path: string }): Promise<unknown>
  writeFile(input: { path: string; dataBase64: string }): Promise<unknown>
  createDirectory?(input: { path: string; recursive?: boolean | null }): Promise<unknown>
  readDirectory?(input: { path: string }): Promise<unknown>
  getMetadata?(input: { path: string }): Promise<unknown>
  copy?(input: { sourcePath: string; destinationPath: string; recursive?: boolean; source?: string; destination?: string }): Promise<unknown>
  remove?(input: { path: string; recursive?: boolean | null; force?: boolean | null }): Promise<unknown>
  watch?(input: { watchId: string; path: string }): Promise<unknown>
  unwatch?(input: { watchId: string }): Promise<unknown>
}

export interface AgentChatMcpCapability {
  listServers(input?: Record<string, unknown>): Promise<unknown>
  readResource(input: { server: string; uri: string; threadId?: string }): Promise<unknown>
  callTool(input: { threadId: string; server: string; tool: string; arguments?: unknown; _meta?: unknown }): Promise<unknown>
  oauthLogin?(input: Record<string, unknown>): Promise<unknown>
  reload?(): Promise<unknown>
}

export interface AgentChatPluginCapability {
  list(input?: Record<string, unknown>): Promise<unknown>
  installed?(input?: Record<string, unknown>): Promise<unknown>
  install?(input: Record<string, unknown>): Promise<unknown>
  uninstall?(input: Record<string, unknown>): Promise<unknown>
  read?(input: Record<string, unknown>): Promise<unknown>
  readSkill?(input: Record<string, unknown>): Promise<unknown>
}

export interface AgentChatSkillsCapability {
  list(input?: { cwds?: string[]; forceReload?: boolean }): Promise<unknown>
  writeConfig?(input: Record<string, unknown>): Promise<unknown>
  setExtraRoots?(input: Record<string, unknown>): Promise<unknown>
}

export interface AgentChatModelCapability {
  list(input?: { cursor?: string | null; limit?: number | null; includeHidden?: boolean | null }): Promise<unknown>
  readProviderCapabilities?(input: Record<string, unknown>): Promise<unknown>
}

export interface AgentChatConfigCapability {
  read(input?: { includeLayers?: boolean; cwd?: string | null }): Promise<unknown>
  writeValue?(input: Record<string, unknown>): Promise<unknown>
  writeBatch?(input: Record<string, unknown>): Promise<unknown>
  listPermissionProfiles?(input?: Record<string, unknown>): Promise<unknown>
}

export interface AgentChatAccountCapability {
  read(input?: { refreshToken?: boolean }): Promise<unknown>
  loginStart?(input: Record<string, unknown>): Promise<unknown>
  loginCancel?(input: Record<string, unknown>): Promise<unknown>
  logout?(): Promise<unknown>
  readRateLimits?(): Promise<unknown>
}

export interface AgentChatRealtimeCapability {
  supported: boolean
  listVoices?(input?: Record<string, unknown>): Promise<unknown>
  start(input: {
    threadId: string
    outputModality: 'text' | 'audio'
    prompt?: string | null
    realtimeSessionId?: string | null
    transport?: { type: 'websocket' } | { type: 'webrtc'; sdp: string } | Record<string, unknown> | null
    voice?: string | null
  }): Promise<unknown>
  appendAudio(input: {
    threadId: string
    audio: {
      data: string
      sampleRate: number
      numChannels: number
      samplesPerChannel?: number | null
      itemId?: string | null
    }
  }): Promise<unknown>
  appendText(input: { threadId: string; text: string }): Promise<unknown>
  stop(input: { threadId: string }): Promise<unknown>
  subscribe?(input: {
    threadId: string
    onNotification: (notification: AgentChatNotification) => void
    signal?: AbortSignal
  }): Promise<void | (() => void)> | void | (() => void)
}

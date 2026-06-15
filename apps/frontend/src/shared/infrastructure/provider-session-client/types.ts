import type { MovScriptWorkspaceKind } from '@/shared/contracts/movscriptWorkspace'
import type { ElectronProviderSessionSummary, ElectronMovScriptWorkspaceConfig, ElectronMovScriptWorkspaceConfigSaveInput } from '@/shared/contracts/electronApi'
import type {
  AgentTimelineStreamEvent,
  ProviderManifest,
  AgentMessage,
  AgentRun,
  ProviderSessionLimits,
  ProviderSessionEventV2,
  ProviderModelCapabilityRoutePublic,
  ProviderModelConfigPublic,
  ToolCall,
} from '@/shared/infrastructure/provider-session-client/coreTypes'

export type * from '@/shared/infrastructure/provider-session-client/coreTypes'
export type * from '@/shared/infrastructure/provider-session-client/runDebugTypes'
export type * from '@/shared/infrastructure/provider-session-client/telemetryTypes'
export type * from '@/shared/infrastructure/provider-session-client/traceDebugTypes'

export type AgentToolCall = ToolCall
export type ProviderSessionSummary = ElectronProviderSessionSummary
export type MovScriptWorkspaceConfig = ElectronMovScriptWorkspaceConfig
export type MovScriptWorkspaceConfigSaveInput = ElectronMovScriptWorkspaceConfigSaveInput

export interface ProviderSessionLease {
  ok: boolean
  sessionId?: string
  leaseId: string
  ttlMs?: number
  expiresAt?: string
  activeLeases?: number
  activeStreams?: number
  released?: boolean
  holder?: string
}

export interface ProviderPluginFileManifest {
  id: string
  name: string
  version: string
  [key: string]: unknown
}

export interface ProviderPluginFile {
  path: string
  content: string
}

export interface ProviderPluginFileList {
  path: string
  plugins: ProviderPluginFileManifest[]
}

export interface ProviderPluginFileInstallInput {
  plugin: ProviderPluginFileManifest
  pluginCatalogFiles?: ProviderPluginFile[]
}

export interface ProviderPluginFileInstallResult extends ProviderPluginFileList {
  plugin?: ProviderPluginFileManifest
  pluginCatalogPackInstall?: unknown
}

export interface ProviderPluginFileRemoveResult extends ProviderPluginFileList {
  removed: boolean
  pluginCatalogPackUninstall?: unknown
}

export type ProviderSessionLimitsOverride = Partial<Pick<ProviderSessionLimits, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'execution'>>

export interface AgentThreadListQuery {
  cursor?: string
  limit?: number
  includeProvisional?: boolean
}

export interface AgentTimelineQuery {
  before?: string
  limit?: number
}

export interface AgentThreadMessagesQuery {
  afterOrdinal?: number
  limit?: number
  direction?: 'asc' | 'desc'
}

export interface AgentThreadMessagesPage {
  threadId: string
  messages: AgentMessage[]
  nextAfterOrdinal?: number
  hasMore: boolean
  scan: {
    durationMs: number
    bytesRead: number
    totalBytes: number
    linesRead: number
    eventsRead: number
    matchedEvents: number
    malformedLines: number
  }
}

export interface AgentSessionTimelineQuery extends AgentTimelineQuery {
  threadId?: string
}

export interface AgentTimelineStreamOptions {
  threadId?: string
  onTimelineEvent?: (event: AgentTimelineStreamEvent) => void
  signal?: AbortSignal
}

export interface ProviderSessionHealth {
  ok: boolean
  service: string
  mode: string
  mcpEndpoint?: string
  runtime?: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  paths?: {
    runtimeDataDir: string
    memoryPath: string
    runtimeLogPath: string
    workspacePath: string
    toolResultPath: string
    catalogStatePath: string
    modelConfigPath: string
  }
  modelConfigPath?: string
  modelConfig?: ProviderModelConfigPublic
  modelCapabilities?: ProviderModelCapabilityRoutePublic[]
  pluginCatalog?: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir?: string
    builtinToolsDir?: string
    skillCount: number
    toolCount: number
    warnings?: string[]
  }
}

export type ProviderMemoryScope = 'global' | 'project' | 'thread'
export type ProviderMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'workspace' | 'decision' | 'warning'
export type { MovScriptWorkspaceKind }
export type WorkspaceArtifactStatus = 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface ProviderMemory {
  id: string
  scope: ProviderMemoryScope
  projectId?: number
  threadId?: string
  kind: ProviderMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceArtifact {
  id: string
  filePath?: string
  projectId?: number
  kind: MovScriptWorkspaceKind
  title: string
  content: string
  status: WorkspaceArtifactStatus
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkspaceArtifactApplyReview {
  workspaceId: string
  workspaceTitle: string
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface WorkspaceArtifactApplyPreview {
  status: 'preview' | 'applied'
  review: WorkspaceArtifactApplyReview
  workspace: WorkspaceArtifact
  message: string
  backendApply?: Record<string, unknown>
}

export interface RunMessageOptions {
  onRunUpdate?: (run: AgentRun) => void
  onSourceMessage?: (message: AgentMessage, run: AgentRun) => void
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  onPhase?: (name: string, details?: Record<string, unknown>) => void
  timeoutMs?: number
  streamRequestTimeoutMs?: number
  pollMs?: number
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  providerSessionLimits?: ProviderSessionLimitsOverride
  signal?: AbortSignal
}

export interface ThreadStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}

export interface SessionStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}

export interface PlanStreamOptions {
  onProviderEvent?: (event: ProviderSessionEventV2) => void
  signal?: AbortSignal
}

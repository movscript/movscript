import type { AgentAttachmentSource } from './agentAttachmentProtocol.js'
import type { ToolCall } from './agentToolProtocol.js'
import type { ProviderSessionLimits } from './agentRunProtocol.js'
import type {
  AgentRunRole,
  AgentRunStatus,
} from './agentStatusProtocol.js'
import type {
  AgentTaskGraphStatus,
  AgentTaskGraphSummary,
  AgentTaskStatus,
} from './agentTaskGraphProtocol.js'
import type {
  ProviderManifest,
  ResolvedProviderSkill,
  ResolvedToolCatalog,
  ToolUnavailableReason,
} from './providerCatalog.js'
import type { AgentApprovalRequest } from './providerInteractionProtocol.js'

export interface ProviderContextPanel {
  route: {
    pathname: string
    search?: string
    hash?: string
  }
  projects: Array<{
    id: number
    name: string
    description?: string
    status?: string
    totalEpisodes?: number
  }>
  projectsError?: string
  project?: {
    id: number
    name?: string
    status?: string
    description?: string
    aspect_ratio?: string
    visual_style?: string
    project_style?: string
  }
  user?: {
    id: number
    username: string
    systemRole?: string
  }
  selection?: {
    entityType: string
    entityId: number | string
    label?: string
  } | null
  recentResources: Array<{
    id: number
    name: string
    type: string
    mimeType?: string
    size?: number
  }>
  attachments: Array<{
    id: string
    name: string
    type: string
    resourceId?: number
    source?: AgentAttachmentSource
  }>
  memories: Array<{
    id: string
    projectId: number
    title: string
    kind: string
    content: string
  }>
  labels: string[]
  statusDigest?: string[]
  rawContextHints?: string[]
  agentTaskGraph?: {
    id: string
    title: string
    status: AgentTaskGraphStatus
    progress: number
    role?: AgentRunRole
    currentTaskId?: string
    rootRunId?: string
    tasks: Array<{
      id: string
      subagentName?: string
      title: string
      status: AgentTaskStatus
      progress: number
      deps: string[]
      ownerRunId?: string
      blockedReason?: string
    }>
    workers: Array<{
      id: string
      subagentName?: string
      status: AgentRunStatus
      taskId?: string
      parentRunId?: string
      progress?: number
      blockedReason?: string
    }>
    nameConflicts?: Array<{
      subagentName: string
      taskIds: string[]
    }>
    artifacts: Array<{
      id: string
      type: string
      title?: string
      uri?: string
      taskId: string
      subagentName?: string
      sourceRunId?: string
      sourceTaskId?: string
      sourceTaskTitle?: string
      sourceTaskStatus?: AgentTaskStatus
      sourceTaskOwnerRunId?: string
      toolName?: string
      policy?: string
    }>
    summary?: AgentTaskGraphSummary
  }
}

export interface PromptFragmentPreview {
  id: string
  source: string
  owner: string
  layer: string
  lifecycle: string
  trustLevel: string
  instructionAuthority: string
  promptEligibility: string
  contentHash: string
  renderMode: string
  budgetPriority: number
  inclusionReason: string
}

export interface CompiledPromptPreview {
  system: string
  sectionPrompt?: string
  providerSystemPrompt?: string
  providerSystemMessages?: Array<{ role: string; content: string }>
  messages: Array<{ role: string; content: string }>
  debugParts: Array<{
    id: string
    kind: 'instruction' | 'skill' | 'context' | 'tool'
    title: string
    content: string
  }>
  promptFragments?: PromptFragmentPreview[]
  promptStats?: {
    totalChars: number
    sectionPromptChars?: number
    providerSystemChars?: number
    conversationChars?: number
    budget?: {
      limitChars: number
      usedChars: number
      remainingChars: number
      usageRatio: number
      status: 'ok' | 'warning' | 'critical' | 'exceeded'
    }
    parts: Array<{
      id: string
      title: string
      kind: string
      layer: string
      contextLayer?: string
      source?: string
      lifecycle?: string
      authority?: string
      chars: number
      contentHash?: string
    }>
    byLayer: Record<string, number>
    byContextLayer?: Record<string, number>
    bySource?: Record<string, number>
    byAuthority?: Record<string, number>
  }
}

export interface AgentRunDebugTrace {
  manifestId: string
  manifestVersion: string
  skillIds: string[]
  availableToolNames: string[]
  blockedTools: Array<{
    name: string
    reason?: ToolUnavailableReason | string
  }>
  promptPartIds: string[]
  model?: ProviderManifest['model']
  layerTrace?: {
    configFileId: string
    configFileVersion: string
    configFileLayers: Array<{ source: string; id: string; version: string }>
    skillIds: string[]
    intentSignals?: Array<{
      intent: string
      source: string
      confidence: string
      evidence: string
    }>
    triggerTraces?: Array<{
      id: string
      matched: boolean
      matchedTriggerKind?: string
      priority: number
      selected: boolean
      reason: string
    }>
  }
}

export interface AgentRunPreview {
  id: string
  threadId?: string
  message: string
  status: 'preview'
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  currentProjectId?: number
  context?: ProviderContextPanel
  skills?: ResolvedProviderSkill[]
  tools?: ResolvedToolCatalog
  providerSessionLimits?: ProviderSessionLimits
  promptPreview?: CompiledPromptPreview
  debug?: AgentRunDebugTrace
  toolCalls: ToolCall[]
  pendingApprovals: AgentApprovalRequest[]
  warnings: string[]
  memoryIds: string[]
  memoryCount: number
  createdAt: string
}

export interface AgentContextDiagnostic {
  schema: 'movscript.local_context_diagnostic.v1'
  command?: Record<string, unknown>
  modelGatewayCalled: boolean
  messages: Array<{ role: string; content: string }>
  systemPrompt?: string
  sectionPrompt?: string
  providerSystemPrompt?: string
  debugParts: Array<{ id: string; kind: string; title: string; content: string }>
  promptFragments?: PromptFragmentPreview[]
  promptStats?: CompiledPromptPreview['promptStats']
  tools: {
    available: AgentContextDiagnosticTool[]
    blocked: AgentContextDiagnosticTool[]
    discoveredCount: number
    modelTools: Array<{ name: string; description?: string; parameters?: unknown }>
  }
  skills: Array<{
    id: string
    name: string
    activationReason?: string
    resolvedPriority?: number
  }>
  warnings: string[]
}

export interface AgentContextDiagnosticTool {
  name: string
  description?: string
  source?: string
  registered?: boolean
  granted?: boolean
  available?: boolean
  permission?: string
  risk?: string
  projectScoped?: boolean
  approval?: string
  requiresApproval?: boolean
  unavailableReason?: string
  inputSchema?: unknown
  outputSchema?: unknown
  resolution?: {
    authorized: boolean
    visible: boolean
    reason?: string
    grantSource: 'manifest' | 'skill' | 'none'
    approval: 'never' | 'always' | 'on_write'
    activeSkillIds: string[]
    grantingSkillIds?: string[]
  }
}

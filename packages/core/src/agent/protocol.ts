export const AGENT_PROTOCOL_VERSION = 'movscript.agent.protocol.v1'
export const PROVIDER_SESSION_SNAPSHOT_V2_SCHEMA = 'movscript.agent.provider-session-snapshot.v2'
export const PROVIDER_SESSION_EVENT_V2_SCHEMA = 'movscript.agent.provider-session-event.v2'
export const AGENT_CLIENT_TELEMETRY_SCHEMA = 'movscript.agent.client-telemetry.v1'
export const MEDIA_ARTIFACTS_V1_SCHEMA = 'movscript.media.artifacts.v1'
export const MEDIA_PROVIDER_CONTRACT_V1_SCHEMA = 'movscript.media.provider_contract.v1'

export type ProviderSessionSnapshotV2Schema = typeof PROVIDER_SESSION_SNAPSHOT_V2_SCHEMA
export type ProviderSessionEventV2Schema = typeof PROVIDER_SESSION_EVENT_V2_SCHEMA

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

export type AgentTelemetryMetricUnit = 'ms' | 'bytes' | 'count' | 'score'
export type AgentTelemetryLogLevel = 'info' | 'warning' | 'error'
export type AgentTelemetryLabelValue = string | number | boolean

export const AGENT_TELEMETRY_LABEL_KEYS = [
  'area',
  'component',
  'kind',
  'level',
  'method',
  'route_group',
  'role',
  'stage',
  'status',
  'status_class',
  'tool_name',
  'transport',
  'vital',
] as const

export type AgentTelemetryLabelKey = typeof AGENT_TELEMETRY_LABEL_KEYS[number]

export const AGENT_TELEMETRY_REPORTABLE_METRICS = [
  'frontend_agent_network_request_duration_ms',
  'frontend_agent_composer_input_latency_ms',
  'frontend_agent_composer_serialize_ms',
  'frontend_agent_send_stage_latency_ms',
  'frontend_agent_stream_buffer_lifetime_ms',
  'frontend_agent_stream_flush_total',
  'frontend_agent_stream_text_chars',
  'frontend_agent_stream_update_total',
  'frontend_agent_timeline_page_duration_ms',
  'frontend_agent_timeline_page_items',
  'frontend_agent_timeline_page_payload_bytes',
  'frontend_agent_thread_restore_duration_ms',
  'frontend_agent_thread_restore_message_count',
  'frontend_agent_thread_restore_payload_bytes',
  'frontend_storage_operation_duration_ms',
  'frontend_storage_payload_bytes',
  'frontend_web_vital_fcp_ms',
  'frontend_web_vital_lcp_ms',
  'frontend_web_vital_ttfb_ms',
  'frontend_web_vital_cls_score',
  'frontend_web_vital_inp_ms',
  'frontend_ui_errors_total',
  'movscript_agent_operation_duration_ms',
  'movscript_agent_operation_phase_delta_ms',
  'movscript_agent_storage_file_bytes',
  'movscript_agent_storage_flush_duration_ms',
  'movscript_agent_storage_operation_duration_ms',
  'movscript_agent_trace_store_operation_duration_ms',
  'movscript_agent_trace_span_duration_ms',
  'movscript_agent_trace_event_total',
] as const

export type AgentTelemetryReportableMetricName = typeof AGENT_TELEMETRY_REPORTABLE_METRICS[number]

export interface AgentTelemetryMetricSample {
  name: string
  unit: AgentTelemetryMetricUnit
  value: number
  labels?: Partial<Record<AgentTelemetryLabelKey, AgentTelemetryLabelValue>>
}

export interface AgentTelemetryLogSample {
  level: AgentTelemetryLogLevel
  area: string
  kind: string
}

export interface AgentClientTelemetryBatchV1 {
  schema: typeof AGENT_CLIENT_TELEMETRY_SCHEMA
  operations?: JSONValue[]
  longTasks?: JSONValue[]
  metrics?: AgentTelemetryMetricSample[]
  logs?: AgentTelemetryLogSample[]
}

export function isAgentTelemetryReportableMetricName(name: string): name is AgentTelemetryReportableMetricName {
  return (AGENT_TELEMETRY_REPORTABLE_METRICS as readonly string[]).includes(name)
}

export function normalizeAgentTelemetryLabelValue(value: unknown, fallback = 'unknown'): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return fallback
  const normalized = String(value).trim()
  return normalized || fallback
}

export function sanitizeAgentTelemetryLabels(
  labels?: Partial<Record<AgentTelemetryLabelKey | string, AgentTelemetryLabelValue | undefined>>,
): Record<string, string> {
  if (!labels) return {}
  const result: Record<string, string> = {}
  for (const key of AGENT_TELEMETRY_LABEL_KEYS) {
    const value = labels[key]
    if (value === undefined) continue
    result[key] = normalizeAgentTelemetryLabelValue(value)
  }
  return result
}

export function createAgentTelemetryMetricSample(input: {
  name: string
  unit: AgentTelemetryMetricUnit
  value: number
  labels?: Partial<Record<AgentTelemetryLabelKey | string, AgentTelemetryLabelValue | undefined>>
}): AgentTelemetryMetricSample {
  return {
    name: input.name,
    unit: input.unit,
    value: Number.isFinite(input.value) && input.value > 0 ? input.value : 0,
    labels: sanitizeAgentTelemetryLabels(input.labels),
  }
}

export function createAgentTelemetryLogSample(input: {
  level: AgentTelemetryLogLevel
  area: unknown
  kind: unknown
}): AgentTelemetryLogSample {
  return {
    level: input.level,
    area: normalizeAgentTelemetryLabelValue(input.area, 'agent_frontend'),
    kind: normalizeAgentTelemetryLabelValue(input.kind, 'unknown'),
  }
}

export type MediaTimingSource = 'tts_timing' | 'forced_align' | 'stt' | 'manual'
export type MediaPipelineCapability = 'audio_tts' | 'audio_transcribe' | 'audio_music' | 'audio_sfx' | 'subtitle_align' | 'subtitle_translate'
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'json'
export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'opus' | 'flac'
export type RenderOutputFormat = 'mp4' | 'mov' | 'webm'
export type RenderAspectRatio = '9:16' | '16:9' | '1:1' | '4:5'
export type MediaProviderFeature =
  | 'streaming'
  | 'ssml'
  | 'word_timestamps'
  | 'phoneme_timestamps'
  | 'viseme_timestamps'
  | 'voice_clone'
  | 'voice_design'
  | 'multi_speaker'
  | 'emotion_control'
  | 'speed_control'
  | 'pitch_control'
  | 'forced_alignment'

export interface MediaProviderParamDef {
  key: string
  label?: string
  type: 'string' | 'number' | 'boolean' | 'select'
  default?: JSONValue
  options?: Array<string | number | boolean>
  min?: number
  max?: number
  step?: number
}

export interface MediaModelContract {
  modelId: string
  displayName: string
  features: MediaProviderFeature[]
  supportedLanguages?: string[]
  supportedFormats?: string[]
  supportedParams: MediaProviderParamDef[]
}

export interface MediaCapabilityContract {
  capability: MediaPipelineCapability
  models: MediaModelContract[]
}

export interface MediaProviderContractV1 {
  schema: typeof MEDIA_PROVIDER_CONTRACT_V1_SCHEMA
  schemaVersion: 1
  provider: string
  displayName?: string
  capabilities: MediaCapabilityContract[]
}

export interface TimedTextUnit {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
  speaker?: string
}

export interface TimingMetadata {
  source: MediaTimingSource
  provider?: string
  language?: string
  durationMs: number
  segments: TimedTextUnit[]
  words?: TimedTextUnit[]
  characters?: TimedTextUnit[]
}

export interface VoiceoverResourceRef {
  resourceId: number
  text: string
  voice: string
  language: string
  durationMs: number
  provider: string
  model?: string
  audioFormat?: AudioFormat
  timingSource?: MediaTimingSource
}

export interface SubtitleResourceRef {
  resourceId: number
  format: SubtitleFormat
  source: MediaTimingSource
  language: string
  relatedAudioResourceId: number
  confidence?: number
  styleId?: string
}

export interface RenderClipRef {
  resourceId: number
  startMs: number
  endMs: number
  trimStartMs?: number
  trimEndMs?: number
}

export interface SubtitleStyleRef {
  styleId?: string
  font?: string
  position?: 'bottom' | 'middle' | 'top'
  safeMarginPx?: number
  burnIn?: boolean
}

export interface RenderRecipe {
  aspectRatio: RenderAspectRatio
  resolution: string
  clips: RenderClipRef[]
  voiceoverResourceId: number
  subtitleResourceId?: number
  bgmResourceId?: number
  subtitleStyle?: SubtitleStyleRef
  outputFormat: RenderOutputFormat
}

export interface MediaArtifactsV1 {
  schema: typeof MEDIA_ARTIFACTS_V1_SCHEMA
  schemaVersion: 1
  projectId?: number
  voiceover: VoiceoverResourceRef
  timing: TimingMetadata
  subtitles?: SubtitleResourceRef[]
  renderRecipe?: RenderRecipe
}

export type AgentMessageRole = 'system' | 'user' | 'assistant'
export type AgentRunStatus = 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'
export const AGENT_RUN_TERMINAL_STATUSES = ['completed', 'completed_with_warnings', 'failed', 'cancelled'] as const satisfies readonly AgentRunStatus[]
export const AGENT_RUN_STREAM_SETTLED_STATUSES = [...AGENT_RUN_TERMINAL_STATUSES, 'requires_action'] as const satisfies readonly AgentRunStatus[]
export const AGENT_RUN_STOPPABLE_STATUSES = ['queued', 'in_progress', 'requires_action'] as const satisfies readonly AgentRunStatus[]
export type AgentThreadStatus = 'idle' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled'
export type AgentConversationLifecycle = 'provisional' | 'active' | 'abandoned'
export type AgentStepStatus = 'in_progress' | 'completed' | 'failed'
export type AgentRunRole = 'planner' | 'worker'
export type AgentThreadRole = 'root' | 'planner' | 'worker'
export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed'
export type AgentTaskGraphStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentTaskStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AgentInputRequestStatus = 'pending' | 'answered' | 'cancelled'
export type AgentRunExecutionMode = 'standard' | 'compact' | 'deep'

export function isAgentRunTerminalStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function isAgentRunStreamSettledStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_STREAM_SETTLED_STATUSES as readonly string[]).includes(status)
}

export function isAgentRunStoppableStatus(status: AgentRunStatus | undefined): boolean {
  return !!status && (AGENT_RUN_STOPPABLE_STATUSES as readonly string[]).includes(status)
}

export type MovScriptWorkspaceKind =
  | 'setting_workspace'
  | 'asset_workspace'
  | 'project_standards_workspace'
  | 'production_workspace'
  | 'content_unit_workspace'

export type ProviderToolRiskLevel = 'read' | 'workspace' | 'write' | 'generate' | 'destructive' | 'ui'
export type ProviderToolApprovalMode = 'never' | 'always' | 'on_write'
export type ProviderToolGrantMode = 'allow' | 'deny'
export type ProviderToolApprovalDefaults = Partial<Record<ProviderToolRiskLevel | 'default', ProviderToolApprovalMode>>
export interface ProviderConfigFileLimits {
  maxToolCalls?: number
  maxIterations?: number
  executionMode?: AgentRunExecutionMode
  allowForcedToolCalls?: boolean
  maxActiveTriggeredSkills?: number
  systemPromptCharLimit?: number
  contextWindowCharLimit?: number
  maxRetrievedContextChars?: number
  maxReferenceCharsPerRun?: number
  maxReferenceChunksPerRun?: number
  maxHistoryMessages?: number
  maxThreadSummaryChars?: number
}

export interface MCPResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: JSONValue
  outputSchema?: JSONValue
}

export interface AgentMessage {
  id: string
  threadId: string
  role: AgentMessageRole
  content: string
  clientInput?: JSONValue
  runId?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
}

export interface AgentThread {
  id: string
  sessionId?: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  agentName?: string
  agentRole?: AgentThreadRole
  parentThreadId?: string
  parentRunId?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  currentPlan?: AgentPlan
  planRevisions?: AgentPlanRevision[]
  runtimeStatuses?: ProviderSessionStatusRecord[]
  contextDiagnostics?: AgentContextDiagnosticRecord[]
  archived?: boolean
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
}

export interface AgentContextDiagnosticRecord {
  id: string
  threadId: string
  runId?: string
  command?: string
  content: string
  diagnostic: AgentContextDiagnostic
  createdAt: string
}

export interface ProviderSessionStatusRecord {
  id: string
  threadId: string
  runId?: string
  content: string
  status: ProviderSessionStatusMessage
  createdAt: string
}

export interface AgentSession {
  id: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  rootThreadId?: string
  interactiveThreadId?: string
  activeThreadId?: string
  status?: AgentThreadStatus
  createdAt: string
  updatedAt: string
}

export interface AgentSessionSummary extends AgentSession {
  threadCount: number
}

export interface AgentThreadSummary {
  id: string
  sessionId?: string
  lifecycle?: AgentConversationLifecycle
  expiresAt?: string
  title?: string
  agentName?: string
  agentRole?: AgentThreadRole
  parentThreadId?: string
  parentRunId?: string
  projectId?: number
  metadata?: Record<string, JSONValue>
  currentPlan?: AgentPlan
  archived: boolean
  status?: AgentThreadStatus
  activeRunId?: string
  lastRunId?: string
  lastRunStatus?: AgentRunStatus
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessageAt?: string
}

export interface AgentThreadListPage {
  threads: AgentThreadSummary[]
  total: number
  limit: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentThreadDeletionResult {
  deleted: boolean
  threadId: string
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedProviderWorkIds: string[]
  deletedProviderInteractionIds: string[]
  deletedProviderContinuationIds: string[]
}

export interface AgentThreadClearResult {
  deleted: boolean
  deletedThreadIds: string[]
  deletedRunIds: string[]
  deletedTaskGraphIds: string[]
  deletedTaskIds: string[]
  deletedProviderWorkIds: string[]
  deletedProviderInteractionIds: string[]
  deletedProviderContinuationIds: string[]
}

export interface AgentPlanTask {
  step: string
  status: AgentPlanTaskStatus
}

export interface AgentPlan {
  schema: 'movscript.agent.plan.v1'
  id: string
  threadId: string
  runId?: string
  explanation?: string
  items: AgentPlanTask[]
  completedCount: number
  totalCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentPlanRevision {
  schema: 'movscript.agent.plan-revision.v1'
  id: string
  planId: string
  threadId: string
  runId?: string
  explanation?: string
  snapshot: AgentPlan
  createdAt: string
}

export interface AgentRunStep {
  id: string
  runId: string
  type: 'tool_call' | 'message'
  status: AgentStepStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  title?: string
  toolName?: string
  args?: Record<string, JSONValue>
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface ProviderManifest {
  schema: 'movscript.agent.current'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  tools: Array<{
    name: string
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
  skills?: Array<{
    id: string
    enabled?: boolean
  }>
  model?: {
    provider?: string
    modelId?: string
    catalogEntryId?: number
  }
  metadata?: Record<string, JSONValue>
}

export interface ProviderCatalogSkill {
  id: string
  name: string
  description: string
  version?: string
  enabled: boolean
  priority?: number
  instruction: string
  instructionTemplate?: string
  loadMode?: 'core' | 'on_demand' | 'manual'
  source?: 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
  activationScope?: 'turn' | 'run' | 'thread'
  tags?: string[]
  aliases?: string[]
  useWhen?: string[]
  triggers?: JSONValue[]
  dependencies?: string[]
  conflicts?: string[]
  toolGrants?: string[]
  schemaRefs?: string[]
  tokenEstimate?: number
  contextBudget?: {
    maxChars?: number
    reserveRatio?: number
    strategy?: 'fixed' | 'proportional' | 'opportunistic'
  }
  outputContract?: string
  toolHints?: string[]
  runtime?: ProviderSkillRuntimeExplanation
  metadata?: Record<string, JSONValue>
}

export interface ProviderSkillRuntimeExplanation {
  configEnabled: boolean
  loadMode: 'core' | 'on_demand' | 'manual'
  defaultActivation: 'always' | 'triggered' | 'manual' | 'disabled'
  contextBehavior: 'base_context' | 'on_demand' | 'manual' | 'excluded'
  dependencyIds: string[]
  conflictIds: string[]
  toolGrantNames: string[]
  reason: string
}

export interface ProviderCatalogConfigFile {
  schema: 'movscript.agent.config_file.v1'
  id: string
  version: string
  name: string
  description?: string
  enabledPackIds: string[]
  skillIds: string[]
  approvalDefaults?: ProviderToolApprovalDefaults
  toolGrants: Array<{
    name: string
    mode: ProviderToolGrantMode
    approval?: ProviderToolApprovalMode
  }>
  model?: {
    provider: string
    modelId: string
    catalogEntryId?: string
    routes?: unknown[]
  }
  limits?: ProviderConfigFileLimits
  metadata?: Record<string, JSONValue>
}

export interface ProviderCatalogPack {
  id: string
  version: string
  name: string
  description?: string
  source: 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
  schemas: string[]
  tools: string[]
  skills: string[]
  reference?: string[]
  requires?: {
    packs?: Record<string, string>
    schemas?: Record<string, string>
    tools?: Record<string, string>
    skills?: Record<string, string>
  }
  conflicts?: string[]
  pluginId?: string
  mcpServerId?: string
}

export interface AgentRunConfigurationSnapshot {
  schema: 'movscript.agent.run-configuration-snapshot.v1'
  capturedAt: string
  catalogSnapshot: {
    id: string
    version: string | null
  }
  activeConfigFileId: string
  providerSessionLimits: ProviderSessionLimits
  activeProviderManifest: ProviderManifest
  activeAgentManifest?: ProviderManifest
  toolPermissionOverridesByConfigFile: Record<string, Array<{
    name: string
    mode: ProviderToolGrantMode
    approval?: ProviderToolApprovalMode
  }>>
  configFiles: ProviderCatalogConfigFile[]
  packs: ProviderCatalogPack[]
  skills: Array<{
    id: string
    name: string
    description: string
    version?: string
    enabled: boolean
    priority?: number
    instructionTemplate: string
    loadMode?: ProviderCatalogSkill['loadMode']
    source?: ProviderCatalogSkill['source']
    activationScope?: ProviderCatalogSkill['activationScope']
    tags?: string[]
    aliases?: string[]
    useWhen?: string[]
    triggers?: JSONValue[]
    dependencies?: string[]
    conflicts?: string[]
    toolGrants?: string[]
    schemaRefs?: string[]
    tokenEstimate?: number
    contextBudget?: ProviderCatalogSkill['contextBudget']
    outputContract?: string
    toolHints?: string[]
    metadata?: Record<string, JSONValue>
  }>
  tools: Array<{
    name: string
    description: string
    permission: string
    risk: ProviderToolRiskLevel | string
    source?: 'runtime' | 'local' | 'plugin' | 'mcp'
    category?: string
    categories?: string[]
    defaults: {
      grant: ProviderToolGrantMode
      approval: ProviderToolApprovalMode
      timeoutMs?: number
    }
    execution?: ProviderToolExecutionMetadata
    projectScoped: boolean
    capability?: string
    pluginId?: string
    mcpServerId?: string
    errorCodes?: string[]
    requiresSkills?: string[]
  }>
  pluginCatalog: ProviderPluginCatalogInfo | null
  warnings: string[]
}

export interface ResolvedProviderSkill extends ProviderCatalogSkill {
  resolvedPriority: number
  activationReason: 'trigger' | 'default'
  compiledInstruction: string
  warnings: string[]
}

export type ToolUnavailableReason =
  | 'mcp_unavailable'
  | 'unregistered'
  | 'not_granted'
  | 'denied'
  | 'inactive'
  | 'missing_permission'
  | 'missing_project'
  | 'approval_required'
  | 'schema_invalid'
  | 'wrong_run_role'
  | 'skill_scope'

export type ProviderToolInterruptBehavior = 'cancel' | 'block'
export type ProviderToolResultRefStrategy = 'inline' | 'summary_ref' | 'auto'

export interface ProviderToolExecutionMetadata {
  readOnly: boolean
  destructive: boolean
  concurrencySafe: boolean
  interruptBehavior: ProviderToolInterruptBehavior
  maxResultSizeChars?: number
  resultRefStrategy?: ProviderToolResultRefStrategy
}

export interface ProviderToolDescriptor {
  name: string
  description?: string
  inputSchema?: JSONValue
  outputSchema?: JSONValue
  source: 'mcp' | 'runtime' | 'local' | 'plugin'
  category?: string
  categories?: string[]
  registered: boolean
  granted: boolean
  permission?: string
  risk?: ProviderToolRiskLevel
  execution?: ProviderToolExecutionMetadata
  projectScoped?: boolean
  approval: ProviderToolApprovalMode
  available: boolean
  unavailableReason?: ToolUnavailableReason | string
  requiresApproval: boolean
  runtime?: ProviderToolRuntimeExplanation
  resolution?: {
    authorized: boolean
    visible: boolean
    reason?: ToolUnavailableReason | string
    grantSource: 'manifest' | 'skill' | 'none'
    approval: ProviderToolApprovalMode
    activeSkillIds: string[]
    grantingSkillIds?: string[]
  }
}

export interface ProviderToolRuntimeExplanation {
  registered: boolean
  source: 'mcp' | 'runtime' | 'local' | 'plugin'
  grantMode: 'allow' | 'deny' | 'none'
  grantSource: 'manifest' | 'skill' | 'none'
  approval: ProviderToolApprovalMode
  approvalRequired: boolean
  approvalReason: 'none' | 'explicit_always' | 'on_write' | 'tool_default' | 'unknown_tool'
  available: boolean
  unavailableReason?: ToolUnavailableReason | string
  execution: ProviderToolExecutionMetadata
  reason: string
}

export interface ResolvedToolCatalog {
  discovered: ProviderToolDescriptor[]
  available: ProviderToolDescriptor[]
  blocked: ProviderToolDescriptor[]
  byName: Record<string, ProviderToolDescriptor>
}

export interface ProviderRegisteredTool {
  name: string
  description: string
  permission: string
  risk: ProviderToolRiskLevel | string
  source?: 'runtime' | 'local' | 'plugin' | 'mcp'
  category?: string
  categories?: string[]
  inputSchema?: JSONValue
  outputSchema?: JSONValue
  execution?: ProviderToolExecutionMetadata
  projectScoped: boolean
  requiresApprovalByDefault: boolean
}

export interface ProviderPluginCatalogInfo {
  skillsDir: string
  toolsDir: string
  builtinSkillsDir?: string
  builtinToolsDir?: string
  skillCount: number
  toolCount: number
  metadata?: Record<string, unknown>
  warnings?: string[]
}

export interface ProviderMCPStatus {
  connected: boolean
  resources: MCPResource[]
  tools: MCPTool[]
  error?: string
}

export interface ProviderSessionCapabilitiesResponse {
  activeProviderManifest: ProviderManifest
  activeAgentManifest?: ProviderManifest
  updates?: unknown
  pluginCatalog?: ProviderPluginCatalogInfo
  mcp: ProviderMCPStatus
  registry: ProviderRegisteredTool[]
  resolvedTools: ResolvedToolCatalog
  warnings: string[]
}

export interface ProviderCatalogInspectResponse {
  mcpEndpoint: string
  resources: MCPResource[]
  tools: MCPTool[]
  registeredTools: ProviderRegisteredTool[]
  skills: ProviderCatalogSkill[]
  packs: ProviderCatalogPack[]
  configFiles: ProviderCatalogConfigFile[]
  activeConfigFileId: string | null
  activeProviderManifest: ProviderManifest
  activeAgentManifest?: ProviderManifest
  pluginCatalog?: ProviderPluginCatalogInfo
}

export const PROVIDER_MODEL_API_KINDS = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
] as const

export type ProviderModelAPIKind = typeof PROVIDER_MODEL_API_KINDS[number]

export const PROVIDER_MODEL_CAPABILITIES = ['reasoning', 'text', 'planning', 'multimodal'] as const

export type ProviderModelCapability = typeof PROVIDER_MODEL_CAPABILITIES[number]

export type ProviderModelRouteSource =
  | 'configured'
  | 'chat-config-fallback'
  | 'planner-config'
  | 'disabled'
  | 'unconfigured'

export interface ProviderModelCredentialStatusPublic {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface ProviderModelCapabilityRoutePublic {
  capability: ProviderModelCapability
  configured: boolean
  provider?: 'backend-model-config'
  model?: string
  source: ProviderModelRouteSource
}

export interface ProviderModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  model: string
  apiKind: ProviderModelAPIKind
  baseURL?: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
  credentialStatus: ProviderModelCredentialStatusPublic
  capabilities?: ProviderModelCapabilityRoutePublic[]
}

export interface ProviderModelChatToolCallPublic {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ProviderModelChatMessagePublic {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: ProviderModelContentPartPublic[]
  tool_call_id?: string
  tool_calls?: ProviderModelChatToolCallPublic[]
}

export type ProviderModelContentPartPublic = ProviderModelTextContentPartPublic | ProviderModelImageContentPartPublic

export interface ProviderModelTextContentPartPublic {
  type: 'text'
  text: string
}

export interface ProviderModelImageContentPartPublic {
  type: 'image'
  source: ProviderModelImageSourcePublic
  detail?: 'low' | 'high' | 'auto'
}

export type ProviderModelImageSourcePublic =
  | { type: 'url'; url: string }
  | { type: 'data_url'; dataUrl: string }
  | { type: 'file_id'; fileId: string }

export interface ProviderModelRequestSnapshotPublic {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Record<string, unknown> & {
    model: string
    messages: unknown[]
    stream?: boolean
    temperature?: number
    response_format?: { type: 'json_object' }
    tools?: unknown
    tool_choice?: unknown
    sdk_body?: unknown
  }
}

export interface ProviderModelTestResult {
  ok: boolean
  provider: string
  model: string
  apiKind: ProviderModelAPIKind
  latencyMs: number
  content: string
  request: ProviderModelRequestSnapshotPublic
}

export type ProviderDisplayAnchorPlacement = 'before' | 'after' | 'inside_run_group'

export interface ProviderDisplayAnchor {
  threadId: string
  runId?: string
  messageId?: string
  taskId?: string
  placement: ProviderDisplayAnchorPlacement
  reason?: string
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  toolName: string
  args?: Record<string, JSONValue>
  origin?: AgentToolCallOrigin
  preview?: JSONValue
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface ProviderSessionInputChoice {
  id: string
  label: string
  description?: string
}

export interface ProviderSessionInputRequest {
  id: string
  runId: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  title: string
  summary?: string
  question: string
  inputType: 'choice' | 'text' | 'confirmation'
  choices: ProviderSessionInputChoice[]
  allowCustomAnswer: boolean
  status: AgentInputRequestStatus
  createdAt: string
  updatedAt: string
  answeredAt?: string
  answer?: {
    choiceIds?: string[]
    text?: string
  }
}

export interface AgentTaskArtifact {
  id: string
  type: string
  title?: string
  uri?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
}

export interface AgentTask {
  id: string
  taskGraphId: string
  parentId?: string
  deps: string[]
  title: string
  description?: string
  status: AgentTaskStatus
  progress: number
  ownerRunId?: string
  blockedReason?: string
  artifacts: AgentTaskArtifact[]
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskGraph {
  id: string
  sessionId?: string
  threadId: string
  rootRunId?: string
  title: string
  status: AgentTaskGraphStatus
  progress: number
  blockedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskGraphSummary {
  taskCount: number
  taskStatusCounts: Record<AgentTaskStatus, number>
  workerCount: number
  activeWorkerCount: number
  artifactCount: number
  nameConflictCount: number
  blockedTaskIds: string[]
  needsReviewTaskIds: string[]
  failedTaskIds: string[]
}

export interface AgentTaskGraphSnapshot {
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
  runs: AgentRun[]
  nameConflicts?: Array<{
    subagentName: string
    taskIds: string[]
  }>
  summary?: AgentTaskGraphSummary
}

export interface DispatchTaskGraphResult {
  taskGraph: AgentTaskGraph
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
  retriedTaskIds: string[]
  timedOutRunIds: string[]
}

export interface UpdateTaskGraphResult {
  taskGraph: AgentTaskGraph
  createdTaskIds: string[]
  updatedTaskIds: string[]
  resetTaskIds: string[]
  dispatch?: DispatchTaskGraphResult
}

export interface AgentRun {
  id: string
  sessionId?: string
  threadId: string
  status: AgentRunStatus
  role?: AgentRunRole
  parentRunId?: string
  taskGraphId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
  input?: AgentRunInput
  providerManifest?: ProviderManifest
  agentManifest?: ProviderManifest
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: ProviderSessionInputRequest[]
  providerSessionLimits: ProviderSessionLimits
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  warnings?: string[]
  assistantMessageId?: string
  steps: AgentRunStep[]
  traceEvents?: AgentTraceEvent[]
  streamPartial?: true
}

export interface AgentThreadResolution {
  requestedThreadId?: string
  threadId: string
  reusedExistingThread: boolean
  createdNewThread: boolean
  missingRequestedThread: boolean
}

export interface RunMessageResult {
  run: AgentRun
  thread: AgentThread
  threadResolution: AgentThreadResolution
  sourceMessage?: AgentMessage
}

export interface CreateMessageRunResult {
  run: AgentRun
  message: AgentMessage
  providerSessionInput?: {
    accepted: boolean
    runId: string
    messageId: string
    deliveryStatus: ProviderSessionInputDeliveryStatus
  }
}

export interface ProviderSessionClientAttachmentRef {
  id?: string
  name?: string
  type?: string
  mimeType?: string
  size?: number
  url?: string
  resourceId?: number
  dataUrl?: string
  source?: AgentAttachmentSource
  vision?: Record<string, JSONValue>
}

export interface ProviderSessionClientResourceRef {
  id?: number
  name?: string
  type?: string
  mimeType?: string
  size?: number
}

export interface ProviderSessionClientInput {
  message: string
  attachments?: ProviderSessionClientAttachmentRef[]
  uiSnapshot?: {
    route?: {
      pathname?: string
      search?: string
      hash?: string
    }
    pageContext?: {
      pageKey?: string
      pageType?: string
      pageRoute?: string
      pageEntityType?: string
      pageEntityId?: number | string
      workspaceId?: string
    }
    project?: {
      id?: number
      name?: string
      status?: string
      description?: string
    }
    workspaceId?: string
    agent?: {
      key?: string
      name?: string
    }
    selection?: {
      entityType?: string
      entityId?: number | string
      label?: string
    } | null
    recentResources?: ProviderSessionClientResourceRef[]
    labels?: string[]
  }
}

export type ProviderWorkKind = 'generation_job' | 'subagent_run'
export type ProviderWorkMode = 'async'
export type ProviderWorkStatus = 'pending_approval' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type ProviderWorkContinuationMode = 'none' | 'any_completed' | 'all_completed' | 'all_settled' | 'manual_selection'

export interface ProviderWorkExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface ProviderWork {
  id: string
  sessionId?: string
  threadId: string
  runId: string
  kind: ProviderWorkKind
  mode: ProviderWorkMode
  status: ProviderWorkStatus
  request: unknown
  continuationPolicy?: {
    mode: ProviderWorkContinuationMode
    groupId?: string
  }
  externalHandle?: ProviderWorkExternalHandle
  result?: unknown
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface ProviderWorkStartInput {
  sessionId?: string
  threadId: string
  runId: string
  kind: ProviderWorkKind
  request: Record<string, JSONValue>
  continuationPolicy?: ProviderWork['continuationPolicy']
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface ProviderWorkWaitInput {
  workIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onWork?: (work: ProviderWork) => void
}

export interface ProviderWorkWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  workIds: string[]
  works: ProviderWork[]
  completed: ProviderWork[]
  pending: ProviderWork[]
  failed: ProviderWork[]
  cancelled: ProviderWork[]
  timeoutMs: number
  message: string
}

export type ProviderInteractionKind = 'approval' | 'input' | 'selection'
export type ProviderInteractionStatus = 'pending' | 'approved' | 'rejected' | 'answered' | 'cancelled'

export interface ProviderInteraction {
  id: string
  threadId: string
  runId: string
  sessionId?: string
  originThreadId?: string
  originRunId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  workId?: string
  kind: ProviderInteractionKind
  status: ProviderInteractionStatus
  payload: unknown
  result?: unknown
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

export type ProviderContinuationStatus = 'waiting' | 'ready' | 'consumed' | 'cancelled'

export interface ProviderContinuation {
  id: string
  threadId: string
  runId: string
  status: ProviderContinuationStatus
  trigger:
    | { type: 'work_completed'; workIds: string[]; mode: 'any' | 'all' }
    | { type: 'interaction_resolved'; interactionIds: string[]; mode: 'any' | 'all' }
    | { type: 'manual' }
  nextInput?: {
    workResults?: string[]
    interactionResults?: string[]
    message?: string
  }
  createdAt: string
  updatedAt: string
  consumedAt?: string
  cancelledAt?: string
}

export type ProviderWakeEventKind = 'work.started' | 'work.observed' | 'run.settled' | 'thread.opened'
export type ProviderWakeEventStatus = 'queued' | 'processing' | 'consumed' | 'cancelled'

export interface ProviderWakeEvent {
  id: string
  threadId: string
  runId?: string
  workId?: string
  kind: ProviderWakeEventKind
  status: ProviderWakeEventStatus
  payload: unknown
  dedupeKey: string
  createdAt: string
  updatedAt: string
  consumedAt?: string
}

export type ProviderSessionScopeType = 'thread' | 'session' | 'run' | 'plan'

export interface ProviderSessionScopeRef {
  type: ProviderSessionScopeType
  id: string
}

export interface ProviderSessionEntitiesV2 {
  sessions?: AgentSession[]
  threads?: AgentThread[]
  messages?: AgentMessage[]
  runs?: AgentRun[]
  steps?: AgentRunStep[]
  traces?: AgentTraceEvent[]
  interactions?: ProviderInteraction[]
  works?: ProviderWork[]
  continuations?: ProviderContinuation[]
  wakeEvents?: ProviderWakeEvent[]
  plans?: AgentPlan[]
  planRevisions?: AgentPlanRevision[]
  runtimeStatuses?: ProviderSessionStatusRecord[]
  taskGraphs?: AgentTaskGraphSnapshot[]
}

export interface ProviderSessionSnapshotV2 {
  schema: ProviderSessionSnapshotV2Schema
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  scope: ProviderSessionScopeRef
  cursor: string
  ordinal: number
  generatedAt: string
  entities: ProviderSessionEntitiesV2
}

export type ProviderSessionEntityType = keyof ProviderSessionEntitiesV2

export type ProviderSessionEventKind =
  | 'session.upserted'
  | 'thread.upserted'
  | 'message.upserted'
  | 'run.upserted'
  | 'step.upserted'
  | 'trace.upserted'
  | 'interaction.upserted'
  | 'work.upserted'
  | 'continuation.upserted'
  | 'wake_event.upserted'
  | 'plan.upserted'
  | 'plan_revision.upserted'
  | 'runtime_status.upserted'
  | 'task_graph.upserted'
  | 'assistant.progress'
  | 'scope.done'

export interface ProviderSessionEventCausalityV2 {
  sessionId?: string
  threadId?: string
  runId?: string
  messageId?: string
  stepId?: string
  traceId?: string
  interactionId?: string
  workId?: string
  continuationId?: string
  wakeEventId?: string
  planId?: string
  planRevisionId?: string
  runtimeStatusId?: string
  taskGraphId?: string
  taskId?: string
  sourceEventId?: string
}

export type ProviderSessionEventEntityV2 =
  | { type: 'session'; value: AgentSession }
  | { type: 'thread'; value: AgentThread }
  | { type: 'message'; value: AgentMessage }
  | { type: 'run'; value: AgentRun }
  | { type: 'step'; value: AgentRunStep }
  | { type: 'trace'; value: AgentTraceEvent }
  | { type: 'interaction'; value: ProviderInteraction }
  | { type: 'work'; value: ProviderWork }
  | { type: 'continuation'; value: ProviderContinuation }
  | { type: 'wake_event'; value: ProviderWakeEvent }
  | { type: 'plan'; value: AgentPlan }
  | { type: 'plan_revision'; value: AgentPlanRevision }
  | { type: 'runtime_status'; value: ProviderSessionStatusRecord }
  | { type: 'task_graph'; value: AgentTaskGraphSnapshot }

export interface ProviderSessionAssistantProgressV2 {
  runId: string
  traceId: string
  delta: string
  accumulated: string
  createdAt: string
  roundIndex?: number
  roundLabel?: string
}

export interface ProviderSessionEventV2 {
  schema: ProviderSessionEventV2Schema
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  id: string
  scope: ProviderSessionScopeRef
  ordinal: number
  cursor: string
  emittedAt: string
  kind: ProviderSessionEventKind
  causality?: ProviderSessionEventCausalityV2
  entity?: ProviderSessionEventEntityV2
  assistantProgress?: ProviderSessionAssistantProgressV2
}

export type AgentTimelineOrigin = 'provider_session' | 'user' | 'agent'
export type AgentTimelinePurpose = 'transcript' | 'status' | 'diagnostic'
export type AgentTimelineSurface =
  | 'message_stream'
  | 'status_strip'
  | 'debug_panel'
export type AgentTimelineContentPromptEligibility = 'include' | 'exclude'
export type AgentTimelineStatus = 'pending' | 'streaming' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled' | 'requires_action'
export type ProviderSessionInputDeliveryStatus = 'pending' | 'accepted' | 'consumed' | 'failed'

export function agentTimelineStatusFromRunStatus(status: AgentRunStatus): AgentTimelineStatus {
  if (status === 'queued') return 'pending'
  if (status === 'in_progress') return 'streaming'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'completed_with_warnings') return 'completed_with_warnings'
  return 'completed'
}

export interface AgentTimelineProviderSessionRefs {
  sessionId?: string
  threadId: string
  messageId?: string
  runId?: string
  traceId?: string
}

export interface AgentTimelineMeta {
  runtimeStatus?: ProviderSessionStatusMessage
  contextDiagnostic?: AgentContextDiagnostic
  planRevision?: AgentPlanRevision
}

export interface AgentTimelineItem {
  id: string
  sessionId?: string
  threadId: string
  /** Provider-session/user/agent source. This is not a UI surface decision by itself. */
  origin: AgentTimelineOrigin
  /** Conversation purpose. `transcript` means message-stream text, not prompt inclusion. */
  purpose: AgentTimelinePurpose
  /** UI surface that owns this item. */
  surface: AgentTimelineSurface
  /** Model prompt eligibility is independent from transcript rendering. */
  contentPromptEligibility: AgentTimelineContentPromptEligibility
  /** Stable semantic order for equal timestamps. Clients sort by createdAt, sortRank, then id. */
  sortRank: number
  content?: string
  attachments?: AgentAttachment[]
  meta?: AgentTimelineMeta
  activity?: AgentTimelineActivity
  status?: AgentTimelineStatus
  createdAt: string
  updatedAt: string
  revision: number
  /** Opaque pagination token. Clients must not parse it for display ordering. */
  cursor: string
  providerSessionRefs: AgentTimelineProviderSessionRefs
}

export interface AgentTimelinePage {
  items: AgentTimelineItem[]
  nextBefore?: string
  hasMoreBefore: boolean
  snapshotRevision: number
}

export type AgentTimelineItemStreamEventType = 'timeline.item.created' | 'timeline.item.updated'
export type AgentTimelineStreamEventType = AgentTimelineItemStreamEventType | 'timeline.reset_required'

export interface AgentTimelineItemStreamEvent {
  type: AgentTimelineItemStreamEventType
  revision: number
  item: AgentTimelineItem
}

export interface AgentTimelineResetStreamEvent {
  type: 'timeline.reset_required'
  revision: number
  reason?: string
}

export type AgentTimelineStreamEvent = AgentTimelineItemStreamEvent | AgentTimelineResetStreamEvent

export interface AgentRunInput {
  schema: 'movscript.agent.run-input.v1'
  userMessage: string
  clientInput?: JSONValue
  sourceMessageId?: string
  executionMode: 'chat' | 'tool' | 'worker' | 'resume'
  parent?: {
    runId?: string
    taskGraphId?: string
    taskId?: string
  }
  task?: {
    id: string
    title: string
    description?: string
    instructions: string
    expectedArtifacts?: string[]
  }
  forcedToolCall?: ToolCall
  createdAt: string
}

export interface ProviderSessionLimits {
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
  execution?: AgentRunExecutionConfig
  costLimit?: {
    currency: string
    amount: number
  }
}

export interface AgentRunExecutionConfig {
  mode: AgentRunExecutionMode
  includeMemories?: boolean
  allowForcedToolCalls?: boolean
}

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

export const AGENT_TRACE_EVENT_KINDS = [
  'run',
  'thread',
  'message',
  'context',
  'memory',
  'manifest',
  'skill',
  'tool_catalog',
  'prompt',
  'permission',
  'reasoning',
  'tool_call',
  'model_call',
  'approval',
  'input',
  'assistant',
  'task',
  'taskGraph',
  'error',
] as const

export type AgentTraceEventKind = typeof AGENT_TRACE_EVENT_KINDS[number]
export type AgentTraceStatus = 'started' | 'completed' | 'blocked' | 'failed' | 'info'

export interface AgentTraceEvent {
  id: string
  runId: string
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: JSONValue
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface ToolCall {
  id?: string
  name: string
  args?: Record<string, JSONValue>
  arguments?: Record<string, JSONValue>
  origin?: AgentToolCallOrigin
}

export interface AgentToolCallOrigin {
  toolCallId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
}

export interface AgentTraceQuery {
  cursor?: string
  limit?: number
  kind?: AgentTraceEventKind
}

export interface AgentRunTracePage {
  runId: string
  events: AgentTraceEvent[]
  total: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentRunTraceSummary {
  runId: string
  total: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  latestEvent?: AgentTraceEvent
}

export interface AgentAttachment {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType: string
  size: number
  url?: string
  previewUrl?: string
  resourceId?: number
  dataUrl?: string
  source?: AgentAttachmentSource
  generated?: {
    jobId?: number
    jobType?: string
    contentUnitId?: string | number
    candidateId?: string | number
    resourceId?: number
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  status?: string
    stage?: string
  }
}

export type AgentAttachmentSource =
  | { kind: 'inline_data'; dataUrl: string }
  | { kind: 'backend_resource'; resourceId: number }
  | { kind: 'local_file'; fileId: string }
  | { kind: 'local_path'; path: string }
  | { kind: 'remote_url'; url: string }
  | { kind: 'display_url'; url: string }

export interface AgentTaskArtifactRef {
  type: 'workspace'
  workspaceId: string
  projectId?: number
  workspaceKind?: MovScriptWorkspaceKind
  title?: string
  schema?: string
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  metadata?: Record<string, unknown>
  filePath?: string
  sourceRunId?: string
  sourceThreadId?: string
  updatedAt?: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: AgentChatMessageMeta
  timestamp: number
}

export interface AgentConversation {
  id: string
  title: string
  transcriptMessages: AgentChatMessage[]
  transcriptMessageCount?: number
  lastTranscriptAt?: number
  providerSessionId?: string
  providerThreadId?: string
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export type AgentConversationWorkspaceScope = 'global' | 'project' | 'production'

export interface AgentConversationWorkspaceContext {
  scope?: AgentConversationWorkspaceScope
  userId?: string | number
  projectId?: string | number
  productionId?: string | number
}

export interface AgentConversationWorkspace {
  input: string
  attachments: AgentAttachment[]
  workspaceContext?: AgentConversationWorkspaceContext
}

export interface ProviderSessionMessageRef {
  threadId: string
  messageId?: string
  runId?: string
}

export interface ProviderSessionInputRef {
  threadId?: string
  runId?: string
  messageId?: string
  deliveryStatus: ProviderSessionInputDeliveryStatus
  error?: string
}

export type ProviderSessionStatusLightState = 'stopped' | 'waiting' | 'active' | 'error'

export interface ProviderSessionAsyncWorkHandoffStatusMessage {
  kind: 'async_work_handoff'
  title: string
  detail: string
  workId?: string
  workKind?: string
  workStatus?: string
}

export interface ProviderSessionStatusLightMessage {
  kind: 'status_light'
  state: ProviderSessionStatusLightState
  label: string
  detail: string
}

export type ProviderSessionStatusMessage =
  | ProviderSessionAsyncWorkHandoffStatusMessage
  | ProviderSessionStatusLightMessage

export interface AgentChatMessageMeta {
  modelId?: string | null
  agentName?: string
  contextLabels?: string[]
  promptEligibility?: 'include' | 'exclude'
  localRunActivity?: Record<string, unknown>
  providerSessionMessage?: ProviderSessionMessageRef
  providerSessionInput?: ProviderSessionInputRef
  runtimeMessage?: ProviderSessionMessageRef
  runtimeInput?: ProviderSessionInputRef
  generationJobs?: AgentGenerationJob[]
  generationParamAudits?: AgentGenerationParamAudit[]
  generationValidationErrors?: AgentGenerationValidationError[]
  workspaceArtifacts?: AgentTaskArtifactRef[]
}

export function providerSessionMessageRef(message: { meta?: AgentChatMessageMeta }): ProviderSessionMessageRef | undefined {
  return message.meta?.providerSessionMessage ?? message.meta?.runtimeMessage
}

export function providerSessionInputRef(message: { meta?: AgentChatMessageMeta }): ProviderSessionInputRef | undefined {
  return message.meta?.providerSessionInput ?? message.meta?.runtimeInput
}

export interface AgentPendingActiveRunInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function buildPendingActiveRunInputQueueItems(
  messages: Pick<AgentChatMessage, 'id' | 'role' | 'content' | 'timestamp' | 'meta'>[],
): AgentPendingActiveRunInputQueueItem[] {
  return messages
    .filter(activeRunInputIsWaitingForDelivery)
    .map((message) => {
      const providerSessionInput = providerSessionInputRef(message)
      return {
        id: message.id,
        ...(providerSessionInput?.runId?.trim() ? { runId: providerSessionInput.runId.trim() } : {}),
        content: message.content,
        timestamp: message.timestamp,
      }
    })
}

export function activeRunInputDisplayDeliveryStatus(
  message: { meta?: AgentChatMessageMeta },
): ProviderSessionInputDeliveryStatus | undefined {
  const providerSessionInput = providerSessionInputRef(message)
  if (!providerSessionInput) return undefined
  const providerSessionMessage = providerSessionMessageRef(message)
  if (
    providerSessionInput.deliveryStatus === 'pending'
    && (providerSessionInput.messageId?.trim() || providerSessionMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return providerSessionInput.deliveryStatus
}

export function activeRunInputIsWaitingForDelivery(
  message: Pick<AgentChatMessage, 'role' | 'meta'>,
): boolean {
  const providerSessionMessage = providerSessionMessageRef(message)
  return message.role === 'user'
    && activeRunInputDisplayDeliveryStatus(message) === 'pending'
    && !providerSessionMessage?.messageId
}

export function isAgentTranscriptExcludedAssistantMetadata(metadata: unknown): boolean {
  if (!isAgentMetadataRecord(metadata)) return false
  if (metadata.promptEligibility === 'exclude') return true
  return false
}

export function isAgentPromptExcludedAssistantMetadata(metadata: unknown): boolean {
  if (isAgentTranscriptExcludedAssistantMetadata(metadata)) return true
  if (!isAgentMetadataRecord(metadata)) return false
  if (isAgentMetadataRecord(metadata.localRunActivity)) return true
  return false
}

export function isAgentTranscriptExcludedAssistantMessage(message: Pick<AgentMessage, 'role' | 'metadata'>): boolean {
  return message.role === 'assistant' && isAgentTranscriptExcludedAssistantMetadata(message.metadata)
}

export function isAgentTranscriptAssistantMessage(message: Pick<AgentMessage, 'role' | 'metadata'>): boolean {
  return message.role === 'assistant' && !isAgentTranscriptExcludedAssistantMetadata(message.metadata)
}

export function isAgentPromptExcludedAssistantMessage(message: Pick<AgentMessage, 'role' | 'metadata'>): boolean {
  return message.role === 'assistant' && isAgentPromptExcludedAssistantMetadata(message.metadata)
}

function isAgentMetadataRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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

export interface AgentGenerationJob {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  status: string
  stage?: string
  progress?: number
  terminal: boolean
  outputResourceId?: number
  outputResourceIds?: number[]
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface AgentGenerationParamAudit {
  stepId?: string
  jobId?: number
  auditVersion?: number
  modelContractLoaded: boolean
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
  supportedParams: string[]
  providedExtraParams: string[]
  submittedExtraParams: string[]
  droppedExtraParams: string[]
  droppedTopLevelParams: string[]
  dropReasons?: Record<string, string>
  renamedExtraParams?: Record<string, string>
  extraParamsParseError?: string
  preflightErrors?: AgentGenerationParamPreflightError[]
  inputRequirements?: AgentGenerationInputRequirements
  submittedInputs?: AgentGenerationSubmittedInputs
  inputPreflightErrors?: AgentGenerationInputPreflightError[]
  repairNote?: string
}

export interface AgentGenerationInputRequirement {
  min: number
  max: number
}

export interface AgentGenerationInputRequirements {
  image: AgentGenerationInputRequirement
  video: AgentGenerationInputRequirement
}

export interface AgentGenerationSubmittedInputs {
  image: number
  video: number
}

export interface AgentGenerationParamPreflightError {
  code: string
  field: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
}

export interface AgentGenerationInputPreflightError {
  code: string
  field: 'image' | 'video'
  message: string
  requiredMin: number
  allowedMax: number
  actualCount: number
}

export interface AgentGenerationValidationError {
  stepId?: string
  code: string
  field?: string
  message: string
  allowedValues?: Array<string | number | boolean>
  suggestedFix?: Record<string, unknown>
  requiredMin?: number
  allowedMax?: number
  actualCount?: number
}

export interface AgentTimelineActivity {
  runId: string
  threadId: string
  status: AgentRunStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  error?: string
  warnings?: string[]
  approvals?: AgentTimelineActivityApproval[]
  inputs?: AgentTimelineActivityInputRequest[]
  steps: AgentTimelineActivityStep[]
  events: AgentTimelineActivityEvent[]
}

export interface AgentTimelineActivityApproval {
  id: string
  runId?: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  toolName: string
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface AgentTimelineActivityInputRequest {
  id: string
  runId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  title: string
  summary?: string
  question: string
  inputType: string
  choices: Array<{ id: string; label: string; description?: string }>
  allowCustomAnswer: boolean
  status: AgentInputRequestStatus
  createdAt: string
  updatedAt: string
  answeredAt?: string
  answer?: {
    choiceIds?: string[]
    text?: string
  }
}

export interface AgentTimelineActivityStep {
  id: string
  type: 'tool_call' | 'message'
  status: AgentStepStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  title?: string
  toolName?: string
  error?: string
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentTimelineActivityEvent {
  id: string
  runId?: string
  threadId?: string
  kind: string
  title: string
  summary?: string
  status: AgentTraceStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  toolName?: string
  stepId?: string
  data?: Record<string, unknown>
  durationMs?: number
  createdAt: string
  completedAt?: string
}

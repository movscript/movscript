import type { JSONValue } from './protocolJson.js'
import type { ProviderSessionLimits } from './agentRunProtocol.js'
import type { AgentRunExecutionMode } from './agentStatusProtocol.js'

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

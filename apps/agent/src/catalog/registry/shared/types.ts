import type { DraftKind, DraftScope, DraftSchemaDefinition, JSONSchema7 } from '@movscript/drafts'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { ToolExecutionMetadata, ToolRiskLevel } from '../../../tools/registry/core/toolRegistry.js'
export type SkillLoadMode = 'core' | 'on_demand' | 'manual'
export type SkillActivationScope = 'turn' | 'run' | 'thread'
export type SkillToolScope = 'union' | 'intersect'
export type SkillContextBudgetStrategy = 'fixed' | 'proportional' | 'opportunistic'
export type SkillSource = 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
export type ToolSource = 'runtime' | 'local' | 'plugin' | 'mcp'
export type PackSource = 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
export type ApprovalMode = 'never' | 'always' | 'on_write'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema7
  outputSchema?: JSONSchema7
  permission: string
  risk: ToolRiskLevel
  projectScoped: boolean
  defaults: {
    grant: 'allow' | 'deny'
    approval: ApprovalMode
    timeoutMs?: number
  }
  execution?: ToolExecutionMetadata
  source: ToolSource
  capability?: string
  pluginId?: string
  mcpServerId?: string
  errorCodes?: string[]
  availability?: ToolAvailability
  allowedRunRoles?: Array<'planner' | 'worker'>
  requiresSkills?: string[]
}

export type ToolAvailability =
  | { state: 'active' }
  | { state: 'inactive'; reason: 'pack_not_installed' | 'pack_disabled' }
  | { state: 'unavailable'; reason: 'plugin_load_failed' | 'mcp_server_down'; lastError?: string }
  | { state: 'deprecated'; supersededBy?: string }

export type SkillTrigger =
  | { kind: 'keyword'; any: string[] }
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'intent'; id: string }
  | { kind: 'context'; selector: ContextSelector }
  | { kind: 'always' }

export interface ContextSelector {
  route?: string[]
  selectedKind?: DraftKind[]
  selectedScope?: DraftScope[]
  draftStatus?: ('proposed' | 'confirmed' | 'superseded')[]
  hasProductionId?: boolean
  hasProjectId?: boolean
  custom?: Record<string, string | string[] | boolean>
}

export interface SkillDefinitionBase {
  id: string
  version: string
  name: string
  description: string
  priority: number
  enabled: boolean
  instructionTemplate: string
  loadMode?: SkillLoadMode
  source?: SkillSource
  sourcePath?: string
  tags?: string[]
  aliases?: string[]
  useWhen?: string[]
  dependencies?: string[]
  conflicts?: string[]
  tokenEstimate?: number
  contextBudget?: {
    maxChars?: number
    reserveRatio?: number
    strategy?: SkillContextBudgetStrategy
  }
  activationScope?: SkillActivationScope
  triggers?: SkillTrigger[]
  toolGrants?: string[]
  toolScope?: SkillToolScope
  schemaRefs?: string[]
  outputContract?: string
  metadata?: Record<string, JSONValue>
}

export type SkillDefinition = SkillDefinitionBase

export interface CapabilityPack {
  id: string
  version: string
  name: string
  description?: string
  source: PackSource
  resources?: {
    skills?: string[]
    tools?: string[]
  }
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
  capabilities?: {
    requiresPermissions?: string[]
    requiresFeatureFlags?: string[]
  }
}

export interface AgentConfigFile {
  schema: 'movscript.agent.config_file.v1'
  id: string
  version: string
  name: string
  description?: string
  enabledPackIds: string[]
  skillIds: string[]
  approvalDefaults?: Partial<Record<ToolRiskLevel | 'default', ApprovalMode>>
  toolGrants: ToolGrant[]
  model?: ModelBinding
  limits?: ConfigFileLimits
  metadata?: Record<string, JSONValue>
  resolvedFrom?: ConfigFileResolutionTrace
}

export interface ToolGrant {
  name: string
  mode: 'allow' | 'deny'
  approval?: ApprovalMode
}

export interface ConfigFileLimits {
  maxToolCalls?: number
  maxIterations?: number
  executionMode?: 'compact' | 'standard' | 'deep'
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

export interface ModelBinding {
  provider: 'anthropic' | 'openai' | 'azure' | 'custom'
  modelId: string
  platformModelId?: string
  routes?: Array<{
    when: { task?: string[]; risk?: ToolRiskLevel[]; longContext?: boolean }
    use: { provider: string; modelId: string; platformModelId?: string }
  }>
}

export interface ConfigFileResolutionTrace {
  layers: Array<{ source: 'base' | 'org' | 'user'; id: string; version: string }>
  resolvedAt: string
}

export interface UIContext {
  route?: string
  selectedKind?: DraftKind
  selectedScope?: DraftScope
  selectedId?: string | number
  draftStatus?: 'proposed' | 'confirmed' | 'superseded'
  projectId?: number
  productionId?: number
  [k: string]: unknown
}

export interface RuntimeContext {
  configFile: AgentConfigFile
  message: string
  intents: string[]
  uiContext: UIContext
  conversation: {
    turnCount: number
    lastToolCalls: Array<{ name: string; success: boolean }>
    recentErrors: Array<{ code: string; toolName?: string }>
  }
  catalogVersion: string
}

export interface CatalogRegistry {
  version: string
  schemas: Map<string, DraftSchemaDefinition>
  tools: Map<string, ToolDefinition>
  skills: Map<string, SkillDefinition>
  packs: Map<string, CapabilityPack>
  configFiles: Map<string, AgentConfigFile>
}

export interface CatalogIssue {
  level: 'error' | 'warning'
  code: string
  message: string
  resourceId?: string
}

import type { DraftKind, DraftScope, DraftSchemaDefinition, JSONSchema7 } from '@movscript/draft-schemas'
import type { JSONValue } from '../types.js'
import type { ToolRiskLevel } from '../tools/toolRegistry.js'
import type { KnowledgeCollection } from '../knowledge/types.js'

export type SkillKind = 'persona' | 'workflow' | 'policy' | 'expertise'
export type ToolSource = 'runtime' | 'plugin' | 'mcp'
export type PackSource = 'builtin' | 'plugin' | 'mcp'
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
  source: ToolSource
  capability?: string
  pluginId?: string
  mcpServerId?: string
  errorCodes?: string[]
  availability?: ToolAvailability
  allowedRunRoles?: Array<'planner' | 'worker'>
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
  kind: SkillKind
  version: string
  name: string
  description: string
  priority: number
  enabled: boolean
  instructionTemplate: string
  toolRefs?: string[]
  schemaRefs?: string[]
  outputContract?: string
  metadata?: Record<string, JSONValue>
}

export type PersonaSkill = SkillDefinitionBase & { kind: 'persona' }
export type WorkflowSkill = SkillDefinitionBase & {
  kind: 'workflow'
  triggers: SkillTrigger[]
  toolRefs: string[]
  toolScope?: 'union' | 'intersect'
}
export type PolicyScope =
  | 'global'
  | { workflow?: string[]; risk?: ToolRiskLevel[] }
export type PolicySkill = SkillDefinitionBase & {
  kind: 'policy'
  scope?: PolicyScope
}
export type ExpertiseSkill = SkillDefinitionBase & { kind: 'expertise' }
export type SkillDefinition = PersonaSkill | WorkflowSkill | PolicySkill | ExpertiseSkill

export interface CapabilityPack {
  id: string
  version: string
  name: string
  description?: string
  source: PackSource
  resources?: {
    skills?: string[]
    tools?: string[]
    knowledge?: string[]
  }
  knowledge?: string[]
  schemas: string[]
  tools: string[]
  skills: string[]
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

export interface AgentProfile {
  schema: 'movscript.agent.profile.v1'
  id: string
  version: string
  name: string
  description?: string
  enabledPacks: string[]
  persona: string | null
  enabledWorkflows: string[]
  enabledPolicies: string[]
  toolGrants: ToolGrant[]
  model?: ModelBinding
  limits?: ProfileLimits
  metadata?: Record<string, JSONValue>
  resolvedFrom?: ProfileResolutionTrace
}

export interface ToolGrant {
  name: string
  mode: 'allow' | 'deny'
  approval?: ApprovalMode
}

export interface ProfileLimits {
  maxActiveWorkflows?: number
  systemPromptCharLimit?: number
  maxRetrievedContextChars?: number
  maxKnowledgeCharsPerRun?: number
  maxKnowledgeChunksPerRun?: number
  maxHistoryMessages?: number
  maxThreadSummaryChars?: number
}

export interface ModelBinding {
  provider: 'anthropic' | 'openai' | 'azure' | 'custom'
  modelId: string
  platformModelId?: string
  routes?: Array<{
    when: { workflow?: string[]; risk?: ToolRiskLevel[]; longContext?: boolean }
    use: { provider: string; modelId: string; platformModelId?: string }
  }>
}

export interface ProfileResolutionTrace {
  layers: Array<{ source: 'default' | 'org' | 'user'; id: string; version: string }>
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
  profile: AgentProfile
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
  profiles: Map<string, AgentProfile>
  knowledge: Map<string, KnowledgeCollection>
}

export interface CatalogIssue {
  level: 'error' | 'warning'
  code: string
  message: string
  resourceId?: string
}

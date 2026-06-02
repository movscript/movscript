import type { JSONValue } from '../../../shared/protocol/types.js'
import type { AgentRunRole } from '../../../state/shared/types.js'
import { isJSONValue, isRecord } from '../../../shared/json/jsonValue.js'

export type ToolRiskLevel = 'read' | 'workspace' | 'write' | 'generate' | 'destructive' | 'ui'

export interface ToolDefaults {
  grant: 'allow' | 'deny'
  approval: 'never' | 'always' | 'on_write'
  timeoutMs?: number
}

export type ToolInterruptBehavior = 'cancel' | 'block'
export type ToolResultRefStrategy = 'inline' | 'summary_ref' | 'auto'

export interface ToolExecutionMetadata {
  readOnly: boolean
  destructive: boolean
  concurrencySafe: boolean
  interruptBehavior: ToolInterruptBehavior
  maxResultSizeChars?: number
  resultRefStrategy?: ToolResultRefStrategy
}

export interface RegisteredTool {
  name: string
  description: string
  permission: string
  risk: ToolRiskLevel
  source?: 'runtime' | 'local' | 'plugin' | 'mcp'
  category?: string
  categories?: string[]
  inputSchema?: JSONValue
  outputSchema?: JSONValue
  projectScoped: boolean
  requiresApprovalByDefault: boolean
  defaults?: ToolDefaults
  execution?: ToolExecutionMetadata
  capability?: string
  pluginId?: string
  mcpServerId?: string
  errorCodes?: string[]
  allowedRunRoles?: AgentRunRole[]
  requiresSkills?: string[]
}

export interface ToolRegistry {
  get(name: string): RegisteredTool | undefined
  list(): RegisteredTool[]
}

export class StaticToolRegistry implements ToolRegistry {
  private readonly tools: Map<string, RegisteredTool>

  constructor(tools: RegisteredTool[]) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]))
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values())
  }
}

export function mergeRegisteredTools(base: RegisteredTool[], tools: RegisteredTool[]): RegisteredTool[] {
  const byName = new Map<string, RegisteredTool>()
  for (const tool of base) byName.set(tool.name, tool)
  for (const tool of tools) byName.set(tool.name, tool)
  return Array.from(byName.values())
}

export function normalizeRegisteredTool(input: unknown): RegisteredTool | undefined {
  if (!isRecord(input)) return undefined
  const name = nonEmptyString(input.name)
  const description = nonEmptyString(input.description)
  const permission = nonEmptyString(input.permission)
  const risk = normalizeRisk(input.risk)
  if (!name || !description || !permission || !risk) return undefined
  return {
    name,
    description,
    permission,
    risk,
    ...(input.source === 'runtime' || input.source === 'local' || input.source === 'plugin' || input.source === 'mcp' ? { source: input.source } : {}),
    ...(nonEmptyString(input.category) ? { category: nonEmptyString(input.category) } : {}),
    ...(stringArray(input.categories).length > 0 ? { categories: stringArray(input.categories) } : {}),
    ...(isJSONValue(input.inputSchema) ? { inputSchema: input.inputSchema } : {}),
    ...(isJSONValue(input.outputSchema) ? { outputSchema: input.outputSchema } : {}),
    projectScoped: input.projectScoped === true,
    requiresApprovalByDefault: input.requiresApprovalByDefault === true,
    ...(normalizeToolDefaults(input.defaults) ? { defaults: normalizeToolDefaults(input.defaults) } : {}),
    execution: normalizeToolExecutionMetadata(input.execution, risk),
    ...(nonEmptyString(input.capability) ? { capability: nonEmptyString(input.capability) } : {}),
    ...(nonEmptyString(input.pluginId) ? { pluginId: nonEmptyString(input.pluginId) } : {}),
    ...(nonEmptyString(input.mcpServerId) ? { mcpServerId: nonEmptyString(input.mcpServerId) } : {}),
    ...(stringArray(input.errorCodes).length > 0 ? { errorCodes: stringArray(input.errorCodes) } : {}),
    ...(runRoleArray(input.allowedRunRoles).length > 0 ? { allowedRunRoles: runRoleArray(input.allowedRunRoles) } : {}),
    ...(stringArray(input.requiresSkills).length > 0 ? { requiresSkills: stringArray(input.requiresSkills) } : {}),
  }
}

export const DEFAULT_TOOL_REGISTRY = new StaticToolRegistry([
  {
    name: 'core_catalog_inspect',
    description: 'Inspect the current run agent catalog snapshot, including config file, enabled packs, skills, tools, and availability summary.',
    permission: 'agent.catalog.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'core_update_plan',
    description: 'Create or update the current thread execution plan and append an immutable revision snapshot.',
    permission: 'agent.plan.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'core_work_start',
    description: 'Start a runtime work item such as a generation job or subagent run and return immediately with a work handle.',
    permission: 'agent.work.write',
    risk: 'generate',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'core_work_get',
    description: 'Read the latest state for one runtime work item.',
    permission: 'agent.work.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'core_work_list',
    description: 'List runtime work items for the current run, another run, or all runs.',
    permission: 'agent.work.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'core_work_wait',
    description: 'Observe runtime work state with an optional short timeout. The work may continue in the background after this call returns.',
    permission: 'agent.work.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'core_work_cancel',
    description: 'Cancel a cancellable runtime work item.',
    permission: 'agent.work.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
])

function normalizeRisk(value: unknown): ToolRiskLevel | undefined {
  return value === 'read'
    || value === 'workspace'
    || value === 'write'
    || value === 'generate'
    || value === 'destructive'
    || value === 'ui'
    ? value
    : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())))
}

function runRoleArray(value: unknown): AgentRunRole[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is AgentRunRole => item === 'planner' || item === 'worker')))
}

function normalizeToolDefaults(value: unknown): ToolDefaults | undefined {
  if (!isRecord(value)) return undefined
  const grant = value.grant === 'deny' ? 'deny' : value.grant === 'allow' ? 'allow' : undefined
  const approval = value.approval === 'never' || value.approval === 'always' || value.approval === 'on_write'
    ? value.approval
    : undefined
  if (!grant || !approval) return undefined
  return {
    grant,
    approval,
    ...(typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs) ? { timeoutMs: value.timeoutMs } : {}),
  }
}

export function normalizeToolExecutionMetadata(value: unknown, risk: ToolRiskLevel): ToolExecutionMetadata {
  const defaults = defaultToolExecutionMetadata(risk)
  if (!isRecord(value)) return defaults
  return {
    readOnly: typeof value.readOnly === 'boolean' ? value.readOnly : defaults.readOnly,
    destructive: typeof value.destructive === 'boolean' ? value.destructive : defaults.destructive,
    concurrencySafe: typeof value.concurrencySafe === 'boolean' ? value.concurrencySafe : defaults.concurrencySafe,
    interruptBehavior: value.interruptBehavior === 'block' || value.interruptBehavior === 'cancel'
      ? value.interruptBehavior
      : defaults.interruptBehavior,
    ...(positiveFiniteNumber(value.maxResultSizeChars) ? { maxResultSizeChars: positiveFiniteNumber(value.maxResultSizeChars) } : {}),
    ...(value.resultRefStrategy === 'inline' || value.resultRefStrategy === 'summary_ref' || value.resultRefStrategy === 'auto'
      ? { resultRefStrategy: value.resultRefStrategy }
      : {}),
  }
}

function defaultToolExecutionMetadata(risk: ToolRiskLevel): ToolExecutionMetadata {
  const readOnly = risk === 'read'
  const destructive = risk === 'destructive'
  return {
    readOnly,
    destructive,
    concurrencySafe: readOnly,
    interruptBehavior: readOnly ? 'cancel' : 'block',
    resultRefStrategy: 'auto',
  }
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

import type { JSONValue } from '../types.js'
import type { AgentRunRole } from '../state/types.js'

export type ToolRiskLevel = 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'

export interface ToolDefaults {
  grant: 'allow' | 'deny'
  approval: 'never' | 'always' | 'on_write'
  timeoutMs?: number
}

export interface RegisteredTool {
  name: string
  description: string
  permission: string
  risk: ToolRiskLevel
  source?: 'runtime' | 'plugin' | 'mcp'
  category?: string
  categories?: string[]
  inputSchema?: JSONValue
  projectScoped: boolean
  requiresApprovalByDefault: boolean
  defaults?: ToolDefaults
  capability?: string
  pluginId?: string
  mcpServerId?: string
  errorCodes?: string[]
  allowedRunRoles?: AgentRunRole[]
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
    ...(input.source === 'runtime' || input.source === 'plugin' || input.source === 'mcp' ? { source: input.source } : {}),
    ...(nonEmptyString(input.category) ? { category: nonEmptyString(input.category) } : {}),
    ...(stringArray(input.categories).length > 0 ? { categories: stringArray(input.categories) } : {}),
    ...(isJSONValue(input.inputSchema) ? { inputSchema: input.inputSchema } : {}),
    projectScoped: input.projectScoped === true,
    requiresApprovalByDefault: input.requiresApprovalByDefault === true,
    ...(normalizeToolDefaults(input.defaults) ? { defaults: normalizeToolDefaults(input.defaults) } : {}),
    ...(nonEmptyString(input.capability) ? { capability: nonEmptyString(input.capability) } : {}),
    ...(nonEmptyString(input.pluginId) ? { pluginId: nonEmptyString(input.pluginId) } : {}),
    ...(nonEmptyString(input.mcpServerId) ? { mcpServerId: nonEmptyString(input.mcpServerId) } : {}),
    ...(stringArray(input.errorCodes).length > 0 ? { errorCodes: stringArray(input.errorCodes) } : {}),
    ...(runRoleArray(input.allowedRunRoles).length > 0 ? { allowedRunRoles: runRoleArray(input.allowedRunRoles) } : {}),
  }
}

export const DEFAULT_TOOL_REGISTRY = new StaticToolRegistry([
  {
    name: 'movscript_reload_agent_catalog',
    description: 'Reload local agent skills, tools, packs, and profiles from configured catalog directories.',
    permission: 'agent.catalog.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_spawn_subagent',
    description: 'Planner-only tool. Create or dispatch one or more worker subagent runs for plan tasks that need separate execution.',
    permission: 'agent.subagent.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'movscript_list_subagents',
    description: 'Planner-only tool. List worker subagents and task status for the current plan.',
    permission: 'agent.subagent.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'movscript_wait_subagent',
    description: 'Planner-only tool. Check whether a worker subagent, task, or plan has finished, returning the latest structured snapshot.',
    permission: 'agent.subagent.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
  {
    name: 'movscript_cancel_subagent',
    description: 'Planner-only tool. Cancel a child worker subagent subtree owned by the current planner run.',
    permission: 'agent.subagent.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
    allowedRunRoles: ['planner'],
  },
])

function normalizeRisk(value: unknown): ToolRiskLevel | undefined {
  return value === 'read'
    || value === 'draft'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

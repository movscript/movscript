export type ToolRiskLevel = 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'

export interface RegisteredTool {
  name: string
  description: string
  permission: string
  risk: ToolRiskLevel
  source?: 'runtime' | 'plugin'
  category?: string
  categories?: string[]
  appliesWhen?: string
  projectScoped: boolean
  requiresApprovalByDefault: boolean
}

export interface RegisteredToolBundle {
  tools: RegisteredTool[]
  grants: Array<{
    name: string
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
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
    source: input.source === 'runtime' ? 'runtime' : 'plugin',
    ...(nonEmptyString(input.category) ? { category: nonEmptyString(input.category) } : {}),
    ...(stringArray(input.categories).length > 0 ? { categories: stringArray(input.categories) } : {}),
    ...(nonEmptyString(input.appliesWhen) ? { appliesWhen: nonEmptyString(input.appliesWhen) } : {}),
    projectScoped: input.projectScoped === true,
    requiresApprovalByDefault: input.requiresApprovalByDefault === true,
  }
}

export const DEFAULT_TOOL_REGISTRY = new StaticToolRegistry([])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

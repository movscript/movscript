export type ToolRiskLevel = 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'

export interface RegisteredTool {
  name: string
  description: string
  permission: string
  risk: ToolRiskLevel
  source?: 'runtime' | 'plugin'
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
    source: 'plugin',
    projectScoped: input.projectScoped === true,
    requiresApprovalByDefault: input.requiresApprovalByDefault === true,
  }
}

export const DEFAULT_TOOL_REGISTRY = new StaticToolRegistry([
  {
    name: 'movscript.search_entities',
    description: 'Search project entities by keyword.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript.read_entity',
    description: 'Read a single project entity.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript.create_draft',
    description: 'Create a local draft artifact without writing project entities.',
    permission: 'draft.write',
    risk: 'draft',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript.list_drafts',
    description: 'List local draft artifacts.',
    permission: 'draft.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript.open_entity',
    description: 'Navigate the MovScript UI to an entity page.',
    permission: 'ui.navigate',
    risk: 'ui',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript.apply_draft',
    description: 'Reserved write tool for applying an approved draft to project data.',
    permission: 'project.write',
    risk: 'write',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript.create_generation_job',
    description: 'Reserved cost-bearing tool for starting an AI generation job.',
    permission: 'generation.create',
    risk: 'generate',
    projectScoped: true,
    requiresApprovalByDefault: true,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

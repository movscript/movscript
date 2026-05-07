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
    source: input.source === 'runtime' ? 'runtime' : 'plugin',
    projectScoped: input.projectScoped === true,
    requiresApprovalByDefault: input.requiresApprovalByDefault === true,
  }
}

export const DEFAULT_TOOL_REGISTRY = new StaticToolRegistry([
  {
    name: 'movscript_search_entities',
    description: 'Search project entities by keyword.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_read_entity',
    description: 'Read a single project entity.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_read_project_structure',
    description: 'Read compact project structure for scripts, creative references, semantic production entities, asset slots, and pipeline nodes.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_list_projects',
    description: 'List all visible projects as Markdown-friendly project summaries.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_create_project',
    description: 'Create a formal MovScript project after user approval.',
    permission: 'project.write',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_create_draft',
    description: 'Create a local draft artifact without writing project entities.',
    permission: 'draft.write',
    risk: 'draft',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_get_draft',
    description: 'Read one local draft artifact by id.',
    permission: 'draft.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_list_drafts',
    description: 'List local draft artifacts.',
    permission: 'draft.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_update_draft',
    description: 'Update local draft title, content, target, status, or metadata without writing formal project entities.',
    permission: 'draft.write',
    risk: 'draft',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_patch_draft',
    description: 'Apply JSON Pointer patch operations to a JSON draft content field without writing formal project entities.',
    permission: 'draft.write',
    risk: 'draft',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_validate_draft',
    description: 'Validate one local draft artifact and return structured issues for UI review.',
    permission: 'draft.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_search_memories',
    description: 'Search local agent memories by query, scope, kind, project, or thread. Use this when older preferences, decisions, warnings, entity references, or draft notes may matter.',
    permission: 'memory.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_request_user_input',
    description: 'Pause the agent run and ask the user for missing context, a choice, confirmation, or free-form input before continuing.',
    permission: 'agent.input',
    risk: 'ui',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_open_entity',
    description: 'Navigate the MovScript UI to an entity page.',
    permission: 'ui.navigate',
    risk: 'ui',
    projectScoped: false,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_list_productions',
    description: 'List productions for the current project so the agent can choose the correct production before orchestration.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_read_production_context',
    description: 'Read full production orchestration context before generating production candidates.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_check_entity_conflicts',
    description: 'Check proposed production candidates against existing entities before creating a local client-review proposal draft.',
    permission: 'project.read',
    risk: 'read',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_propose_production_entities',
    description: 'Create a local client-review production proposal draft. This does not write backend project entities.',
    permission: 'draft.write',
    risk: 'draft',
    projectScoped: true,
    requiresApprovalByDefault: false,
  },
  {
    name: 'movscript_apply_draft',
    description: 'Apply an approved local draft through the explicit write flow and produce before/after review metadata.',
    permission: 'project.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_create_script',
    description: 'Create a formal script entity in the current project after user approval.',
    permission: 'project.write',
    risk: 'write',
    source: 'runtime',
    projectScoped: true,
    requiresApprovalByDefault: true,
  },
  {
    name: 'movscript_create_generation_job',
    description: 'Create an AI image or video generation job through MovScript and return the generated output resource for review.',
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

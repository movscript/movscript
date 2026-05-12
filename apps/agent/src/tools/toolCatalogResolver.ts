import type { CatalogRegistry, RuntimeContext, ToolDefinition, WorkflowSkill } from '../catalog/types.js'
import { stricterApproval } from '../profiles/profileMerge.js'

const RESERVED_ALWAYS_VISIBLE = new Set(['movscript_request_user_input'])

export interface VisibleToolCatalog {
  available: ToolDefinition[]
  blocked: Array<{ name: string; reason: string }>
}

export function resolveVisibleTools(input: {
  registry: CatalogRegistry
  ctx: RuntimeContext
  activeWorkflows: WorkflowSkill[]
}): VisibleToolCatalog {
  const packTools = new Set(input.ctx.profile.enabledPacks.flatMap((id) => input.registry.packs.get(id)?.tools ?? []))
  const allowed = new Map(input.ctx.profile.toolGrants.filter((grant) => grant.mode === 'allow').map((grant) => [grant.name, grant]))
  const scoped = scopeFilter(input.activeWorkflows, allowed)
  const available: ToolDefinition[] = []
  const blocked: VisibleToolCatalog['blocked'] = []

  for (const [name, tool] of input.registry.tools) {
    if (!packTools.has(name)) {
      blocked.push({ name, reason: 'pack_not_enabled' })
      continue
    }
    const grant = allowed.get(name)
    if (!grant) {
      blocked.push({ name, reason: 'not_granted' })
      continue
    }
    if (!RESERVED_ALWAYS_VISIBLE.has(name) && !scoped.has(name)) {
      blocked.push({ name, reason: 'workflow_scope' })
      continue
    }
    if (tool.availability && tool.availability.state !== 'active') {
      blocked.push({ name, reason: tool.availability.state })
      continue
    }
    available.push({
      ...tool,
      defaults: {
        ...tool.defaults,
        approval: stricterApproval(tool.defaults.approval, grant.approval) ?? tool.defaults.approval,
      },
    })
  }
  return { available, blocked }
}

function scopeFilter(workflows: WorkflowSkill[], allowed: Map<string, unknown>): Set<string> {
  if (workflows.length === 0) return new Set(allowed.keys())
  const scoped = new Set<string>()
  for (const workflow of workflows) {
    if (workflow.toolScope === 'union') {
      for (const name of allowed.keys()) scoped.add(name)
      continue
    }
    for (const ref of workflow.toolRefs) scoped.add(ref.startsWith('tool://') ? ref.slice('tool://'.length) : ref)
  }
  for (const name of RESERVED_ALWAYS_VISIBLE) if (allowed.has(name)) scoped.add(name)
  return scoped
}

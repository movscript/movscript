import type { CatalogRegistry, RuntimeContext, SkillDefinition, ToolDefinition } from '../../../../catalog/registry/shared/types.js'
import { stricterApproval } from '../../../../configFiles/merge/configFileMerge.js'

const RESERVED_ALWAYS_VISIBLE = new Set([
  'core_user_input_request',
  'core_update_plan',
])

export interface VisibleToolCatalog {
  available: ToolDefinition[]
  blocked: Array<{ name: string; reason: string }>
}

export function resolveVisibleTools(input: {
  registry: CatalogRegistry
  ctx: RuntimeContext
  activeSkills: SkillDefinition[]
}): VisibleToolCatalog {
  const packTools = new Set(input.ctx.configFile.enabledPackIds.flatMap((id) => input.registry.packs.get(id)?.tools ?? []))
  const allowed = new Map(input.ctx.configFile.toolGrants.filter((grant) => grant.mode === 'allow').map((grant) => [grant.name, grant]))
  const scoped = scopeFilter(input.activeSkills, allowed)
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
      blocked.push({ name, reason: 'skill_scope' })
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

function scopeFilter(skills: SkillDefinition[], allowed: Map<string, unknown>): Set<string> {
  if (skills.length === 0) return new Set(allowed.keys())
  const scoped = new Set<string>()
  for (const skill of skills) {
    if (skill.toolScope === 'union') {
      for (const name of allowed.keys()) scoped.add(name)
      continue
    }
    for (const ref of skill.toolGrants ?? []) {
      const name = ref.trim()
      if (name) scoped.add(name)
    }
  }
  for (const name of RESERVED_ALWAYS_VISIBLE) if (allowed.has(name)) scoped.add(name)
  return scoped
}

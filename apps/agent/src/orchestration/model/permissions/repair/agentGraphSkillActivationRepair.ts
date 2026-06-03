import type { ResolvedAgentSkill, ResolvedToolCatalog, ToolCall } from '../../../../state/shared/types.js'
import type { BlockedToolCall } from '../../../../tools/permissions/evaluation/toolPermissions.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'

export function buildSkillActivationRepairCalls(blockedToolCalls: BlockedToolCall[], input: {
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  registry: ToolRegistry
  makeId: AgentGraphMakeId
}): ToolCall[] {
  const skillTool = input.capabilities.byName.core_skill_update
  if (!skillTool?.available) return []

  const activeSkillIds = new Set(input.skills.map((skill) => skill.id))
  const load: string[] = []
  const reasons: string[] = []
  for (const blocked of blockedToolCalls) {
    if (blocked.reason !== 'not_granted' && blocked.reason !== 'unknown_tool' && blocked.reason !== 'skill_scope') continue
    const declaredSkillIds = blocked.tool?.requiresSkills ?? input.registry.get(blocked.call.name)?.requiresSkills ?? []
    for (const skillId of declaredSkillIds) {
      if (activeSkillIds.has(skillId) || load.includes(skillId)) continue
      load.push(skillId)
      reasons.push(`工具 ${blocked.call.name} 需要加载 ${skillId}。`)
    }
  }

  if (load.length === 0) return []
  return [{
    id: input.makeId('call'),
    name: 'core_skill_update',
    args: {
      load,
      reason: Array.from(new Set(reasons)).join(' '),
    },
  }]
}

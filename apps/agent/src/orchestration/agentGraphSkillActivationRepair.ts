import type { ResolvedAgentSkill, ResolvedToolCatalog, ToolCall } from '../state/types.js'
import type { BlockedToolCall } from '../tools/toolPolicy.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentGraphMakeId } from './agentGraphInputRequests.js'

const TOOL_SKILL_ACTIVATION_REPAIRS: Record<string, { skillId: string; reason: string }> = {
  movscript_script_locate: {
    skillId: 'movscript.workflow.script_reading',
    reason: '读取项目剧本需要加载剧本读取 workflow。',
  },
}

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
    if (blocked.reason !== 'not_granted' && blocked.reason !== 'unknown_tool' && blocked.reason !== 'workflow_scope') continue
    const declaredSkillIds = blocked.tool?.requiresSkills ?? input.registry.get(blocked.call.name)?.requiresSkills ?? []
    for (const skillId of declaredSkillIds) {
      if (activeSkillIds.has(skillId) || load.includes(skillId)) continue
      load.push(skillId)
      reasons.push(`工具 ${blocked.call.name} 需要加载 ${skillId}。`)
    }
    const repair = TOOL_SKILL_ACTIVATION_REPAIRS[blocked.call.name]
    if (!repair || activeSkillIds.has(repair.skillId) || load.includes(repair.skillId)) continue
    load.push(repair.skillId)
    reasons.push(repair.reason)
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

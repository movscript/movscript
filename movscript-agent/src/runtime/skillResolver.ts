import type { AgentManifest } from './agentManifest.js'
import type { ResolvedAgentSkill } from './types.js'

export function resolveAgentSkills(manifest: AgentManifest, message = ''): ResolvedAgentSkill[] {
  return manifest.skills
    .filter((skill) => skill.enabled !== false)
    .map((skill, index) => {
      const applies = skill.appliesWhen ? messageMatches(message, skill.appliesWhen) : true
      return {
        ...skill,
        enabled: applies,
        resolvedPriority: typeof skill.priority === 'number' ? skill.priority : index,
        activationReason: skill.appliesWhen ? 'applies_when' : 'manifest',
        compiledInstruction: compileSkillInstruction(skill),
        warnings: applies ? [] : [`skill ${skill.id} did not match appliesWhen`],
      } satisfies ResolvedAgentSkill
    })
    .filter((skill) => skill.enabled)
    .sort((a, b) => b.resolvedPriority - a.resolvedPriority)
}

function compileSkillInstruction(skill: AgentManifest['skills'][number]): string {
  return [
    skill.instruction || skill.description,
    skill.outputContract ? `输出约束：${skill.outputContract}` : '',
    skill.toolHints && skill.toolHints.length > 0 ? `推荐工具：${skill.toolHints.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

function messageMatches(message: string, appliesWhen: string): boolean {
  const normalized = message.toLowerCase()
  return appliesWhen
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((item) => normalized.includes(item))
}

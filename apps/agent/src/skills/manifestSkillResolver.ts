import type { AgentManifest } from '../catalog/agentManifest.js'
import type { ResolvedAgentSkill } from '../state/types.js'

export function resolveAgentSkills(
  manifest: AgentManifest,
  _message = '',
  skillCatalog: AgentManifest['skills'] = [],
): ResolvedAgentSkill[] {
  const catalogById = new Map(skillCatalog.map((skill) => [skill.id, skill]))
  return manifest.skills
    .filter((skill) => skill.enabled !== false)
    .map((manifestSkill, index) => {
      const catalogSkill = catalogById.get(manifestSkill.id)
      const skill = catalogSkill
        ? {
          ...catalogSkill,
          ...manifestSkill,
          metadata: { ...(catalogSkill.metadata ?? {}), ...(manifestSkill.metadata ?? {}) },
          instruction: manifestSkill.instruction || catalogSkill.instruction,
          description: manifestSkill.description || catalogSkill.description,
        }
        : manifestSkill
      return {
        ...skill,
        enabled: true,
        resolvedPriority: typeof skill.priority === 'number' ? skill.priority : index,
        activationReason: 'manifest',
        compiledInstruction: compileSkillInstruction(skill),
        warnings: [],
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

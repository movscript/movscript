import type { ResolvedAgentSkill, ResolvedToolCatalog } from '../../../../state/shared/types.js'
import type { PromptFragmentProvider, SkillDiscoveryItem, SkillDiscoverySummary } from '../promptFragmentProvider.js'

export const skillPromptProviders: readonly PromptFragmentProvider[] = [
  {
    id: 'skills.discovery',
    collect: (input) => {
      const skillDiscoveryText = renderSkillDiscoveryText(input.skillDiscovery, input.skills, input.tools)
      return skillDiscoveryText ? [{
        id: 'skills.discovery',
        kind: 'skill',
        title: 'Skill Discovery',
        content: skillDiscoveryText,
      }] : []
    },
  },
  {
    id: 'skills.activated',
    collect: (input) => orderedActivatedSkills(input.skills).map((skill) => ({
      id: `skill.${skill.id}`,
      kind: 'skill',
      title: skill.name,
      content: skill.compiledInstruction || skill.description,
    })),
  },
]

function orderedActivatedSkills(skills: ResolvedAgentSkill[]): ResolvedAgentSkill[] {
  return [...skills].sort((a, b) => b.resolvedPriority - a.resolvedPriority || a.id.localeCompare(b.id))
}

function renderSkillDiscoveryText(
  summary: SkillDiscoverySummary | undefined,
  activeSkills: ResolvedAgentSkill[],
  tools: ResolvedToolCatalog,
): string | undefined {
  const activeIds = new Set(activeSkills.map((skill) => skill.id))
  const catalogToolAvailable = tools.available.some((tool) => tool.name === 'core_catalog_inspect')
  const activeIndex = activeSkills.map((skill): SkillDiscoveryItem => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    active: true,
    ...(Array.isArray(skill.metadata?.conflicts) ? { conflicts: skill.metadata.conflicts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) } : {}),
  }))
  const items = summary?.availableSkills?.length
    ? summary.availableSkills.map((skill) => ({ ...skill, active: skill.active || activeIds.has(skill.id) }))
    : catalogToolAvailable
      ? activeIndex
      : []
  if (items.length === 0 && !catalogToolAvailable) return undefined

  const active = items.filter((skill) => skill.active)
  const inactive = items.filter((skill) => !skill.active)
  const lines = [
    'Skill loading is automatic for the current run. Skills can be enabled by the current config file, default activation, trigger hints, manual requests, or dependencies.',
    'Runtime behavior comes from activation, dependencies, tool grants, priorities, and the skill instructions themselves.',
    'Use activated skill instructions as behavior rules for this run. Do not claim that a skill is active unless it appears in the active list below or after inspecting the catalog.',
    'For style skills such as directors, cinematography, acting, editing, or writing voices: if the user prompt, project guidance, active focus, or retrieved context clearly names one style, load that one. If several matching styles conflict and the choice is ambiguous, ask the user to choose with core_user_input_request before loading a style skill.',
    catalogToolAvailable
      ? 'When the user asks for a specialist, a skill, an expert mode, or a task seems to need a skill that is not active, call core_catalog_inspect with view="summary" first to discover ids, then call a detail view with id when needed. Detail views view="pack", view="skill", view="tool", and view="config" require id. Set includeInstruction=true only when the skill details are needed to perform the task.'
      : 'The catalog inspection tool is not available in this run; rely only on the active skills and the short enabled-skill index below.',
  ]
  if (summary) {
    const details = [
      summary.configFileId ? `configFile=${summary.configFileId}` : undefined,
      summary.configFileName ? `name=${summary.configFileName}` : undefined,
      summary.catalogVersion ? `catalog=${summary.catalogVersion}` : undefined,
      summary.enabledPackIds.length > 0 ? `packs=${summary.enabledPackIds.join(', ')}` : undefined,
    ].filter(Boolean).join('; ')
    if (details) lines.push('', `Current catalog scope: ${details}`)
  }
  lines.push('', 'Active skills this run:')
  lines.push(...(active.length > 0 ? active.slice(0, 12).map(renderSkillDiscoveryLine) : ['- none matched beyond the current config file defaults.']))
  if (inactive.length > 0) {
    lines.push('', 'Available skills to inspect:')
    lines.push(...inactive.slice(0, 16).map(renderSkillDiscoveryLine))
  }
  return lines.join('\n')
}

function renderSkillDiscoveryLine(skill: SkillDiscoveryItem): string {
  const details = [
    skill.active ? 'active=true' : undefined,
    skill.loadMode ? `load=${skill.loadMode}` : undefined,
    skill.tags && skill.tags.length > 0 ? `tags=${skill.tags.slice(0, 5).join('|')}` : undefined,
    skill.triggerHints && skill.triggerHints.length > 0 ? `triggers=${skill.triggerHints.slice(0, 5).join('|')}` : undefined,
    skill.useWhen && skill.useWhen.length > 0 ? `useWhen=${skill.useWhen.slice(0, 5).join('|')}` : undefined,
    skill.conflicts && skill.conflicts.length > 0 ? `conflicts=${skill.conflicts.slice(0, 5).join('|')}` : undefined,
  ].filter(Boolean).join('; ')
  const description = skill.description ? ` - ${truncateForPrompt(skill.description, 140)}` : ''
  return `- ${skill.id} (${skill.name}; ${details})${description}`
}

function truncateForPrompt(value: string, limit: number): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}...`
}

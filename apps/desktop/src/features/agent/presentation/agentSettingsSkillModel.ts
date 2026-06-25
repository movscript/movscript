import type { SkillConfigWorkspace } from '@movscript/core/agent'
import type {
  ProviderCatalogConfigFile,
  ProviderCatalogSkill,
} from '@movscript/agent-protocol'
import type { SkillConfigIssue } from '@/features/agent/application/agentSettingsReadiness'

export type SkillSourceKind = 'core' | 'plugin' | 'local' | 'team' | 'mcp' | 'catalog'
export const SKILL_SOURCE_FILTERS = ['all', 'core', 'plugin', 'local', 'team', 'mcp', 'catalog'] as const
export type SkillSourceFilter = (typeof SKILL_SOURCE_FILTERS)[number]

export function buildSkillStats(skills: ProviderCatalogSkill[]) {
  return {
    installed: skills.length,
    enabled: skills.filter((skill) => skill.enabled !== false).length,
    disabled: skills.filter((skill) => skill.enabled === false).length,
    core: skills.filter((skill) => skill.loadMode === 'core').length,
    onDemand: skills.filter((skill) => skill.loadMode === 'on_demand' || !skill.loadMode).length,
    manual: skills.filter((skill) => skill.loadMode === 'manual').length,
  }
}

export function filterSkills(
  skills: ProviderCatalogSkill[],
  filters: {
    search: string
    source: SkillSourceFilter
  },
): ProviderCatalogSkill[] {
  const query = filters.search.trim().toLowerCase()
  return skills
    .filter((skill) => filters.source === 'all' || skillSourceKind(skill) === filters.source)
    .filter((skill) => {
      if (!query) return true
      const searchableValues = [
        skill.id,
        skill.name,
        skill.description,
        skill.version,
        skill.enabled ? 'enabled' : 'disabled',
        skill.instruction,
        skill.instructionTemplate,
        skill.source,
        skill.outputContract,
        skillSourceKind(skill),
        ...(skill.tags ?? []),
        ...(skill.aliases ?? []),
        ...(skill.useWhen ?? []),
        ...(skill.dependencies ?? []),
        ...(skill.conflicts ?? []),
        ...(skill.toolGrants ?? []),
        ...(skill.schemaRefs ?? []),
        ...(skill.toolHints ?? []),
        ...(skill.runtime?.dependencyIds ?? []),
        ...(skill.runtime?.conflictIds ?? []),
        ...(skill.runtime?.toolGrantNames ?? []),
      ]
      return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
}

export function buildSkillConfigWorkspaces(
  skills: ProviderCatalogSkill[],
  configFile: ProviderCatalogConfigFile | null,
): SkillConfigWorkspace[] {
  const configSkillIds = new Set(configFile?.skillIds ?? [])
  return skills.map((skill) => ({
    id: skill.id,
    enabled: skill.loadMode === 'core' || (configFile ? configSkillIds.has(skill.id) : skill.enabled !== false),
  }))
}

export function buildSkillConfigChanges(
  workspaces: SkillConfigWorkspace[],
  baseline: SkillConfigWorkspace[],
): SkillConfigWorkspace[] {
  const baselineById = new Map(baseline.map((workspace) => [workspace.id, workspace]))
  return workspaces.flatMap((workspace) => {
    const before = baselineById.get(workspace.id)
    if (!before) return [workspace]
    const change: SkillConfigWorkspace = { id: workspace.id, enabled: workspace.enabled }
    let changed = false
    if (before.enabled !== workspace.enabled) {
      change.enabled = workspace.enabled
      changed = true
    }
    return changed ? [change] : []
  })
}

export function buildConfigFileSkillIds(workspaces: SkillConfigWorkspace[]): string[] {
  return workspaces.flatMap((workspace) => workspace.enabled ? [workspace.id] : [])
}

export function buildSkillConfigIssues(
  skills: ProviderCatalogSkill[],
  workspaces: SkillConfigWorkspace[],
  baseline: SkillConfigWorkspace[],
): SkillConfigIssue[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const enabledById = new Map(baseline.map((workspace) => [workspace.id, workspace.enabled]))
  for (const workspace of workspaces) enabledById.set(workspace.id, workspace.enabled)
  const baselineById = new Map(baseline.map((workspace) => [workspace.id, workspace.enabled]))
  const changedIds = workspaces
    .filter((workspace) => baselineById.get(workspace.id) !== workspace.enabled)
    .map((workspace) => workspace.id)
  const issues = new Map<string, SkillConfigIssue>()

  for (const id of changedIds) {
    const skill = skillById.get(id)
    if (!skill) continue
    const enabled = enabledById.get(id) !== false
    if (!enabled) {
      for (const candidate of skills) {
        if (enabledById.get(candidate.id) === false || !(candidate.dependencies ?? []).includes(id)) continue
        const key = `dependency:${candidate.id}:${id}`
        issues.set(key, { type: 'dependency', skillId: candidate.id, relatedSkillId: id })
      }
      continue
    }
    for (const dependencyId of skill.dependencies ?? []) {
      if (enabledById.get(dependencyId) === false || !skillById.has(dependencyId)) {
        const key = `dependency:${skill.id}:${dependencyId}`
        issues.set(key, { type: 'dependency', skillId: skill.id, relatedSkillId: dependencyId })
      }
    }
    for (const conflictId of skill.conflicts ?? []) {
      if (enabledById.get(conflictId) === false) continue
      const key = `conflict:${skill.id}:${conflictId}`
      issues.set(key, { type: 'conflict', skillId: skill.id, relatedSkillId: conflictId })
    }
    for (const candidate of skills) {
      if (candidate.id === skill.id || enabledById.get(candidate.id) === false || !(candidate.conflicts ?? []).includes(skill.id)) continue
      const key = `conflict:${skill.id}:${candidate.id}`
      issues.set(key, { type: 'conflict', skillId: skill.id, relatedSkillId: candidate.id })
    }
  }

  return Array.from(issues.values())
}

export function stringListSignature(values: string[]): string {
  return JSON.stringify([...new Set(values)].sort())
}

export function skillSourceKind(skill: ProviderCatalogSkill): SkillSourceKind {
  if (skill.loadMode === 'core') return 'core'
  const source = skill.source ?? (typeof skill.metadata?.source === 'string' ? skill.metadata.source : '')
  const pluginId = typeof skill.metadata?.pluginId === 'string' ? skill.metadata.pluginId : ''
  if (source === 'team') return 'team'
  if (source === 'mcp') return 'mcp'
  if (source === 'plugin' || pluginId) return 'plugin'
  if (skill.loadMode === 'manual' || source === 'local') return 'local'
  return 'catalog'
}

export function skillSourceLabel(skill: ProviderCatalogSkill, t: (key: string) => string): string {
  return t(`agents.settings.skillSources.${skillSourceKind(skill)}`)
}

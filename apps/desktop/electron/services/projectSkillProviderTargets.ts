import { join } from 'node:path'
import type { ElectronProjectSkillProviderTarget } from '../../src/shared/contracts/electronApi'

const PROVIDER_CONFIG_FILE_NAME = 'config.toml'

export const PROJECT_SKILL_PROVIDER_TARGETS: ElectronProjectSkillProviderTarget[] = ['codex', 'mova', 'claude']

const PROVIDER_CONFIG_DIR_NAMES: Record<ElectronProjectSkillProviderTarget, string> = {
  codex: '.codex',
  mova: '.mova',
  claude: '.claude',
}

const PROVIDER_CONFIG_FILE_NAMES: Partial<Record<ElectronProjectSkillProviderTarget, string>> = {
  codex: PROVIDER_CONFIG_FILE_NAME,
  mova: PROVIDER_CONFIG_FILE_NAME,
}

export function projectProviderConfigPaths(projectCwd: string): Partial<Record<ElectronProjectSkillProviderTarget, string>> {
  return Object.fromEntries(PROJECT_SKILL_PROVIDER_TARGETS.flatMap((target) => {
    const configFileName = PROVIDER_CONFIG_FILE_NAMES[target]
    return configFileName ? [[target, join(projectCwd, PROVIDER_CONFIG_DIR_NAMES[target], configFileName)]] : []
  })) as Partial<Record<ElectronProjectSkillProviderTarget, string>>
}

export function projectProviderSkillDirs(projectCwd: string): Record<ElectronProjectSkillProviderTarget, string> {
  return Object.fromEntries(PROJECT_SKILL_PROVIDER_TARGETS.map((target) => [
    target,
    join(projectCwd, PROVIDER_CONFIG_DIR_NAMES[target], 'skills'),
  ])) as Record<ElectronProjectSkillProviderTarget, string>
}

export function projectProviderPluginCacheDirs(projectCwd: string): Record<ElectronProjectSkillProviderTarget, string> {
  return Object.fromEntries(PROJECT_SKILL_PROVIDER_TARGETS.map((target) => [
    target,
    join(projectCwd, PROVIDER_CONFIG_DIR_NAMES[target], 'plugins', 'cache'),
  ])) as Record<ElectronProjectSkillProviderTarget, string>
}

export function normalizeProjectSkillProviderTargets(
  value: unknown,
  fallback: ElectronProjectSkillProviderTarget[] = [],
): ElectronProjectSkillProviderTarget[] {
  const input = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const targets = input
    .map((item) => typeof item === 'string' ? item.trim().toLowerCase() : '')
    .filter((item): item is ElectronProjectSkillProviderTarget => isProjectSkillProviderTarget(item))
  return targets.length ? Array.from(new Set(targets)) : fallback
}

export function isProjectSkillProviderTarget(value: string): value is ElectronProjectSkillProviderTarget {
  return PROJECT_SKILL_PROVIDER_TARGETS.includes(value as ElectronProjectSkillProviderTarget)
}

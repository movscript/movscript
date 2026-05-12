import type { AgentProfile, CatalogRegistry } from '../catalog/types.js'
import { mergeProfiles } from './profileMerge.js'

export interface ResolveProfileResult {
  profile: AgentProfile
  warnings: string[]
}

export function resolveProfile(
  registry: CatalogRegistry,
  options: { modeAlias?: string; orgProfile?: AgentProfile; userProfile?: AgentProfile } = {},
): ResolveProfileResult {
  const warnings: string[] = []
  const base = registry.profiles.get('movscript.profile.default') ?? firstProfile(registry)
  const mode = options.modeAlias ? registry.modeProfiles.get(options.modeAlias) : undefined
  if (options.modeAlias && !mode) warnings.push(`profile.resolve.miss: mode ${options.modeAlias} not found; using default profile`)
  const layers = [base, mode, options.orgProfile, options.userProfile].filter((item): item is AgentProfile => !!item)
  return {
    profile: mergeProfiles(...layers),
    warnings,
  }
}

function firstProfile(registry: CatalogRegistry): AgentProfile {
  const profile = registry.profiles.values().next().value as AgentProfile | undefined
  if (!profile) throw new Error('Catalog has no agent profiles')
  return profile
}

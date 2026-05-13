import type { AgentProfile, CatalogRegistry, ProfileResolutionTrace } from '../catalog/types.js'
import { applyRestrictiveProfileOverride, mergeProfiles } from './profileMerge.js'

export interface ResolveProfileResult {
  profile: AgentProfile
  warnings: string[]
}

export function resolveProfile(
  registry: CatalogRegistry,
  options: { orgProfile?: AgentProfile; userProfile?: AgentProfile } = {},
): ResolveProfileResult {
  const warnings: string[] = []
  const base = registry.profiles.get('movscript.profile.default') ?? firstProfile(registry)
  const traceLayers: ProfileResolutionTrace['layers'] = [
    { source: 'default' as const, id: base.id, version: base.version },
  ]
  let profile = mergeProfiles(base)
  if (options.orgProfile) {
    const org = applyRestrictiveProfileOverride(profile, options.orgProfile, 'org')
    warnings.push(...org.warnings)
    profile = org.profile
    if (org.applied) traceLayers.push({ source: 'org', id: options.orgProfile.id, version: options.orgProfile.version })
  }
  if (options.userProfile) {
    const user = applyRestrictiveProfileOverride(profile, options.userProfile, 'user')
    warnings.push(...user.warnings)
    profile = user.profile
    if (user.applied) traceLayers.push({ source: 'user', id: options.userProfile.id, version: options.userProfile.version })
  }
  return {
    profile: {
      ...profile,
      resolvedFrom: {
        layers: traceLayers,
        resolvedAt: new Date().toISOString(),
      },
    },
    warnings,
  }
}

function firstProfile(registry: CatalogRegistry): AgentProfile {
  const profile = registry.profiles.values().next().value as AgentProfile | undefined
  if (!profile) throw new Error('Catalog has no agent profiles')
  return profile
}

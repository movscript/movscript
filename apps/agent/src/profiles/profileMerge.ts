import type { AgentProfile, ApprovalMode, ProfileResolutionTrace, ToolGrant } from '../catalog/types.js'

const APPROVAL_RANK: Record<ApprovalMode, number> = {
  never: 0,
  on_write: 1,
  always: 2,
}

export function mergeProfiles(...layers: AgentProfile[]): AgentProfile {
  if (layers.length === 0) throw new Error('mergeProfiles requires at least one profile')
  let effective = cloneProfile(layers[0])
  const trace = layers.flatMap((layer) => layer.resolvedFrom?.layers ?? [{ source: 'mode' as const, id: layer.id, version: layer.version }])
  for (const next of layers.slice(1)) {
    effective = {
      ...effective,
      id: next.id,
      version: next.version,
      name: next.name,
      description: next.description ?? effective.description,
      modeAlias: effective.modeAlias ?? next.modeAlias,
      enabledPacks: union(effective.enabledPacks, next.enabledPacks),
      persona: next.persona ?? effective.persona,
      enabledWorkflows: union(effective.enabledWorkflows, next.enabledWorkflows),
      enabledPolicies: union(effective.enabledPolicies, next.enabledPolicies),
      toolGrants: mergeToolGrants(effective.toolGrants, next.toolGrants),
      model: next.model ?? effective.model,
      limits: mergeLimits(effective.limits, next.limits),
      metadata: { ...(effective.metadata ?? {}), ...(next.metadata ?? {}) },
    }
  }
  return {
    ...effective,
    resolvedFrom: {
      layers: trace,
      resolvedAt: new Date().toISOString(),
    },
  }
}

export type RestrictiveProfileLayerSource = Extract<ProfileResolutionTrace['layers'][number]['source'], 'org' | 'user'>

export interface RestrictiveProfileOverrideResult {
  profile: AgentProfile
  warnings: string[]
  applied: boolean
}

export function applyRestrictiveProfileOverride(
  base: AgentProfile,
  override: AgentProfile,
  source: RestrictiveProfileLayerSource,
): RestrictiveProfileOverrideResult {
  const violations = findRestrictiveOverrideViolations(base, override, source)
  if (violations.length > 0) {
    return {
      profile: cloneProfile(base),
      warnings: violations.map((message) => `profile.override.rejected: ${source} profile ${override.id} ${message}`),
      applied: false,
    }
  }

  return {
    profile: {
      ...base,
      id: override.id,
      version: override.version,
      name: override.name,
      description: override.description ?? base.description,
      modeAlias: base.modeAlias,
      enabledPacks: source === 'org' && override.enabledPacks.length > 0
        ? intersection(base.enabledPacks, override.enabledPacks)
        : base.enabledPacks,
      persona: base.persona,
      enabledWorkflows: override.enabledWorkflows.length > 0
        ? intersection(base.enabledWorkflows, override.enabledWorkflows)
        : base.enabledWorkflows,
      enabledPolicies: source === 'org'
        ? union(base.enabledPolicies, override.enabledPolicies)
        : base.enabledPolicies,
      toolGrants: mergeRestrictiveToolGrants(base.toolGrants, override.toolGrants),
      model: base.model,
      limits: source === 'org' ? mergeLimits(base.limits, override.limits) : base.limits,
      metadata: { ...(base.metadata ?? {}), ...(override.metadata ?? {}) },
    },
    warnings: [],
    applied: true,
  }
}

export function mergeToolGrants(base: ToolGrant[], next: ToolGrant[]): ToolGrant[] {
  const byName = new Map<string, ToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of next) {
    const existing = byName.get(grant.name)
    byName.set(grant.name, {
      ...existing,
      ...grant,
      ...(existing?.approval || grant.approval ? { approval: stricterApproval(existing?.approval, grant.approval) } : {}),
    })
  }
  return Array.from(byName.values())
}

export function stricterApproval(left?: ApprovalMode, right?: ApprovalMode): ApprovalMode | undefined {
  if (!left) return right
  if (!right) return left
  return APPROVAL_RANK[right] > APPROVAL_RANK[left] ? right : left
}

function mergeLimits(left: AgentProfile['limits'], right: AgentProfile['limits']): AgentProfile['limits'] {
  if (!left) return right
  if (!right) return left
  return {
    maxActiveWorkflows: minDefined(left.maxActiveWorkflows, right.maxActiveWorkflows),
    maxToolCallsPerTurn: minDefined(left.maxToolCallsPerTurn, right.maxToolCallsPerTurn),
    systemPromptCharLimit: minDefined(left.systemPromptCharLimit, right.systemPromptCharLimit),
  }
}

function findRestrictiveOverrideViolations(base: AgentProfile, override: AgentProfile, source: RestrictiveProfileLayerSource): string[] {
  const violations: string[] = []
  if (override.modeAlias && override.modeAlias !== base.modeAlias) violations.push(`cannot change modeAlias from ${base.modeAlias ?? 'none'} to ${override.modeAlias}`)
  if (override.persona && override.persona !== base.persona) violations.push(`cannot change persona to ${override.persona}`)
  if (override.model) violations.push('cannot override model binding')
  if (source === 'user') {
    if (override.enabledPacks.length > 0) violations.push(`cannot override enabledPacks (${override.enabledPacks.join(', ')})`)
    if (override.enabledPolicies.length > 0) violations.push(`cannot add enabledPolicies (${override.enabledPolicies.join(', ')})`)
    if (override.limits) violations.push('cannot override limits')
  } else {
    for (const pack of override.enabledPacks) {
      if (!base.enabledPacks.includes(pack)) violations.push(`cannot add enabledPack ${pack}`)
    }
  }
  for (const workflow of override.enabledWorkflows) {
    if (!base.enabledWorkflows.includes(workflow)) violations.push(`cannot add enabledWorkflow ${workflow}`)
  }
  for (const grant of override.toolGrants) {
    const baseGrant = base.toolGrants.find((item) => item.name === grant.name)
    if (!baseGrant) {
      if (grant.mode === 'allow') violations.push(`cannot allow ungranted tool ${grant.name}`)
      continue
    }
    if (baseGrant.mode === 'deny' && grant.mode === 'allow') violations.push(`cannot allow denied tool ${grant.name}`)
    if (baseGrant.mode === 'allow' && grant.mode === 'allow' && approvalRank(grant.approval) < approvalRank(baseGrant.approval)) {
      violations.push(`cannot weaken approval for ${grant.name}`)
    }
  }
  return violations
}

function mergeRestrictiveToolGrants(base: ToolGrant[], override: ToolGrant[]): ToolGrant[] {
  if (override.length === 0) return base
  const byName = new Map<string, ToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of override) {
    const existing = byName.get(grant.name)
    if (!existing) continue
    if (grant.mode === 'deny') {
      byName.set(grant.name, { ...existing, mode: 'deny', ...(grant.approval ? { approval: stricterApproval(existing.approval, grant.approval) } : {}) })
      continue
    }
    byName.set(grant.name, {
      ...existing,
      ...grant,
      mode: 'allow',
      ...(existing.approval || grant.approval ? { approval: stricterApproval(existing.approval, grant.approval) } : {}),
    })
  }
  return Array.from(byName.values())
}

function minDefined(left?: number, right?: number): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left, right)
}

function union(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]))
}

function intersection(left: string[], right: string[]): string[] {
  const allowed = new Set(right)
  return left.filter((item) => allowed.has(item))
}

function approvalRank(value?: ApprovalMode): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function cloneProfile(profile: AgentProfile): AgentProfile {
  return JSON.parse(JSON.stringify(profile)) as AgentProfile
}

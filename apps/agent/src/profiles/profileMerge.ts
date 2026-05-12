import type { AgentProfile, ApprovalMode, ToolGrant } from '../catalog/types.js'

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

function minDefined(left?: number, right?: number): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left, right)
}

function union(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]))
}

function cloneProfile(profile: AgentProfile): AgentProfile {
  return JSON.parse(JSON.stringify(profile)) as AgentProfile
}

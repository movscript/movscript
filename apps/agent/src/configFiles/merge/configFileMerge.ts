import type { AgentConfigFile, ApprovalMode, ConfigFileResolutionTrace, ToolGrant } from '../../catalog/registry/shared/types.js'

const APPROVAL_RANK: Record<ApprovalMode, number> = {
  never: 0,
  on_write: 1,
  always: 2,
}

export function mergeConfigFiles(...layers: AgentConfigFile[]): AgentConfigFile {
  if (layers.length === 0) throw new Error('mergeConfigFiles requires at least one config file')
  let effective = cloneConfigFile(layers[0])
  const trace = layers.flatMap((layer) => layer.resolvedFrom?.layers ?? [{ source: 'base' as const, id: layer.id, version: layer.version }])
  for (const next of layers.slice(1)) {
    effective = {
      ...effective,
      id: next.id,
      version: next.version,
      name: next.name,
      description: next.description ?? effective.description,
      enabledPackIds: union(effective.enabledPackIds, next.enabledPackIds),
      skillIds: union(effective.skillIds, next.skillIds),
      approvalDefaults: mergeApprovalDefaults(effective.approvalDefaults, next.approvalDefaults),
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

export type RestrictiveConfigFileLayerSource = Extract<ConfigFileResolutionTrace['layers'][number]['source'], 'org' | 'user'>

export interface RestrictiveConfigFileOverrideResult {
  configFile: AgentConfigFile
  warnings: string[]
  applied: boolean
}

export function applyRestrictiveConfigFileOverride(
  base: AgentConfigFile,
  override: AgentConfigFile,
  source: RestrictiveConfigFileLayerSource,
): RestrictiveConfigFileOverrideResult {
  const violations = findRestrictiveOverrideViolations(base, override, source)
  if (violations.length > 0) {
    return {
      configFile: cloneConfigFile(base),
      warnings: violations.map((message) => `config_file.override.rejected: ${source} config file ${override.id} ${message}`),
      applied: false,
    }
  }

  return {
    configFile: {
      ...base,
      id: override.id,
      version: override.version,
      name: override.name,
      description: override.description ?? base.description,
      enabledPackIds: source === 'org' && override.enabledPackIds.length > 0
        ? intersection(base.enabledPackIds, override.enabledPackIds)
        : base.enabledPackIds,
      skillIds: override.skillIds.length > 0
        ? intersection(base.skillIds, override.skillIds)
        : base.skillIds,
      approvalDefaults: mergeApprovalDefaults(base.approvalDefaults, override.approvalDefaults),
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

function mergeApprovalDefaults(
  left: AgentConfigFile['approvalDefaults'],
  right: AgentConfigFile['approvalDefaults'],
): AgentConfigFile['approvalDefaults'] {
  if (!left) return right
  if (!right) return left
  const merged: NonNullable<AgentConfigFile['approvalDefaults']> = { ...left }
  for (const [key, value] of Object.entries(right)) {
    const approval = value as ApprovalMode | undefined
    const current = merged[key as keyof typeof merged]
    const next = stricterApproval(current, approval)
    if (next) merged[key as keyof typeof merged] = next
  }
  return merged
}

function mergeLimits(left: AgentConfigFile['limits'], right: AgentConfigFile['limits']): AgentConfigFile['limits'] {
  if (!left) return right
  if (!right) return left
  return {
    maxActiveTriggeredSkills: minDefined(left.maxActiveTriggeredSkills, right.maxActiveTriggeredSkills),
    systemPromptCharLimit: minDefined(left.systemPromptCharLimit, right.systemPromptCharLimit),
    maxRetrievedContextChars: minDefined(left.maxRetrievedContextChars, right.maxRetrievedContextChars),
    maxReferenceCharsPerRun: minDefined(left.maxReferenceCharsPerRun, right.maxReferenceCharsPerRun),
    maxReferenceChunksPerRun: minDefined(left.maxReferenceChunksPerRun, right.maxReferenceChunksPerRun),
    maxHistoryMessages: minDefined(left.maxHistoryMessages, right.maxHistoryMessages),
    maxThreadSummaryChars: minDefined(left.maxThreadSummaryChars, right.maxThreadSummaryChars),
  }
}

function findRestrictiveOverrideViolations(base: AgentConfigFile, override: AgentConfigFile, source: RestrictiveConfigFileLayerSource): string[] {
  const violations: string[] = []
  if (override.model) violations.push('cannot override model binding')
  if (source === 'user') {
    if (override.enabledPackIds.length > 0) violations.push(`cannot override enabledPackIds (${override.enabledPackIds.join(', ')})`)
    if (override.limits) violations.push('cannot override limits')
  } else {
    for (const pack of override.enabledPackIds) {
      if (!base.enabledPackIds.includes(pack)) violations.push(`cannot add enabledPack ${pack}`)
    }
  }
  for (const [key, approval] of Object.entries(override.approvalDefaults ?? {})) {
    const baseApproval = base.approvalDefaults?.[key as keyof NonNullable<AgentConfigFile['approvalDefaults']>]
    if (approvalRank(approval as ApprovalMode | undefined) < approvalRank(baseApproval)) {
      violations.push(`cannot weaken approval default ${key}`)
    }
  }
  for (const skillId of override.skillIds) {
    if (!base.skillIds.includes(skillId)) violations.push(`cannot add skill ${skillId}`)
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

function cloneConfigFile(configFile: AgentConfigFile): AgentConfigFile {
  return JSON.parse(JSON.stringify(configFile)) as AgentConfigFile
}

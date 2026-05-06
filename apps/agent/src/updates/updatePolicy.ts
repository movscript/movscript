import type { JSONValue } from '../types.js'

export type AgentUpdateKind = 'policy' | 'prompt' | 'tool_catalog' | 'skill_catalog' | 'runtime_code'
export type AgentUpdateSeverity = 'critical' | 'normal' | 'feature' | 'major'
export type AgentUpdateDecision = 'force_apply' | 'auto_apply' | 'defer' | 'require_approval' | 'reject'
export type AgentUpdateChannel = 'local' | 'stable' | 'beta' | 'dev'

export interface AgentUpdatePolicyRule {
  severity: AgentUpdateSeverity
  decision: AgentUpdateDecision
  description: string
}

export interface AgentUpdatePolicy {
  schema: 'movscript.agent-update-policy.v1'
  channel: AgentUpdateChannel
  allowRuntimeCodeUpdates: boolean
  requireSignatureForRemoteUpdates: boolean
  requireAuditLog: boolean
  rollbackWindowVersions: number
  rules: AgentUpdatePolicyRule[]
}

export interface AgentUpdateCandidate {
  id: string
  version: string
  kind: AgentUpdateKind
  severity: AgentUpdateSeverity
  source: 'builtin' | 'local' | 'remote'
  signed?: boolean
  minRuntimeVersion?: string
  metadata?: Record<string, JSONValue>
}

export interface AgentUpdateEvaluation {
  candidate: AgentUpdateCandidate
  decision: AgentUpdateDecision
  reason: string
  warnings: string[]
}

export interface AgentUpdateState {
  policy: AgentUpdatePolicy
  current: {
    runtimeVersion: string
    manifestVersion: string
    policyVersion: string
  }
  applied: AgentUpdateCandidate[]
  pending: AgentUpdateEvaluation[]
  warnings: string[]
}

export const DEFAULT_AGENT_UPDATE_POLICY: AgentUpdatePolicy = {
  schema: 'movscript.agent-update-policy.v1',
  channel: 'stable',
  allowRuntimeCodeUpdates: false,
  requireSignatureForRemoteUpdates: true,
  requireAuditLog: true,
  rollbackWindowVersions: 5,
  rules: [
    {
      severity: 'critical',
      decision: 'force_apply',
      description: 'Security fixes and correctness fixes that prevent unsafe or broken agent behavior.',
    },
    {
      severity: 'normal',
      decision: 'auto_apply',
      description: 'Backward-compatible prompt, policy, skill, and tool catalog fixes.',
    },
    {
      severity: 'feature',
      decision: 'require_approval',
      description: 'New capabilities or behavior changes that should be enabled by a user or workspace admin.',
    },
    {
      severity: 'major',
      decision: 'require_approval',
      description: 'Major behavior or permission changes that need explicit rollout control.',
    },
  ],
}

export function normalizeAgentUpdatePolicy(input: unknown): AgentUpdatePolicy {
  if (!isRecord(input) || input.schema !== 'movscript.agent-update-policy.v1') {
    return DEFAULT_AGENT_UPDATE_POLICY
  }

  const rules = normalizeRules(input.rules)
  return {
    schema: 'movscript.agent-update-policy.v1',
    channel: normalizeChannel(input.channel) ?? DEFAULT_AGENT_UPDATE_POLICY.channel,
    allowRuntimeCodeUpdates: input.allowRuntimeCodeUpdates === true,
    requireSignatureForRemoteUpdates: input.requireSignatureForRemoteUpdates !== false,
    requireAuditLog: input.requireAuditLog !== false,
    rollbackWindowVersions: normalizePositiveInteger(input.rollbackWindowVersions) ?? DEFAULT_AGENT_UPDATE_POLICY.rollbackWindowVersions,
    rules: rules.length > 0 ? rules : DEFAULT_AGENT_UPDATE_POLICY.rules,
  }
}

export function normalizeAgentUpdateCandidate(input: unknown): AgentUpdateCandidate | undefined {
  if (!isRecord(input)) return undefined
  const id = nonEmptyString(input.id)
  const version = nonEmptyString(input.version)
  const kind = normalizeKind(input.kind)
  const severity = normalizeSeverity(input.severity)
  const source = normalizeSource(input.source)
  if (!id || !version || !kind || !severity || !source) return undefined
  return {
    id,
    version,
    kind,
    severity,
    source,
    ...(typeof input.signed === 'boolean' ? { signed: input.signed } : {}),
    ...(nonEmptyString(input.minRuntimeVersion) ? { minRuntimeVersion: nonEmptyString(input.minRuntimeVersion) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
}

export function evaluateAgentUpdateCandidate(
  candidate: AgentUpdateCandidate,
  policy: AgentUpdatePolicy = DEFAULT_AGENT_UPDATE_POLICY,
): AgentUpdateEvaluation {
  const warnings: string[] = []
  if (candidate.source === 'remote' && policy.requireSignatureForRemoteUpdates && candidate.signed !== true) {
    return {
      candidate,
      decision: 'reject',
      reason: 'Remote update is unsigned and remote signatures are required.',
      warnings,
    }
  }

  if (candidate.kind === 'runtime_code' && !policy.allowRuntimeCodeUpdates) {
    const rule = findRule(policy, candidate.severity)
    return {
      candidate,
      decision: candidate.severity === 'critical' ? 'defer' : 'require_approval',
      reason: `Runtime code update is outside dynamic policy scope; configured severity rule is ${rule.decision}.`,
      warnings: ['Runtime code updates must use the signed application updater path.'],
    }
  }

  const rule = findRule(policy, candidate.severity)
  return {
    candidate,
    decision: rule.decision,
    reason: rule.description,
    warnings,
  }
}

export function buildAgentUpdateState(input: {
  runtimeVersion: string
  manifestVersion: string
  policyVersion?: string
  policy?: unknown
  candidates?: unknown[]
  applied?: unknown[]
  warnings?: string[]
}): AgentUpdateState {
  const policy = normalizeAgentUpdatePolicy(input.policy)
  const applied = (input.applied ?? []).flatMap((item) => {
    const candidate = normalizeAgentUpdateCandidate(item)
    return candidate ? [candidate] : []
  })
  const pending = (input.candidates ?? []).flatMap((item) => {
    const candidate = normalizeAgentUpdateCandidate(item)
    return candidate ? [evaluateAgentUpdateCandidate(candidate, policy)] : []
  })

  return {
    policy,
    current: {
      runtimeVersion: input.runtimeVersion,
      manifestVersion: input.manifestVersion,
      policyVersion: input.policyVersion ?? policy.schema,
    },
    applied,
    pending,
    warnings: input.warnings ?? [],
  }
}

function normalizeRules(input: unknown): AgentUpdatePolicyRule[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((item) => {
    if (!isRecord(item)) return []
    const severity = normalizeSeverity(item.severity)
    const decision = normalizeDecision(item.decision)
    if (!severity || !decision) return []
    return [{
      severity,
      decision,
      description: nonEmptyString(item.description) ?? '',
    }]
  })
}

function findRule(policy: AgentUpdatePolicy, severity: AgentUpdateSeverity): AgentUpdatePolicyRule {
  return policy.rules.find((rule) => rule.severity === severity)
    ?? DEFAULT_AGENT_UPDATE_POLICY.rules.find((rule) => rule.severity === severity)
    ?? DEFAULT_AGENT_UPDATE_POLICY.rules[1]
}

function normalizeKind(value: unknown): AgentUpdateKind | undefined {
  return value === 'policy' || value === 'prompt' || value === 'tool_catalog' || value === 'skill_catalog' || value === 'runtime_code'
    ? value
    : undefined
}

function normalizeSeverity(value: unknown): AgentUpdateSeverity | undefined {
  return value === 'critical' || value === 'normal' || value === 'feature' || value === 'major'
    ? value
    : undefined
}

function normalizeDecision(value: unknown): AgentUpdateDecision | undefined {
  return value === 'force_apply' || value === 'auto_apply' || value === 'defer' || value === 'require_approval' || value === 'reject'
    ? value
    : undefined
}

function normalizeChannel(value: unknown): AgentUpdateChannel | undefined {
  return value === 'local' || value === 'stable' || value === 'beta' || value === 'dev'
    ? value
    : undefined
}

function normalizeSource(value: unknown): AgentUpdateCandidate['source'] | undefined {
  return value === 'builtin' || value === 'local' || value === 'remote' ? value : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}

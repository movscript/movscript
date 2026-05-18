import type { AgentManifest, AgentToolApprovalMode, AgentToolGrant } from '../catalog/agentManifest.js'
import type { AgentProfile, CatalogRegistry, ExpertiseSkill, RuntimeContext, SkillDefinition, ToolGrant, WorkflowSkill } from '../catalog/types.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { SkillDiscoveryItem, SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import type { AgentDebugContextPanel, AgentMessage, ResolvedAgentSkill } from '../state/types.js'
import { resolveProfile } from '../profiles/resolveProfile.js'
import { resolveRuntimeIntents, type RuntimeIntentSignal } from './intentResolver.js'
import { composePrompt, renderSkill } from './promptComposer.js'
import { selectActiveWorkflowsWithTrace, type WorkflowTriggerTrace } from './triggerEvaluator.js'

export interface RuntimeLayerResolution {
  manifest: AgentManifest
  ctx: RuntimeContext
  skills: ResolvedAgentSkill[]
  skillDiscovery: SkillDiscoverySummary
  warnings: string[]
  trace: {
    profileId: string
    profileVersion: string
    profileLayers: Array<{ source: string; id: string; version: string }>
    personaId?: string
    policyIds: string[]
    workflowIds: string[]
    intentSignals: RuntimeIntentSignal[]
    workflowTriggers: WorkflowTriggerTrace[]
  }
}

export function resolveRuntimeLayers(input: {
  registry: CatalogRegistry
  baseManifest: AgentManifest
  message: string
  debugContext: AgentDebugContextPanel
  clientInput?: NormalizedClientInput
  history?: AgentMessage[]
  requestedSkillIds?: string[]
  unloadedSkillIds?: string[]
}): RuntimeLayerResolution {
  const rawProfileId = typeof input.baseManifest.metadata?.profileId === 'string' ? input.baseManifest.metadata.profileId : undefined
  const profileId = resolveManifestProfileId(input.registry, rawProfileId)
  const userToolPolicy = userToolPolicyProfile(input.baseManifest, profileId)
  const resolvedProfile = resolveProfile(input.registry, {
    ...(profileId ? { profileId } : {}),
    ...(userToolPolicy ? { userProfile: userToolPolicy } : {}),
  })
  const intentResolution = resolveRuntimeIntents(input.message, input.debugContext)
  const ctx: RuntimeContext = {
    profile: resolvedProfile.profile,
    message: input.message,
    intents: intentResolution.intents,
    uiContext: buildUIContext(input.debugContext),
    conversation: {
      turnCount: input.history?.length ?? 0,
      lastToolCalls: [],
      recentErrors: [],
    },
    catalogVersion: input.registry.version,
  }

  const persona = resolvedProfile.profile.persona ? input.registry.skills.get(resolvedProfile.profile.persona) : undefined
  const policies = resolvedProfile.profile.enabledPolicies.flatMap((id) => {
    const skill = input.registry.skills.get(id)
    return skill?.kind === 'policy' && skill.enabled !== false ? [skill] : []
  })
  const candidateWorkflows = resolvedProfile.profile.enabledWorkflows.flatMap((id) => {
    const skill = input.registry.skills.get(id)
    return skill?.kind === 'workflow' && skill.enabled !== false && skill.loadMode !== 'manual' ? [skill] : []
  })
  const selected = selectActiveWorkflowsWithTrace(candidateWorkflows, ctx)
  const unloadedIds = new Set(input.unloadedSkillIds ?? [])
  const requested = selectRequestedSkills(input.registry, input.requestedSkillIds ?? [], input.unloadedSkillIds ?? [])
  const activePersona = requested.persona ?? (persona?.kind === 'persona' && persona.enabled !== false && !unloadedIds.has(persona.id) ? persona : undefined)
  const activePolicies = policies.filter((skill) => !unloadedIds.has(skill.id))
  const activeWorkflows = selected.workflows.filter((skill) => !unloadedIds.has(skill.id))
  const expertise = selectWorkflowExpertise(input.registry, activeWorkflows)
  const mergedPolicies = mergeSkills(activePolicies, requested.policies)
  const mergedWorkflows = mergeSkills(activeWorkflows, requested.workflows)
  const mergedExpertise = mergeSkills(expertise, requested.expertise)
  const composed = composePrompt({
    registry: input.registry,
    ctx,
    ...(activePersona ? { persona: activePersona } : {}),
    policies: mergedPolicies,
    workflows: mergedWorkflows,
    expertise: mergedExpertise,
  })

  const skillById = new Map<SkillDefinition, string>()
  for (const part of composed.parts) {
    const skill = input.registry.skills.get(part.id)
    if (skill) skillById.set(skill, part.content)
  }
  const skills = [
    ...(activePersona ? [activePersona] : []),
    ...mergedPolicies,
    ...mergedWorkflows,
    ...mergedExpertise,
  ]
    .filter((skill) => composed.parts.some((part) => part.id === skill.id))
    .map((skill, index) => toResolvedSkill(skill, input.registry, ctx, skillById.get(skill), index))
  const skillDiscovery = buildSkillDiscoverySummary({
    registry: input.registry,
    profile: resolvedProfile.profile,
    activeSkillIds: skills.map((skill) => skill.id),
    workflowTriggers: selected.trace,
  })

  const manifest = addSkillToolGrantsToManifest(
    manifestFromProfile(input.baseManifest, resolvedProfile.profile),
    {
      registry: input.registry,
      skillIds: skills.map((skill) => skill.id),
    },
  )
  return {
    manifest,
    ctx,
    skills,
    skillDiscovery,
    warnings: [...resolvedProfile.warnings, ...selected.warnings, ...composed.warnings],
    trace: {
      profileId: resolvedProfile.profile.id,
      profileVersion: resolvedProfile.profile.version,
      profileLayers: resolvedProfile.profile.resolvedFrom?.layers ?? [],
      ...(persona?.kind === 'persona' ? { personaId: persona.id } : {}),
      policyIds: mergedPolicies.map((skill) => skill.id),
      workflowIds: mergedWorkflows.map((skill) => skill.id),
      intentSignals: intentResolution.signals,
      workflowTriggers: selected.trace,
    },
  }
}

export function addSkillToolGrantsToManifest(inputManifest: AgentManifest, input: {
  registry: CatalogRegistry
  skillIds: string[]
}): AgentManifest {
  const skillGrants = skillToolGrants(input.registry, input.skillIds)
  if (skillGrants.length === 0) return inputManifest
  return {
    ...inputManifest,
    tools: mergeAgentToolGrants(inputManifest.tools, skillGrants),
  }
}

function selectRequestedSkills(
  registry: CatalogRegistry,
  requestedIds: string[],
  unloadedIds: string[],
): {
  persona?: Extract<SkillDefinition, { kind: 'persona' }>
  policies: Extract<SkillDefinition, { kind: 'policy' }>[]
  workflows: WorkflowSkill[]
  expertise: ExpertiseSkill[]
} {
  const unloaded = new Set(unloadedIds)
  const policies: Extract<SkillDefinition, { kind: 'policy' }>[] = []
  const workflows: WorkflowSkill[] = []
  const expertise: ExpertiseSkill[] = []
  let persona: Extract<SkillDefinition, { kind: 'persona' }> | undefined
  for (const id of requestedIds) {
    if (unloaded.has(id)) continue
    const skill = registry.skills.get(id)
    if (!skill || skill.enabled === false) continue
    if (skill.kind === 'persona') persona = skill
    else if (skill.kind === 'policy') policies.push(skill)
    else if (skill.kind === 'workflow') workflows.push(skill)
    else if (skill.kind === 'expertise') expertise.push(skill)
  }
  return {
    ...(persona ? { persona } : {}),
    policies,
    workflows,
    expertise,
  }
}

function mergeSkills<T extends SkillDefinition>(base: T[], extra: T[]): T[] {
  const byId = new Map<string, T>()
  for (const skill of base) byId.set(skill.id, skill)
  for (const skill of extra) byId.set(skill.id, skill)
  return Array.from(byId.values())
}

function skillToolGrants(registry: CatalogRegistry, skillIds: string[]): AgentToolGrant[] {
  const grants: AgentToolGrant[] = []
  const seen = new Set<string>()
  for (const id of skillIds) {
    const skill = registry.skills.get(id)
    if (!skill || !('toolRefs' in skill)) continue
    for (const ref of skill.toolRefs ?? []) {
      const name = normalizeToolRef(ref)
      if (seen.has(name)) continue
      const tool = registry.tools.get(name)
      if (!tool || tool.defaults.grant !== 'allow') continue
      grants.push({
        name,
        mode: 'allow',
        approval: tool.defaults.approval,
      })
      seen.add(name)
    }
  }
  return grants
}

function mergeAgentToolGrants(base: AgentToolGrant[], extra: AgentToolGrant[]): AgentToolGrant[] {
  const byName = new Map<string, AgentToolGrant>()
  for (const grant of base) byName.set(grant.name, grant)
  for (const grant of extra) {
    const existing = byName.get(grant.name)
    byName.set(grant.name, {
      ...existing,
      ...grant,
      mode: 'allow',
      ...(existing?.approval || grant.approval ? { approval: stricterAgentApproval(existing?.approval, grant.approval) } : {}),
    })
  }
  return Array.from(byName.values())
}

function normalizeToolRef(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}

function stricterAgentApproval(left?: AgentToolApprovalMode, right?: AgentToolApprovalMode): AgentToolApprovalMode | undefined {
  if (!left) return right
  if (!right) return left
  return agentApprovalRank(right) > agentApprovalRank(left) ? right : left
}

function agentApprovalRank(value?: AgentToolApprovalMode): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function manifestFromProfile(baseManifest: AgentManifest, profile: RuntimeContext['profile']): AgentManifest {
  const baseProfile = baseProfileLayer(profile)
  return {
    ...baseManifest,
    id: profile.id,
    version: profile.version,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    tools: profile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(profile.model?.provider && profile.model.modelId
      ? {
        model: {
          provider: profile.model.provider,
          modelId: profile.model.modelId,
          ...(profile.model.platformModelId !== undefined ? { platformModelId: Number(profile.model.platformModelId) } : {}),
        },
      }
      : {}),
    metadata: {
      ...(baseManifest.metadata ?? {}),
      profileId: baseProfile.id,
      profileVersion: baseProfile.version,
      ...(profile.limits?.systemPromptCharLimit ? { systemPromptCharLimit: profile.limits.systemPromptCharLimit } : {}),
      ...(profile.limits?.contextWindowCharLimit ? { contextWindowCharLimit: profile.limits.contextWindowCharLimit } : {}),
      ...(profile.resolvedFrom ? { resolvedFrom: profileResolutionTraceMetadata(profile.resolvedFrom) } : {}),
    },
  }
}

function resolveManifestProfileId(registry: CatalogRegistry, rawProfileId: string | undefined): string | undefined {
  const profileId = rawProfileId?.trim()
  if (!profileId) return undefined
  if (registry.profiles.has(profileId)) return profileId
  const baseId = stripToolPolicyProfileSuffix(profileId)
  return baseId && registry.profiles.has(baseId) ? baseId : profileId
}

function stripToolPolicyProfileSuffix(profileId: string): string | undefined {
  const suffix = '.tool-policy'
  return profileId.endsWith(suffix) ? profileId.slice(0, -suffix.length) : undefined
}

function baseProfileLayer(profile: RuntimeContext['profile']): { id: string; version: string } {
  const base = profile.resolvedFrom?.layers.find((layer) => layer.source === 'default')
  return {
    id: base?.id ?? stripToolPolicyProfileSuffix(profile.id) ?? profile.id,
    version: base?.version ?? profile.version,
  }
}

function profileResolutionTraceMetadata(trace: NonNullable<RuntimeContext['profile']['resolvedFrom']>): Record<string, string | Array<Record<string, string>>> {
  return {
    resolvedAt: trace.resolvedAt,
    layers: trace.layers.map((layer) => ({
      source: layer.source,
      id: layer.id,
      version: layer.version,
    })),
  }
}

function userToolPolicyProfile(manifest: AgentManifest, baseProfileId: string | undefined): AgentProfile | undefined {
  const toolGrants = toolGrantsFromMetadata(manifest.metadata?.defaultToolGrants)
  if (toolGrants.length === 0) return undefined
  const profileId = baseProfileId ?? stripToolPolicyProfileSuffix(typeof manifest.metadata?.profileId === 'string' ? manifest.metadata.profileId : '') ?? 'movscript.profile.default'
  return {
    schema: 'movscript.agent.profile.v1',
    id: `${profileId}.tool-policy`,
    version: String(manifest.metadata?.profileVersion ?? manifest.version),
    name: 'User Tool Policy',
    enabledPacks: [],
    persona: null,
    enabledWorkflows: [],
    enabledPolicies: [],
    toolGrants,
  }
}

function toolGrantsFromMetadata(input: unknown): ToolGrant[] {
  if (!Array.isArray(input)) return []
  const grants: ToolGrant[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined
    const mode = record.mode === 'deny' ? 'deny' : record.mode === 'allow' ? 'allow' : undefined
    if (!name || !mode) continue
    const approval = record.approval === 'always' || record.approval === 'on_write' || record.approval === 'never'
      ? record.approval
      : undefined
    grants.push({ name, mode, ...(approval ? { approval } : {}) })
  }
  return grants
}

function buildSkillDiscoverySummary(input: {
  registry: CatalogRegistry
  profile: RuntimeContext['profile']
  activeSkillIds: string[]
  workflowTriggers: WorkflowTriggerTrace[]
}): SkillDiscoverySummary {
  const enabledPackIds = collectEnabledPackClosure(input.profile.enabledPacks, input.registry.packs)
  const enabledSkillIds = uniqueStrings(enabledPackIds.flatMap((packId) => input.registry.packs.get(packId)?.skills ?? []))
  const activeIds = new Set(input.activeSkillIds)
  const triggerHintsBySkill = new Map(input.workflowTriggers.map((trace) => [trace.id, workflowTraceHint(trace)]))
  const availableSkills = enabledSkillIds.flatMap((id): SkillDiscoveryItem[] => {
    const skill = input.registry.skills.get(id)
    if (!skill || skill.enabled === false) return []
    const triggerHints = triggerHintsBySkill.get(id) ?? (skill.kind === 'workflow' ? summarizeTriggers(skill.triggers) : [])
    const useWhen = skill.useWhen?.length
      ? skill.useWhen
      : Array.isArray(skill.metadata?.useWhen)
      ? skill.metadata.useWhen.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : undefined
    return [{
      id: skill.id,
      name: skill.name,
      kind: skill.kind,
      description: skill.description,
      active: activeIds.has(skill.id),
      ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
      ...(skill.tags && skill.tags.length > 0 ? { tags: skill.tags } : {}),
      ...(triggerHints.length > 0 ? { triggerHints } : {}),
      ...(useWhen && useWhen.length > 0 ? { useWhen } : {}),
      ...(skill.conflicts && skill.conflicts.length > 0 ? { conflicts: skill.conflicts } : {}),
    }]
  })
  return {
    profileId: input.profile.id,
    profileName: input.profile.name,
    catalogVersion: input.registry.version,
    enabledPackIds,
    availableSkills,
  }
}

function collectEnabledPackClosure(ids: string[], packs: CatalogRegistry['packs']): string[] {
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const pack = packs.get(id)
    if (!pack) return
    for (const required of Object.keys(pack.requires?.packs ?? {})) visit(required)
  }
  for (const id of ids) visit(id)
  return Array.from(visited)
}

function workflowTraceHint(trace: WorkflowTriggerTrace): string[] {
  const hints = trace.trigger ? summarizeTriggers([trace.trigger]) : []
  if (trace.reason) hints.unshift(trace.reason)
  return uniqueStrings(hints)
}

function summarizeTriggers(triggers: WorkflowSkill['triggers']): string[] {
  return triggers.flatMap((trigger) => {
    if (trigger.kind === 'always') return ['always']
    if (trigger.kind === 'intent') return [`intent:${trigger.id}`]
    if (trigger.kind === 'keyword') return trigger.any.slice(0, 4).map((keyword) => `keyword:${keyword}`)
    if (trigger.kind === 'regex') return [`regex:${trigger.pattern}`]
    const selectors = [
      trigger.selector.route?.length ? `route:${trigger.selector.route.slice(0, 3).join('|')}` : undefined,
      trigger.selector.selectedKind?.length ? `selectedKind:${trigger.selector.selectedKind.join('|')}` : undefined,
      trigger.selector.hasProjectId !== undefined ? `hasProjectId:${trigger.selector.hasProjectId}` : undefined,
      trigger.selector.hasProductionId !== undefined ? `hasProductionId:${trigger.selector.hasProductionId}` : undefined,
    ].filter((item): item is string => typeof item === 'string')
    return selectors.length > 0 ? selectors : ['context']
  })
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function toResolvedSkill(
  skill: SkillDefinition,
  registry: CatalogRegistry,
  ctx: RuntimeContext,
  rendered: string | undefined,
  index: number,
): ResolvedAgentSkill {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    category: skill.kind,
    enabled: true,
    priority: skill.priority,
    instruction: rendered ?? renderSkill(skill, registry, ctx),
    outputContract: skill.outputContract,
    toolHints: 'toolRefs' in skill ? skill.toolRefs?.map((ref) => ref.startsWith('tool://') ? ref.slice('tool://'.length) : ref) : undefined,
    metadata: {
      ...(skill.metadata ?? {}),
      kind: skill.kind,
      ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
      ...(skill.sourcePath ? { sourcePath: skill.sourcePath } : {}),
      ...(skill.tags ? { tags: skill.tags } : {}),
      ...(skill.aliases ? { aliases: skill.aliases } : {}),
      ...(skill.useWhen ? { useWhen: skill.useWhen } : {}),
      ...(skill.dependencies ? { dependencies: skill.dependencies } : {}),
      ...(skill.conflicts ? { conflicts: skill.conflicts } : {}),
      ...(skill.tokenEstimate !== undefined ? { tokenEstimate: skill.tokenEstimate } : {}),
      ...(skill.activationScope ? { activationScope: skill.activationScope } : {}),
      ...(skill.kind === 'workflow' && skill.toolScope ? { toolScope: skill.toolScope } : {}),
    },
    resolvedPriority: skill.priority,
    activationReason: skill.kind === 'workflow' ? 'trigger' : skill.kind === 'expertise' ? 'default' : 'profile',
    compiledInstruction: rendered ?? renderSkill(skill, registry, ctx),
    warnings: [],
  }
}

function selectWorkflowExpertise(registry: CatalogRegistry, workflows: WorkflowSkill[]): ExpertiseSkill[] {
  const ids = new Set<string>()
  for (const workflow of workflows) {
    const refs = Array.isArray(workflow.metadata?.expertiseRefs) ? workflow.metadata.expertiseRefs : []
    for (const ref of refs) if (typeof ref === 'string' && ref.trim()) ids.add(ref.trim())
  }
  return Array.from(ids).flatMap((id) => {
    const skill = registry.skills.get(id)
    return skill?.kind === 'expertise' && skill.enabled !== false ? [skill] : []
  })
}

function buildUIContext(debugContext: AgentDebugContextPanel): RuntimeContext['uiContext'] {
  return {
    route: `${debugContext.route.pathname}${debugContext.route.search ?? ''}${debugContext.route.hash ?? ''}`,
    ...(debugContext.project?.id !== undefined ? { projectId: debugContext.project.id } : {}),
    ...(debugContext.productionId !== undefined ? { productionId: debugContext.productionId } : {}),
    ...(debugContext.selection?.entityType ? { selectedKind: debugContext.selection.entityType as RuntimeContext['uiContext']['selectedKind'] } : {}),
    ...(debugContext.selection?.entityId !== undefined ? { selectedId: debugContext.selection.entityId } : {}),
  }
}

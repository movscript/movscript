import type { AgentManifest } from '../catalog/agentManifest.js'
import type { CatalogRegistry, ExpertiseSkill, RuntimeContext, SkillDefinition, WorkflowSkill } from '../catalog/types.js'
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
}): RuntimeLayerResolution {
  const resolvedProfile = resolveProfile(input.registry)
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
    return skill?.kind === 'workflow' && skill.enabled !== false ? [skill] : []
  })
  const selected = selectActiveWorkflowsWithTrace(candidateWorkflows, ctx)
  const expertise = selectWorkflowExpertise(input.registry, selected.workflows)
  const composed = composePrompt({
    registry: input.registry,
    ctx,
    ...(persona?.kind === 'persona' && persona.enabled !== false ? { persona } : {}),
    policies,
    workflows: selected.workflows,
    expertise,
  })

  const skillById = new Map<SkillDefinition, string>()
  for (const part of composed.parts) {
    const skill = input.registry.skills.get(part.id)
    if (skill) skillById.set(skill, part.content)
  }
  const skills = [
    ...(persona?.kind === 'persona' && persona.enabled !== false ? [persona] : []),
    ...policies,
    ...selected.workflows,
    ...expertise,
  ]
    .filter((skill) => composed.parts.some((part) => part.id === skill.id))
    .map((skill, index) => toResolvedSkill(skill, input.registry, ctx, skillById.get(skill), index))
  const skillDiscovery = buildSkillDiscoverySummary({
    registry: input.registry,
    profile: resolvedProfile.profile,
    activeSkillIds: skills.map((skill) => skill.id),
    workflowTriggers: selected.trace,
  })

  const manifest = manifestFromProfile(input.baseManifest, resolvedProfile.profile)
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
      policyIds: policies.map((skill) => skill.id),
      workflowIds: selected.workflows.map((skill) => skill.id),
      intentSignals: intentResolution.signals,
      workflowTriggers: selected.trace,
    },
  }
}

function manifestFromProfile(baseManifest: AgentManifest, profile: RuntimeContext['profile']): AgentManifest {
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
      profileId: profile.id,
      profileVersion: profile.version,
      ...(profile.limits?.systemPromptCharLimit ? { systemPromptCharLimit: profile.limits.systemPromptCharLimit } : {}),
      ...(profile.resolvedFrom ? { resolvedFrom: profileResolutionTraceMetadata(profile.resolvedFrom) } : {}),
    },
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
    const useWhen = Array.isArray(skill.metadata?.useWhen)
      ? skill.metadata.useWhen.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : undefined
    return [{
      id: skill.id,
      name: skill.name,
      kind: skill.kind,
      description: skill.description,
      active: activeIds.has(skill.id),
      ...(triggerHints.length > 0 ? { triggerHints } : {}),
      ...(useWhen && useWhen.length > 0 ? { useWhen } : {}),
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

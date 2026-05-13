import type { AgentManifest } from '../catalog/agentManifest.js'
import type { CatalogRegistry, RuntimeContext, SkillDefinition, WorkflowSkill } from '../catalog/types.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentDebugContextPanel, AgentMessage, ResolvedAgentSkill } from '../state/types.js'
import { resolveProfile } from '../profiles/resolveProfile.js'
import { composePrompt, renderSkill } from './promptComposer.js'
import { selectActiveWorkflowsWithTrace, type WorkflowTriggerTrace } from './triggerEvaluator.js'

export interface RuntimeLayerResolution {
  manifest: AgentManifest
  ctx: RuntimeContext
  skills: ResolvedAgentSkill[]
  warnings: string[]
  trace: {
    profileId: string
    profileVersion: string
    profileLayers: Array<{ source: string; id: string; version: string }>
    personaId?: string
    policyIds: string[]
    workflowIds: string[]
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
  const ctx: RuntimeContext = {
    profile: resolvedProfile.profile,
    message: input.message,
    intents: inferIntents(input.message, input.debugContext),
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
  const composed = composePrompt({
    registry: input.registry,
    ctx,
    ...(persona?.kind === 'persona' && persona.enabled !== false ? { persona } : {}),
    policies,
    workflows: selected.workflows,
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
  ]
    .filter((skill) => composed.parts.some((part) => part.id === skill.id))
    .map((skill, index) => toResolvedSkill(skill, input.registry, ctx, skillById.get(skill), index))

  const manifest = manifestFromProfile(input.baseManifest, resolvedProfile.profile)
  return {
    manifest,
    ctx,
    skills,
    warnings: [...resolvedProfile.warnings, ...selected.warnings, ...composed.warnings],
    trace: {
      profileId: resolvedProfile.profile.id,
      profileVersion: resolvedProfile.profile.version,
      profileLayers: resolvedProfile.profile.resolvedFrom?.layers ?? [],
      ...(persona?.kind === 'persona' ? { personaId: persona.id } : {}),
      policyIds: policies.map((skill) => skill.id),
      workflowIds: selected.workflows.map((skill) => skill.id),
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
    activationReason: skill.kind === 'workflow' ? 'trigger' : 'profile',
    compiledInstruction: rendered ?? renderSkill(skill, registry, ctx),
    warnings: [],
  }
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

function inferIntents(message: string, debugContext: AgentDebugContextPanel): string[] {
  const intents = new Set<string>()
  const normalized = message.toLowerCase()
  for (const label of debugContext.labels) {
    const normalizedLabel = label.toLowerCase().replaceAll('-', '_')
    intents.add(normalizedLabel)
    const alias = LABEL_INTENT_ALIASES[normalizedLabel]
    if (alias) intents.add(alias)
  }
  const route = debugContext.route.pathname.toLowerCase()
  if (route.includes('project-workspace')) intents.add('project_proposal')
  if (route.includes('production-orchestrate')) intents.add('dual_orchestration')
  if (route.includes('asset-slots')) intents.add('asset_proposal')
  if (debugContext.agentPlan) intents.add('planner_subagents')
  const mappings = [
    ['project_proposal', ['项目提案', 'project proposal', 'project_proposal']],
    ['production_proposal', ['制作提案', 'production proposal', 'production_proposal']],
    ['dual_orchestration', ['双阶段提案', '项目和制作', 'dual orchestration', 'dual_orchestration']],
    ['asset_proposal', ['素材提案', '素材候选', 'asset proposal', 'asset_proposal']],
    ['asset_candidate_generation', ['生成素材', '图片候选', '视频候选', 'asset candidate']],
    ['setting_prep', ['设定准备', '设定完善', 'creative reference']],
    ['content_unit_proposal', ['content unit proposal', 'content_unit_proposal']],
    ['content_unit_media_proposal', ['content unit media', 'content_unit_media_proposal']],
    ['visual_generation', ['生成图片', '生成视频', 'visual generation', 'image generation']],
    ['planner_subagents', ['subagent', 'worker', 'parallel', '并行', '子代理', '多任务', '拆分任务', '分工']],
  ] as const
  for (const [intent, needles] of mappings) {
    if (needles.some((needle) => normalized.includes(needle.toLowerCase()))) intents.add(intent)
  }
  return Array.from(intents)
}

const LABEL_INTENT_ALIASES: Record<string, string> = {
  project_orchestration: 'project_proposal',
  production_orchestration: 'production_proposal',
  dual_orchestration: 'dual_orchestration',
  asset_proposal: 'asset_proposal',
  asset_candidate_generation: 'asset_candidate_generation',
  content_unit_suggest: 'content_unit_proposal',
  content_unit_proposal: 'content_unit_proposal',
  content_unit_media_proposal: 'content_unit_media_proposal',
  setting_prep: 'setting_prep',
  visual_generation: 'visual_generation',
  planner_subagents: 'planner_subagents',
}

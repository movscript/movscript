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
    if (isVisualGenerationLabel(normalizedLabel)) intents.add('visual_generation')
  }
  const mappings = [
    ['project_proposal', ['项目提案', '项目规范', '镜头大小', '镜头规格', '风格规范', 'project proposal', 'project_proposal']],
    ['setting_proposal', ['设定提案', '设定资料', '人物设定', '地点设定', 'setting proposal', 'setting_proposal']],
    ['asset_proposal', ['素材需求提案', '素材需求', '素材位', 'asset slot', '素材方案', '素材候选方案', '候选图方案', '候选视频方案', 'prompt 方案', 'asset proposal', 'asset_proposal']],
    ['production_proposal', ['制作提案', 'production proposal', 'production_proposal']],
    ['asset_candidate_generation', ['生成素材', '生成候选', '生成图片候选', '生成视频候选', '图片候选', '视频候选', 'asset candidate']],
    ['setting_prep', ['设定准备', '设定完善', 'creative reference']],
    ['content_unit_proposal', ['content unit proposal', 'content_unit_proposal']],
    ['content_unit_media_proposal', ['content unit media', 'content_unit_media_proposal']],
    ['visual_generation', [
      '生成图片',
      '生成视频',
      '生成图片候选',
      '生成视频候选',
      '出图',
      '出视频',
      'image generation',
      'video generation',
      'image edit',
      'image_edit',
      'edit image',
      '编辑图片',
      '图片编辑',
      '改图',
      '修图',
      '参考图',
      '这张图',
      '这张图片',
    ]],
    ['planner_subagents', ['subagent', 'worker', 'parallel', '并行', '子代理', '多任务', '拆分任务', '分工']],
  ] as const
  for (const [intent, needles] of mappings) {
    if (needles.some((needle) => matchesIntentNeedle(normalized, needle.toLowerCase(), intent))) intents.add(intent)
  }
  const route = debugContext.route.pathname.toLowerCase()
  if (route.includes('project-workspace')) intents.add('project_proposal')
  if (route.includes('creative-references') || route.includes('pre-production')) intents.add('setting_proposal')
  if (route.includes('production-orchestrate')) intents.add('production_proposal')
  if (route.includes('asset-slots') || route.includes('pre-production')) {
    const hasExplicitAssetWorkflow = intents.has('asset_proposal')
      || intents.has('asset_candidate_generation')
      || intents.has('visual_generation')
    if (!hasExplicitAssetWorkflow) intents.add('asset_proposal')
  }
  if (debugContext.agentPlan) intents.add('planner_subagents')
  if (isVisualGenerationRequest(normalized, debugContext)) intents.add('visual_generation')
  if (intents.has('asset_candidate_generation')) intents.add('visual_generation')
  return Array.from(intents)
}

const LABEL_INTENT_ALIASES: Record<string, string> = {
  project_orchestration: 'project_proposal',
  setting_proposal: 'setting_proposal',
  asset_proposal: 'asset_proposal',
  production_orchestration: 'production_proposal',
  asset_candidate_generation: 'asset_candidate_generation',
  content_unit_suggest: 'content_unit_proposal',
  content_unit_proposal: 'content_unit_proposal',
  content_unit_media_proposal: 'content_unit_media_proposal',
  setting_prep: 'setting_prep',
  visual_generation: 'visual_generation',
  image_edit: 'visual_generation',
  image_generation: 'visual_generation',
  video_generation: 'visual_generation',
  planner_subagents: 'planner_subagents',
}

function isVisualGenerationLabel(label: string): boolean {
  return [
    'visual_generation',
    'image_generation',
    'video_generation',
    'image_edit',
    '图片生成',
    '图片编辑',
    '视频生成',
    '生成请求',
  ].some((needle) => label.includes(needle))
}

function matchesIntentNeedle(message: string, needle: string, intent: string): boolean {
  if (!message.includes(needle)) return false
  if (intent !== 'asset_candidate_generation' && intent !== 'visual_generation') return true
  return hasNonNegatedNeedle(message, needle)
}

function hasNonNegatedNeedle(message: string, needle: string): boolean {
  let index = message.indexOf(needle)
  while (index >= 0) {
    if (!isNegatedIntentMatch(message, index)) return true
    index = message.indexOf(needle, index + needle.length)
  }
  return false
}

function isNegatedIntentMatch(message: string, matchIndex: number): boolean {
  const prefix = message.slice(Math.max(0, matchIndex - 12), matchIndex)
  return /(?:不要|不必|不用|无需|不需要|禁止|避免|别|不|do not|don't|dont|no)\s*$/.test(prefix)
    || /(?:不要|不必|不用|无需|不需要|禁止|避免|别|不)\s*(?:创建|调用|进入|执行|启动|发起)?\s*$/.test(prefix)
}

function isVisualGenerationRequest(message: string, debugContext: AgentDebugContextPanel): boolean {
  if (message.trim().length === 0) return false
  if (hasAnyNonNegated(message, DIRECT_VISUAL_GENERATION_NEEDLES)) return true
  if (!hasImageContext(debugContext)) return false
  return hasAnyNonNegated(message, IMAGE_CONTEXT_EDIT_NEEDLES)
}

function hasImageContext(debugContext: AgentDebugContextPanel): boolean {
  return debugContext.attachments.some(isImageLike)
    || debugContext.recentResources.some(isImageLike)
    || debugContext.labels.some((label) => /图片|图像|image|image_edit|resource/i.test(label))
}

function isImageLike(item: { name?: string; type?: string; mimeType?: string }): boolean {
  const type = item.type?.toLowerCase() ?? ''
  const mimeType = item.mimeType?.toLowerCase() ?? ''
  const name = item.name?.toLowerCase() ?? ''
  return type.includes('image')
    || type.includes('图片')
    || mimeType.startsWith('image/')
    || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name)
}

function hasAnyNonNegated(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => hasNonNegatedNeedle(value, needle))
}

const DIRECT_VISUAL_GENERATION_NEEDLES = [
  '生成图片',
  '生成视频',
  '出图',
  '出视频',
  'visual generation',
  'image generation',
  'video generation',
  'image edit',
  'image_edit',
  'edit image',
  '编辑图片',
  '图片编辑',
  '改图',
  '修图',
  '参考图',
] as const

const IMAGE_CONTEXT_EDIT_NEEDLES = [
  '这张',
  '这个图',
  '这张图',
  '这张图片',
  '这幅图',
  '这幅图片',
  '这只',
  '这个小猫',
  '小猫',
  '参考图',
  '原图',
  '图中',
  '图片里',
  '照片里',
  '让它',
  '让他',
  '让她',
  '站起来',
  '坐下',
  '转身',
  '换成',
  '变成',
  '保持',
  '不要改变',
] as const

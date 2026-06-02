import type { AgentManifest, AgentToolApprovalMode, AgentToolGrant } from '../../../catalog/manifest/agentManifest.js'
import type { AgentConfigFile, CatalogRegistry, RuntimeContext, SkillDefinition, SkillTrigger, ToolGrant } from '../../../catalog/registry/shared/types.js'
import type { NormalizedClientInput } from '../../../context/input/client/normalizeClientInput.js'
import type { SkillDiscoveryItem, SkillDiscoverySummary } from '../../../context/prompt/builder/modelContextBuilder.js'
import type { AgentDebugContextPanel, AgentMessage, ResolvedAgentSkill } from '../../../state/shared/types.js'
import { resolveConfigFile } from '../../../configFiles/resolution/resolveConfigFile.js'
import { resolveRuntimeIntents, type RuntimeIntentSignal } from '../intent/intentResolver.js'
import { composePrompt, renderSkill } from '../../prompt/promptComposer.js'
import { selectActiveTriggeredSkillsWithTrace, type SkillTriggerTrace } from '../../activation/triggers/triggerEvaluator.js'

export interface RuntimeLayerResolution {
  manifest: AgentManifest
  ctx: RuntimeContext
  skills: ResolvedAgentSkill[]
  skillDiscovery: SkillDiscoverySummary
  warnings: string[]
  trace: {
    configFileId: string
    configFileVersion: string
    configFileLayers: Array<{ source: string; id: string; version: string }>
    skillIds: string[]
    intentSignals: RuntimeIntentSignal[]
    triggerTraces: SkillTriggerTrace[]
    skillOmissions: RuntimeSkillOmission[]
  }
}

export interface RuntimeSkillOmission {
  skillId: string
  name: string
  stage: 'explicit_unloaded' | 'dependency_missing' | 'dependency_inactive' | 'conflict_active' | 'trigger_over_limit' | 'trigger_not_matched' | 'manual_not_loaded' | 'not_selected'
  reason: string
  matched?: boolean
  selected?: boolean
  triggerReason?: string
  dependencyIds?: string[]
  missingDependencyIds?: string[]
  inactiveDependencyIds?: string[]
  conflictSkillIds?: string[]
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
  const rawConfigFileId = typeof input.baseManifest.metadata?.configFileId === 'string' ? input.baseManifest.metadata.configFileId : undefined
  const configFileId = resolveManifestConfigFileId(input.registry, rawConfigFileId)
  const userToolPermissions = userToolPermissionsConfigFile(input.registry, input.baseManifest, configFileId)
  const resolvedConfigFile = resolveConfigFile(input.registry, {
    ...(configFileId ? { configFileId: configFileId } : {}),
    ...(userToolPermissions ? { userConfigFile: userToolPermissions } : {}),
  })
  const intentResolution = resolveRuntimeIntents(input.message, input.debugContext)
  const ctx: RuntimeContext = {
    configFile: resolvedConfigFile.configFile,
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

  const configSkills = resolvedConfigFile.configFile.skillIds.flatMap((id) => {
    const skill = input.registry.skills.get(id)
    return skill && skill.enabled !== false ? [skill] : []
  })
  const triggerableSkills = configSkills.flatMap((skill): SkillDefinition[] => (
    skillHasTriggers(skill) && skill.loadMode !== 'manual' ? [skill] : []
  ))
  const selected = selectActiveTriggeredSkillsWithTrace(triggerableSkills, ctx)
  const unloadedIds = new Set(input.unloadedSkillIds ?? [])
  const requested = selectRequestedSkills(input.registry, input.requestedSkillIds ?? [], input.unloadedSkillIds ?? [])
  const selectedSkillIds = new Set(selected.skills.map((skill) => skill.id))
  const activeConfigSkills = configSkills.filter((skill) => {
    if (unloadedIds.has(skill.id)) return false
    if (!skillHasTriggers(skill)) return true
    if (skill.loadMode === 'manual') return false
    return selectedSkillIds.has(skill.id)
  })
  const activeTriggeredSkills = selected.skills.filter((skill) => !unloadedIds.has(skill.id))
  const referencedSkills = selectReferencedSkills(input.registry, activeTriggeredSkills)
  const mergedSkills = mergeSkills(activeConfigSkills, [...requested.skills, ...referencedSkills])
  const composed = composePrompt({
    registry: input.registry,
    ctx,
    skills: mergedSkills,
  })

  const skillById = new Map<SkillDefinition, string>()
  for (const part of composed.parts) {
    const skill = input.registry.skills.get(part.id)
    if (skill) skillById.set(skill, part.content)
  }
  const skills = mergedSkills
    .filter((skill) => composed.parts.some((part) => part.id === skill.id))
    .map((skill, index) => toResolvedSkill(skill, input.registry, ctx, skillById.get(skill), index))
  const skillDiscovery = buildSkillDiscoverySummary({
    registry: input.registry,
    configFile: resolvedConfigFile.configFile,
    activeSkillIds: skills.map((skill) => skill.id),
    triggerTraces: selected.trace,
  })
  const skillOmissions = buildRuntimeSkillOmissions({
    registry: input.registry,
    configFile: resolvedConfigFile.configFile,
    activeSkillIds: skills.map((skill) => skill.id),
    triggerTraces: selected.trace,
    unloadedSkillIds: input.unloadedSkillIds ?? [],
  })

  const manifest = addSkillToolGrantsToManifest(
    manifestFromConfigFile(input.baseManifest, resolvedConfigFile.configFile),
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
    warnings: [...resolvedConfigFile.warnings, ...selected.warnings, ...composed.warnings],
    trace: {
      configFileId: resolvedConfigFile.configFile.id,
      configFileVersion: resolvedConfigFile.configFile.version,
      configFileLayers: resolvedConfigFile.configFile.resolvedFrom?.layers ?? [],
      skillIds: skills.map((skill) => skill.id),
      intentSignals: intentResolution.signals,
      triggerTraces: selected.trace,
      skillOmissions,
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
): { skills: SkillDefinition[] } {
  const unloaded = new Set(unloadedIds)
  const skills: SkillDefinition[] = []
  for (const id of requestedIds) {
    if (unloaded.has(id)) continue
    const skill = registry.skills.get(id)
    if (!skill || skill.enabled === false) continue
    skills.push(skill)
  }
  return { skills }
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
    if (!skill || !('toolGrants' in skill)) continue
    for (const ref of skill.toolGrants ?? []) {
      const name = ref.trim()
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
    if (existing?.mode === 'deny') {
      byName.set(grant.name, {
        ...existing,
        ...(existing.approval || grant.approval ? { approval: stricterAgentApproval(existing.approval, grant.approval) } : {}),
      })
      continue
    }
    byName.set(grant.name, {
      ...existing,
      ...grant,
      mode: 'allow',
      ...(existing?.approval || grant.approval ? { approval: stricterAgentApproval(existing?.approval, grant.approval) } : {}),
    })
  }
  return Array.from(byName.values())
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

function manifestFromConfigFile(baseManifest: AgentManifest, configFile: RuntimeContext['configFile']): AgentManifest {
  const baseConfigFile = baseConfigFileLayer(configFile)
  return {
    ...baseManifest,
    id: configFile.id,
    version: configFile.version,
    name: configFile.name,
    ...(configFile.description ? { description: configFile.description } : {}),
    tools: configFile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(configFile.model?.provider && configFile.model.modelId
      ? {
        model: {
          provider: configFile.model.provider,
          modelId: configFile.model.modelId,
          ...(configFile.model.platformModelId !== undefined ? { platformModelId: Number(configFile.model.platformModelId) } : {}),
        },
      }
      : {}),
    metadata: {
      ...(baseManifest.metadata ?? {}),
      ...(configFile.metadata?.promptOptions ? { promptOptions: configFile.metadata.promptOptions } : {}),
      configFileId: baseConfigFile.id,
      configFileVersion: baseConfigFile.version,
      ...(configFile.limits?.systemPromptCharLimit ? { systemPromptCharLimit: configFile.limits.systemPromptCharLimit } : {}),
      ...(configFile.limits?.contextWindowCharLimit ? { contextWindowCharLimit: configFile.limits.contextWindowCharLimit } : {}),
      ...(configFile.resolvedFrom ? { resolvedFrom: configFileResolutionTraceMetadata(configFile.resolvedFrom) } : {}),
    },
  }
}

function resolveManifestConfigFileId(registry: CatalogRegistry, rawConfigFileId: string | undefined): string | undefined {
  const configFileId = rawConfigFileId?.trim()
  if (!configFileId) return undefined
  if (registry.configFiles.has(configFileId)) return configFileId
  const baseId = stripToolPermissionsConfigFileSuffix(configFileId)
  return baseId && registry.configFiles.has(baseId) ? baseId : configFileId
}

function stripToolPermissionsConfigFileSuffix(configFileId: string): string | undefined {
  const suffix = '.tool-permissions'
  return configFileId.endsWith(suffix) ? configFileId.slice(0, -suffix.length) : undefined
}

function baseConfigFileLayer(configFile: RuntimeContext['configFile']): { id: string; version: string } {
  const base = configFile.resolvedFrom?.layers.find((layer) => layer.source === 'base')
  return {
    id: base?.id ?? stripToolPermissionsConfigFileSuffix(configFile.id) ?? configFile.id,
    version: base?.version ?? configFile.version,
  }
}

function configFileResolutionTraceMetadata(trace: NonNullable<RuntimeContext['configFile']['resolvedFrom']>): Record<string, string | Array<Record<string, string>>> {
  return {
    resolvedAt: trace.resolvedAt,
    layers: trace.layers.map((layer) => ({
      source: layer.source,
      id: layer.id,
      version: layer.version,
    })),
  }
}

function userToolPermissionsConfigFile(registry: CatalogRegistry, manifest: AgentManifest, baseConfigFileId: string | undefined): AgentConfigFile | undefined {
  const configFileId = baseConfigFileId ?? stripToolPermissionsConfigFileSuffix(typeof manifest.metadata?.configFileId === 'string' ? manifest.metadata.configFileId : '') ?? 'movscript.config_file.base'
  const toolGrants = normalizeUserToolPermissionGrants(
    toolGrantsForConfigFile(manifest.metadata?.toolPermissionOverridesByConfigFile, configFileId),
    registry,
    configFileId,
  )
  if (toolGrants.length === 0) return undefined
  return {
    schema: 'movscript.agent.config_file.v1',
    id: `${configFileId}.tool-permissions`,
    version: String(manifest.metadata?.configFileVersion ?? manifest.version),
    name: 'User Tool Permissions',
    enabledPackIds: [],
    skillIds: [],
    toolGrants,
  }
}

function normalizeUserToolPermissionGrants(
  grants: ToolGrant[],
  registry: CatalogRegistry,
  configFileId: string,
): ToolGrant[] {
  if (grants.length === 0) return grants
  const configFile = registry.configFiles.get(configFileId)
  if (!configFile) return grants
  const baseGrants = new Map(configFile.toolGrants.map((grant) => [grant.name, grant]))
  return grants.map((grant) => {
    const baseGrant = baseGrants.get(grant.name)
    if (!baseGrant) return grant
    const approval = stricterConfigApproval(
      stricterConfigApproval(baseGrant.approval, configFileApprovalDefault(configFile, registry, grant.name)),
      grant.approval,
    )
    return { ...grant, ...(approval ? { approval } : {}) }
  })
}

function configFileApprovalDefault(
  configFile: AgentConfigFile,
  registry: CatalogRegistry,
  toolName: string,
): ToolGrant['approval'] {
  if (!configFile.approvalDefaults) return undefined
  const tool = registry.tools.get(toolName)
  return (tool ? configFile.approvalDefaults[tool.risk] : undefined) ?? configFile.approvalDefaults.default
}

function stricterConfigApproval(left?: ToolGrant['approval'], right?: ToolGrant['approval']): ToolGrant['approval'] {
  if (!left) return right
  if (!right) return left
  return configApprovalRank(right) > configApprovalRank(left) ? right : left
}

function configApprovalRank(value?: ToolGrant['approval']): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function toolGrantsForConfigFile(input: unknown, configFileId: string): ToolGrant[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  return toolGrantsFromMetadata((input as Record<string, unknown>)[configFileId])
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
  configFile: RuntimeContext['configFile']
  activeSkillIds: string[]
  triggerTraces: SkillTriggerTrace[]
}): SkillDiscoverySummary {
  const enabledPackIds = collectEnabledPackClosure(input.configFile.enabledPackIds, input.registry.packs)
  const enabledSkillIds = uniqueStrings(enabledPackIds.flatMap((packId) => input.registry.packs.get(packId)?.skills ?? []))
  const activeIds = new Set(input.activeSkillIds)
  const triggerHintsBySkill = new Map(input.triggerTraces.map((trace) => [trace.id, triggerTraceHint(trace)]))
  const availableSkills = enabledSkillIds.flatMap((id): SkillDiscoveryItem[] => {
    const skill = input.registry.skills.get(id)
    if (!skill || skill.enabled === false) return []
    const triggerHints = triggerHintsBySkill.get(id) ?? summarizeTriggers(skill.triggers ?? [])
    const useWhen = skill.useWhen?.length
      ? skill.useWhen
      : Array.isArray(skill.metadata?.useWhen)
      ? skill.metadata.useWhen.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : undefined
    return [{
      id: skill.id,
      name: skill.name,
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
    configFileId: input.configFile.id,
    configFileName: input.configFile.name,
    catalogVersion: input.registry.version,
    enabledPackIds,
    availableSkills,
  }
}

function buildRuntimeSkillOmissions(input: {
  registry: CatalogRegistry
  configFile: RuntimeContext['configFile']
  activeSkillIds: string[]
  triggerTraces: SkillTriggerTrace[]
  unloadedSkillIds: string[]
}): RuntimeSkillOmission[] {
  const activeIds = new Set(input.activeSkillIds)
  const unloadedIds = new Set(input.unloadedSkillIds)
  const triggerTraceById = new Map(input.triggerTraces.map((trace) => [trace.id, trace]))
  const candidateIds = uniqueStrings([
    ...collectEnabledPackClosure(input.configFile.enabledPackIds, input.registry.packs)
      .flatMap((packId) => input.registry.packs.get(packId)?.skills ?? []),
    ...input.configFile.skillIds,
  ])
  const omissions: RuntimeSkillOmission[] = []
  for (const id of candidateIds) {
    if (activeIds.has(id)) continue
    const skill = input.registry.skills.get(id)
    if (!skill || skill.enabled === false) continue
    const omission = runtimeSkillOmissionForSkill({
      skill,
      activeIds,
      unloadedIds,
      triggerTrace: triggerTraceById.get(id),
      registry: input.registry,
    })
    if (omission) omissions.push(omission)
  }
  return omissions.sort((left, right) => skillOmissionRank(left.stage) - skillOmissionRank(right.stage) || left.skillId.localeCompare(right.skillId))
}

function runtimeSkillOmissionForSkill(input: {
  skill: SkillDefinition
  activeIds: Set<string>
  unloadedIds: Set<string>
  triggerTrace?: SkillTriggerTrace
  registry: CatalogRegistry
}): RuntimeSkillOmission | undefined {
  const base = {
    skillId: input.skill.id,
    name: input.skill.name,
  }
  if (input.unloadedIds.has(input.skill.id)) {
    return {
      ...base,
      stage: 'explicit_unloaded',
      reason: 'Skill was explicitly unloaded for this run.',
    }
  }
  const missingDependencyIds = (input.skill.dependencies ?? []).filter((id) => !input.registry.skills.has(id))
  if (missingDependencyIds.length > 0) {
    return {
      ...base,
      stage: 'dependency_missing',
      reason: `Required skill dependencies are missing: ${missingDependencyIds.join(', ')}.`,
      dependencyIds: [...(input.skill.dependencies ?? [])],
      missingDependencyIds,
    }
  }
  const inactiveDependencyIds = (input.skill.dependencies ?? []).filter((id) => !input.activeIds.has(id))
  if (inactiveDependencyIds.length > 0) {
    return {
      ...base,
      stage: 'dependency_inactive',
      reason: `Required skill dependencies are not active in this run: ${inactiveDependencyIds.join(', ')}.`,
      dependencyIds: [...(input.skill.dependencies ?? [])],
      inactiveDependencyIds,
    }
  }
  const conflictSkillIds = (input.skill.conflicts ?? []).filter((id) => input.activeIds.has(id))
  if (conflictSkillIds.length > 0) {
    return {
      ...base,
      stage: 'conflict_active',
      reason: `Conflicting active skill(s) selected in this run: ${conflictSkillIds.join(', ')}.`,
      conflictSkillIds,
    }
  }
  if (input.triggerTrace && !input.triggerTrace.selected) {
    return {
      ...base,
      stage: input.triggerTrace.matched ? 'trigger_over_limit' : 'trigger_not_matched',
      reason: input.triggerTrace.matched
        ? 'Triggered skill matched but was not selected because the active triggered-skill limit was reached.'
        : 'Triggered skill did not match the current request/context.',
      matched: input.triggerTrace.matched,
      selected: input.triggerTrace.selected,
      triggerReason: input.triggerTrace.reason,
    }
  }
  if (input.skill.loadMode === 'manual') {
    return {
      ...base,
      stage: 'manual_not_loaded',
      reason: 'Manual skill is available but was not loaded for this run.',
    }
  }
  return undefined
}

function skillOmissionRank(stage: RuntimeSkillOmission['stage']): number {
  switch (stage) {
    case 'explicit_unloaded': return 0
    case 'dependency_missing': return 1
    case 'dependency_inactive': return 2
    case 'conflict_active': return 3
    case 'trigger_over_limit': return 4
    case 'trigger_not_matched': return 5
    case 'manual_not_loaded': return 6
    default: return 7
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

function triggerTraceHint(trace: SkillTriggerTrace): string[] {
  const hints = trace.trigger ? summarizeTriggers([trace.trigger]) : []
  if (trace.reason) hints.unshift(trace.reason)
  return uniqueStrings(hints)
}

function summarizeTriggers(triggers: SkillTrigger[]): string[] {
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
    enabled: true,
    priority: skill.priority,
    instruction: rendered ?? renderSkill(skill, registry, ctx),
    outputContract: skill.outputContract,
    toolHints: 'toolGrants' in skill ? skill.toolGrants?.map((ref) => ref.trim()).filter((ref) => ref.length > 0) : undefined,
    metadata: {
      ...(skill.metadata ?? {}),
      ...(skill.loadMode ? { loadMode: skill.loadMode } : {}),
      ...(skill.sourcePath ? { sourcePath: skill.sourcePath } : {}),
      ...(skill.tags ? { tags: skill.tags } : {}),
      ...(skill.aliases ? { aliases: skill.aliases } : {}),
      ...(skill.useWhen ? { useWhen: skill.useWhen } : {}),
      ...(skill.dependencies ? { dependencies: skill.dependencies } : {}),
      ...(skill.conflicts ? { conflicts: skill.conflicts } : {}),
      ...(skill.tokenEstimate !== undefined ? { tokenEstimate: skill.tokenEstimate } : {}),
      ...(skill.activationScope ? { activationScope: skill.activationScope } : {}),
      ...(skill.toolScope ? { toolScope: skill.toolScope } : {}),
    },
    resolvedPriority: skill.priority,
    activationReason: skillHasTriggers(skill) ? 'trigger' : 'default',
    compiledInstruction: rendered ?? renderSkill(skill, registry, ctx),
    warnings: [],
  }
}

function selectReferencedSkills(registry: CatalogRegistry, triggeredSkills: SkillDefinition[]): SkillDefinition[] {
  const ids = new Set<string>()
  for (const skill of triggeredSkills) {
    const refs = Array.isArray(skill.metadata?.skillRefs) ? skill.metadata.skillRefs : []
    for (const ref of refs) if (typeof ref === 'string' && ref.trim()) ids.add(ref.trim())
  }
  return Array.from(ids).flatMap((id) => {
    const skill = registry.skills.get(id)
    return skill && skill.enabled !== false ? [skill] : []
  })
}

function skillHasTriggers(skill: SkillDefinition): boolean {
  return (skill.triggers?.length ?? 0) > 0
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

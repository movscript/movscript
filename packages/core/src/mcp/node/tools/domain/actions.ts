import { randomUUID } from 'node:crypto'
import { isRecord, stringValue } from '../../../tools/shared/record.js'
import type { MovScriptContentCandidateWriteInput } from '@movscript/workspace'
import type { MovScriptEngineContentUnitInput } from '@movscript/engine'
import type { ContentCandidateRecord, ContentSelectionRecord, ContentSourceWorkspaceSnapshot, WorkspacePreviewTimelineArtifact, WorkspacePreviewTimelineItem } from '../../../../content/index.js'
import type { SemanticEntityKind } from '@movscript/language/domain'
import {
  createMediaEditingProjectFromMovScriptEditPlan,
  type MediaAssetDescriptor,
  type MediaClip,
  type MediaEditingProject,
  type MediaTrack,
  type MovScriptEditPlanArtifact,
} from '@movscript/editing'
import {
  createMovScriptDomainRuntime,
  invalidateMovScriptDomainRuntime,
  type MovScriptDomainRuntime,
} from './runtime.js'
import { resolveMCPProjectWorkspaceLocator } from '../workspace/locator.js'
import { requireMCPBackendBoundProject } from '../project/localProjectBinding.js'

type Args = Record<string, unknown>
type ContentCandidateStatus = NonNullable<MovScriptContentCandidateWriteInput['status']>
type ProductionTimelineClip = {
  id: string
  sceneMomentId?: string | number
  sceneMomentPath?: string
  sceneMomentTitle?: string
  contentUnitId: string | number
  candidateId?: string | number
  resourceId: number
  title: string
  order: number
  durationSec: number
}
const CONTENT_CANDIDATE_STATUSES = new Set<ContentCandidateStatus>([
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'imported',
])

const PROJECT_CONTEXT_STYLE_REFERENCE_RULE_KEY = 'style_reference_images'
const PROJECT_CONTEXT_CORE_STANDARDS = [
  { key: 'aspect_ratio', label: '画幅比例', promptRole: 'context' },
  { key: 'visual_style', label: '视觉风格', promptRole: 'style' },
  { key: 'shot_size_system', label: '镜头大小体系', promptRole: 'style' },
  { key: 'camera_language', label: '镜头语言', promptRole: 'style' },
  { key: 'lighting_style', label: '灯光规则', promptRole: 'style' },
  { key: 'color_palette', label: '色彩规则', promptRole: 'style' },
  { key: 'pacing_rules', label: '节奏规则', promptRole: 'constraint' },
  { key: 'negative_rules', label: '负面规则', promptRole: 'negative' },
] as const

type ProjectContextPromptRole = typeof PROJECT_CONTEXT_CORE_STANDARDS[number]['promptRole'] | 'quality_gate'
type ProjectContextCoreStandard = {
  key: string
  label: string
  prompt_role: ProjectContextPromptRole
  value: string
}
type ProjectContextRule = ProjectContextCoreStandard & {
  id: string
  category: string
  enabled: boolean
  required: boolean
  order: number
}

export async function domainGetModel(args: Args): Promise<unknown> {
  return service(args).getModel({
    entityKind: requiredString(args.entityKind ?? args.entity_kind, 'entityKind'),
    ...(args.entityId !== undefined || args.entity_id !== undefined ? { entityId: idValue(args.entityId ?? args.entity_id) } : {}),
  })
}

export async function domainQueryEntities(args: Args): Promise<unknown> {
  return service(args).queryEntities({
    ...(semanticKind(args.entityKind ?? args.entity_kind) ? { entityKind: semanticKind(args.entityKind ?? args.entity_kind) } : {}),
    ...(stringValue(args.kind) ? { kind: stringValue(args.kind) } : {}),
    ...(stringValue(args.query ?? args.q) ? { query: stringValue(args.query ?? args.q) } : {}),
    ...contextIds(args),
    ...(numberValue(args.limit) !== undefined ? { limit: numberValue(args.limit) } : {}),
  })
}

export async function domainQuerySettings(args: Args): Promise<unknown> {
  return service(args).querySettings({
    ...(args.settingId !== undefined || args.setting_id !== undefined ? { settingId: idValue(args.settingId ?? args.setting_id) } : {}),
    ...(stringValue(args.kind) ? { kind: stringValue(args.kind) } : {}),
    ...(stringValue(args.query ?? args.q) ? { query: stringValue(args.query ?? args.q) } : {}),
    ...(numberValue(args.limit) !== undefined ? { limit: numberValue(args.limit) } : {}),
  })
}

export async function domainQueryAssets(args: Args): Promise<unknown> {
  return service(args).queryAssets({
    ...(args.assetId !== undefined || args.asset_id !== undefined ? { assetId: idValue(args.assetId ?? args.asset_id) } : {}),
    ...(args.settingId !== undefined || args.setting_id !== undefined ? { settingId: idValue(args.settingId ?? args.setting_id) } : {}),
    ...(args.settingStateId !== undefined || args.setting_state_id !== undefined ? { settingStateId: idValue(args.settingStateId ?? args.setting_state_id) } : {}),
    ...(stringValue(args.query ?? args.q) ? { query: stringValue(args.query ?? args.q) } : {}),
    ...(typeof (args.includeCandidates ?? args.include_candidates) === 'boolean' ? { includeCandidates: Boolean(args.includeCandidates ?? args.include_candidates) } : {}),
    ...(numberValue(args.limit) !== undefined ? { limit: numberValue(args.limit) } : {}),
  })
}

export async function domainQueryProductionContext(args: Args): Promise<unknown> {
  return service(args).queryProductionContext({
    ...contextIds(args),
    ...(stringValue(args.query ?? args.q) ? { query: stringValue(args.query ?? args.q) } : {}),
    ...(Array.isArray(args.include) ? { include: args.include.filter(isString) as never } : {}),
    ...(numberValue(args.limit) !== undefined ? { limit: numberValue(args.limit) } : {}),
  })
}

export async function domainReadContentWorkspace(args: Args): Promise<unknown> {
  return service(args).loadContentWorkspace()
}

export async function domainReadContentWorkspaceSnapshot(args: Args): Promise<unknown> {
  return service(args).loadContentWorkspaceSnapshot()
}

export async function domainReadProjectContextSnapshot(args: Args): Promise<unknown> {
  const records = await service(args).queryEntities({ entityKind: 'project_standards', limit: 1 })
  const entity = records[0]
  const standards = entity?.record ?? {}
  const projectStyle = parseProjectStyle(standards.project_style)
  const core = PROJECT_CONTEXT_CORE_STANDARDS.map((item) => {
    const value = projectContextFieldText(item.key === 'aspect_ratio'
      ? standards.aspect_ratio ?? projectStyle.aspect_ratio
      : item.key === 'visual_style'
        ? standards.visual_style ?? projectStyle.visual_style
        : projectStyle[item.key] ?? standards[item.key])
    return {
      key: item.key,
      label: item.label,
      prompt_role: item.promptRole,
      required: true,
      value,
      filled: Boolean(value),
    }
  })
  const customRules = normalizeProjectContextRules(projectStyle.custom_rules)
  const enabledRules = customRules.filter((rule) => rule.enabled && rule.value)
  const promptPreview = buildProjectContextPromptPreview(core, enabledRules)
  const styleReferenceResourceIds = Array.from(new Set(
    enabledRules.flatMap((rule) => rule.key === PROJECT_CONTEXT_STYLE_REFERENCE_RULE_KEY ? extractProjectContextResourceIds(rule.value) : []),
  ))

  return {
    schema: 'movscript.project_context_snapshot.v1',
    kind: 'project_context_snapshot',
    source: {
      entity_kind: 'project_standards',
      entity_id: entity?.id ?? standards.id ?? 'project_standards',
      path: entity?.path ?? 'project_standards.json',
      updated_at: standards.updated_at,
    },
    standards_hash: stableProjectContextHash({
      aspect_ratio: standards.aspect_ratio,
      visual_style: standards.visual_style,
      project_style: projectStyle,
    }),
    core_standards: core,
    missing_core_keys: core.filter((item) => !item.filled).map((item) => item.key),
    missing_core_labels: core.filter((item) => !item.filled).map((item) => item.label),
    custom_rules: customRules,
    enabled_rules: enabledRules,
    style_reference_resource_ids: styleReferenceResourceIds,
    prompt_preview: promptPreview,
    agent_guidance: [
      'Read this snapshot before planning, content-unit work, or generation that depends on project house style or constraints.',
      'Do not modify project standards just because fields are missing; only use domain_upsert_project_standards when the user asks to add, remove, or change standards.',
      'When visual generation supports reference images, pass style_reference_resource_ids as house-style reference_resource_ids.',
    ],
  }
}

export async function domainInterpretContentUnitArtifact(args: Args): Promise<unknown> {
  return service(args).deriveContentUnitArtifact(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainBuildContentUnitBackendPrompt(args: Args): Promise<unknown> {
  return service(args).buildContentUnitBackendPrompt(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadPreviewTimeline(args: Args): Promise<unknown> {
  return service(args).readPreviewTimeline(requiredId(args.productionId ?? args.production_id, 'productionId'))
}

export async function domainReadProductionTimeline(args: Args): Promise<unknown> {
  const productionId = requiredId(args.productionId ?? args.production_id, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    media_editing_project: bundle.mediaEditingProject,
    compose_inputs: buildMediaProjectComposeInputs(bundle.mediaEditingProject),
    clips: bundle.clips,
    blockers: bundle.blockers,
  }
}

export async function domainReadSceneMomentEditPlan(args: Args): Promise<unknown> {
  return service(args).readSceneMomentEditPlan(requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId'))
}

export async function domainReadProductionEditPlan(args: Args): Promise<unknown> {
  const productionId = requiredId(args.productionId ?? args.production_id, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  const editPlan = productionEditPlanFromBundle({
    productionId,
    productionPath: bundle.previewTimeline?.productionPath,
    projectName: stringValue(args.projectName ?? args.project_name),
    clips: bundle.clips,
    blockers: bundle.blockers,
  })
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    edit_plan: editPlan,
    context: editingProjectContextFromProductionClips(productionId, bundle.clips, bundle.blockers),
    blockers: bundle.blockers,
  }
}

export async function domainCreateEditingProjectContext(args: Args): Promise<unknown> {
  const sceneMomentId = args.sceneMomentId ?? args.scene_moment_id
  if (sceneMomentId !== undefined) {
    const id = requiredId(sceneMomentId, 'sceneMomentId')
    const editPlan = await requiredSceneMomentEditPlan(args, id)
    return {
      status: editPlan.status === 'ready_to_compose' ? 'ok' : 'blocked',
      target_kind: 'scene_moment',
      scene_moment_id: id,
      edit_plan: editPlan,
      context: editingProjectContextFromEditPlan(editPlan),
      blockers: editPlan.blockers ?? [],
    }
  }

  const productionId = requiredId(args.productionId ?? args.production_id, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  const editPlan = productionEditPlanFromBundle({
    productionId,
    productionPath: bundle.previewTimeline?.productionPath,
    projectName: stringValue(args.projectName ?? args.project_name),
    clips: bundle.clips,
    blockers: bundle.blockers,
  })
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    target_kind: 'production',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    edit_plan: editPlan,
    context: editingProjectContextFromProductionClips(productionId, bundle.clips, bundle.blockers),
    blockers: bundle.blockers,
  }
}

export async function domainReadSceneMomentTimeline(args: Args): Promise<unknown> {
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId')
  const editPlan = await requiredSceneMomentEditPlan(args, sceneMomentId)
  const mediaEditingProject = createMediaEditingProjectFromMovScriptEditPlan(editPlan, {
    id: stringValue(args.editingProjectId ?? args.editing_project_id),
    projectId: stringValue(args.timelineProjectId ?? args.timeline_project_id),
    title: stringValue(args.projectName ?? args.project_name ?? args.sceneName ?? args.scene_name),
    defaultDurationMs: msValue(args.defaultDurationMs ?? args.default_duration_ms) ?? secToMs(numberValue(args.defaultDurationSec ?? args.default_duration_sec)),
  })
  return {
    status: 'ok',
    scene_moment_id: sceneMomentId,
    edit_plan_status: editPlan.status,
    edit_plan: editPlan,
    media_editing_project: mediaEditingProject,
    compose_inputs: buildMediaProjectComposeInputs(mediaEditingProject),
  }
}

export async function domainReadContentUnitRuntimePanel(args: Args): Promise<unknown> {
  return service(args).readContentUnitRuntimePanel(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadContentUnitGenerationPrompt(args: Args): Promise<unknown> {
  return service(args).readContentUnitGenerationPrompt(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadContentUnitDependencyReport(args: Args): Promise<unknown> {
  return service(args).readContentUnitDependencyReport(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadContentUnitSelectionValidity(args: Args): Promise<unknown> {
  return service(args).readContentUnitSelectionValidity(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainUpsertProjectStandards(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.upsertProjectStandards({
    record: optionalRecord(args.record),
    projectStyle: requiredRecord(args.projectStyle ?? args.project_style, 'projectStyle'),
  }))
}

export async function domainUpsertSetting(args: Args): Promise<unknown> {
  const payload = upsertPayloadRecord(args)
  return runtimeMutation(args, (runtime) => runtime.createSetting({
    id: idValue(payload.id ?? payload.client_id),
    title: stringValue(payload.title),
    kind: stringValue(payload.setting_kind ?? payload.kind),
    description: stringValue(payload.description),
    alias: stringValue(payload.alias),
    content: payload.content,
    importance: payload.importance,
  }))
}

export async function domainUpsertAsset(args: Args): Promise<unknown> {
  const payload = upsertPayloadRecord(args)
  return runtimeMutation(args, (runtime) => runtime.createAsset({
    id: idValue(payload.id ?? payload.client_id),
    title: stringValue(payload.title),
    settingId: idValue(payload.setting_id ?? payload.settingId ?? payload.setting_ref ?? payload.settingRef),
    settingStateId: idValue(payload.setting_state_id ?? payload.settingStateId ?? payload.setting_state_ref ?? payload.settingStateRef),
    slot: stringValue(payload.slot ?? payload.slot_key ?? payload.slotKey),
    assetKind: stringValue(payload.asset_kind ?? payload.kind),
    promptHint: stringValue(payload.prompt_hint ?? payload.promptHint),
    resourceId: idValue(payload.resource_id ?? payload.resourceId),
  }))
}

export async function domainUpsertScript(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.upsertScript({
    scriptId: requiredId(args.scriptId ?? args.script_id, 'scriptId'),
    record: optionalRecord(args.record),
    sourceText: requiredString(args.sourceText ?? args.source_text, 'sourceText'),
    ...(optionalRecord(args.metadata) ? { metadata: optionalRecord(args.metadata) } : {}),
  }))
}

export async function domainReadScriptSource(args: Args): Promise<unknown> {
  return service(args).readScriptSource({
    record: requiredRecord(args.record, 'record'),
    ...(optionalRecord(args.entity) ? { entity: optionalRecord(args.entity) as never } : {}),
  })
}

export async function domainSnapshotScriptVersion(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.snapshotScriptVersionFromMarkdown({
    scriptId: requiredId(args.scriptId ?? args.script_id, 'scriptId'),
    versionId: requiredId(args.versionId ?? args.version_id, 'versionId'),
    ...(stringValue(args.versionLabel ?? args.version_label) ? { versionLabel: stringValue(args.versionLabel ?? args.version_label) } : {}),
    ...(stringValue(args.sourcePath ?? args.source_path) ? { sourcePath: stringValue(args.sourcePath ?? args.source_path) } : {}),
  }))
}

export async function domainUpsertContentUnit(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.createContentUnit(
    engineContentUnitInputFromRecord(requiredRecord(args.unit, 'unit')),
  ))
}

export async function domainUpsertProduction(args: Args): Promise<unknown> {
  const production = requiredRecord(args.production ?? args.payload ?? args.record, 'production')
  const productionId = productionIdFrom(args, production)
  const result = await runtimeMutation(args, (runtime) => runtime.createProduction({
    id: productionId,
    title: stringValue(production.title),
  }))
  return productionWriteResult('production', { productionId }, result)
}

export async function domainUpsertSegment(args: Args): Promise<unknown> {
  const segment = requiredRecord(args.segment ?? args.payload, 'segment')
  const production = optionalRecord(args.production)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment.id ?? segment.client_id, 'segmentId')
  const result = await runtimeMutation(args, (runtime) => runtime.createSegment({
    productionId,
    id: segmentId,
    title: stringValue(segment.title),
    kind: stringValue(segment.segment_kind ?? segment.kind),
    summary: stringValue(segment.summary ?? segment.description),
    order: numberValue(segment.order),
  }))
  return productionWriteResult('segment', { productionId, segmentId }, result)
}

export async function domainUpsertSceneMoment(args: Args): Promise<unknown> {
  const sceneMoment = requiredRecord(args.sceneMoment ?? args.scene_moment ?? args.payload, 'sceneMoment')
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment.id ?? sceneMoment.client_id, 'sceneMomentId')
  const result = await runtimeMutation(args, (runtime) => runtime.createSceneMoment({
    productionId,
    segmentId,
    id: sceneMomentId,
    title: stringValue(sceneMoment.title),
    storyboardId: idValue(sceneMoment.storyboard_id ?? sceneMoment.storyboardId),
    order: numberValue(sceneMoment.order),
    timeText: stringValue(sceneMoment.time_text ?? sceneMoment.when),
    sceneCode: stringValue(sceneMoment.scene_code),
    locationText: stringValue(sceneMoment.location_text ?? sceneMoment.where),
    conditionText: stringValue(sceneMoment.condition_text),
    actionText: stringValue(sceneMoment.action_text ?? sceneMoment.action),
    mood: stringValue(sceneMoment.mood ?? sceneMoment.emotion),
    description: stringValue(sceneMoment.description),
    settings: settingRefsFromRecord(sceneMoment),
  }))
  return productionWriteResult('scene_moment', { productionId, segmentId, sceneMomentId }, result)
}

export async function domainUpsertKeyframe(args: Args): Promise<unknown> {
  const keyframe = normalizeKeyframePayload(requiredRecord(args.keyframe ?? args.payload, 'keyframe'))
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const expressionUnit = optionalRecord(args.expressionUnit ?? args.expression_unit)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
  const expressionUnitId = idValue(args.expressionUnitId ?? args.expression_unit_id ?? expressionUnit?.id ?? expressionUnit?.client_id)
  const keyframeId = requiredId(args.keyframeId ?? args.keyframe_id ?? keyframe.id ?? keyframe.client_id, 'keyframeId')
  const result = await runtimeMutation(args, (runtime) => runtime.createKeyframe({
    productionId,
    segmentId,
    sceneMomentId,
    ...(expressionUnitId ? { expressionUnitId } : {}),
    id: keyframeId,
    title: stringValue(keyframe.title),
    role: stringValue(keyframe.role ?? keyframe.status),
    visualIntent: stringValue(keyframe.visual_intent ?? keyframe.visualIntent ?? keyframe.prompt_hint ?? keyframe.description),
    order: numberValue(keyframe.order),
    timing: optionalRecord(keyframe.timing),
    composition: optionalRecord(keyframe.composition),
    continuity: optionalRecord(keyframe.continuity),
    referenceAssetRefs: Array.isArray(keyframe.reference_asset_refs) ? keyframe.reference_asset_refs : undefined,
    referenceKeyframeRefs: Array.isArray(keyframe.reference_keyframe_refs) ? keyframe.reference_keyframe_refs : undefined,
  }))
  return productionWriteResult('keyframe', { productionId, segmentId, sceneMomentId, ...(expressionUnitId ? { expressionUnitId } : {}), keyframeId }, result)
}

export async function domainUpsertStoryboard(args: Args): Promise<unknown> {
  const storyboard = requiredRecord(args.storyboard ?? args.payload, 'storyboard')
  const expressionUnit = optionalRecord(args.expressionUnit ?? args.expression_unit)
  const productionId = requiredId(args.productionId ?? args.production_id, 'productionId')
  const segmentId = requiredId(args.segmentId ?? args.segment_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId')
  const expressionUnitId = idValue(args.expressionUnitId ?? args.expression_unit_id ?? storyboard.expression_unit_id ?? expressionUnit?.id ?? expressionUnit?.client_id)
  const storyboardId = idValue(args.storyboardId ?? args.storyboard_id ?? storyboard.id ?? storyboard.client_id ?? 'main')
  const result = await runtimeMutation(args, (runtime) => runtime.createStoryboard({
    productionId,
    segmentId,
    sceneMomentId,
    ...(expressionUnitId ? { expressionUnitId } : {}),
    id: storyboardId ?? 'main',
    title: stringValue(storyboard.title),
    visualIntent: stringValue(storyboard.visual_intent ?? storyboard.visualIntent ?? storyboard.prompt_hint ?? storyboard.description),
    order: numberValue(storyboard.order),
    timeline: optionalRecord(storyboard.timeline),
    graph: optionalRecord(storyboard.graph),
  }))
  return {
    status: 'upserted',
    productionId,
    segmentId,
    sceneMomentId,
    ...(expressionUnitId ? { expressionUnitId } : {}),
    storyboardId,
    writtenPaths: result.writtenPaths,
    storyboardPath: result.writtenPaths.find(path => path.endsWith('/storyboard.json')),
  }
}

export async function domainUpsertAudioCue(args: Args): Promise<unknown> {
  const audioCue = normalizeAudioCuePayload(requiredRecord(args.audioCue ?? args.audio_cue ?? args.payload, 'audioCue'))
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
  const audioCueId = requiredId(args.audioCueId ?? args.audio_cue_id ?? audioCue.id ?? audioCue.client_id, 'audioCueId')
  const result = await runtimeMutation(args, (runtime) => runtime.createAudioCue({
    productionId,
    segmentId,
    sceneMomentId,
    id: audioCueId,
    title: stringValue(audioCue.title),
    kind: stringValue(audioCue.cue_kind ?? audioCue.kind),
    storyboardId: idValue(audioCue.storyboard_id ?? audioCue.storyboardId),
    expressionUnitId: idValue(audioCue.expression_unit_ref ?? audioCue.expressionUnitRef ?? audioCue.expression_unit_id ?? audioCue.expressionUnitId),
    promptHint: stringValue(audioCue.prompt_hint ?? audioCue.promptHint),
  }))
  return productionWriteResult('audio_cue', { productionId, segmentId, sceneMomentId, audioCueId }, result)
}

export async function domainUpsertExpressionUnit(args: Args): Promise<unknown> {
  const expressionUnit = normalizeExpressionUnitPayload(requiredRecord(args.expressionUnit ?? args.expression_unit ?? args.payload, 'expressionUnit'))
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
  const expressionUnitId = requiredId(args.expressionUnitId ?? args.expression_unit_id ?? expressionUnit.id ?? expressionUnit.client_id, 'expressionUnitId')
  const result = await runtimeMutation(args, (runtime) => runtime.createExpressionUnit({
    productionId,
    segmentId,
    sceneMomentId,
    id: expressionUnitId,
    title: stringValue(expressionUnit.title),
    kind: stringValue(expressionUnit.kind),
    text: stringValue(expressionUnit.text ?? expressionUnit.content),
    intent: stringValue(expressionUnit.intent ?? expressionUnit.summary ?? expressionUnit.description),
    speaker: stringValue(expressionUnit.speaker),
    note: stringValue(expressionUnit.note),
    order: numberValue(expressionUnit.order),
  }))
  return productionWriteResult('expression_unit', { productionId, segmentId, sceneMomentId, expressionUnitId }, result)
}

export async function domainUpdateContentUnitPrompt(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.updateContentUnitEditPrompt({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    editPrompt: requiredRecord(args.editPrompt ?? args.edit_prompt, 'editPrompt') as never,
  }))
}

export async function domainUpdateEntityTransition(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.updateEntityTransition({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    ...(optionalRecord(args.transition) ? { transition: optionalRecord(args.transition) as never } : {}),
  }))
}

export async function domainUpdateStoryboardTimeline(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.updateStoryboardTimeline({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    ...(optionalRecord(args.timeline) ? { timeline: optionalRecord(args.timeline) as never } : {}),
  }))
}

export async function domainAppendCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.appendCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    payload: requiredRecord(args.payload, 'payload') as never,
    ...(args.lock !== undefined ? { lock: args.lock as never } : {}),
    ...(stringValue(args.nonce) ? { nonce: stringValue(args.nonce) } : {}),
  }))
}

export async function domainCreateContentCandidate(args: Args): Promise<unknown> {
  const status = contentCandidateStatus(args.status)
  return runtimeMutation(args, (runtime) => runtime.createContentCandidate({
    contentUnitId: requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'),
    ...(args.candidateId !== undefined || args.candidate_id !== undefined ? { candidateId: idValue(args.candidateId ?? args.candidate_id) } : {}),
    ...(stringValue(args.source) ? { source: stringValue(args.source) } : {}),
    ...(status ? { status } : {}),
    ...(optionalRecord(args.producer) ? { producer: optionalRecord(args.producer) } : {}),
    outputs: requiredArray(args.outputs, 'outputs').filter(isRecord) as never,
    ...(optionalRecord(args.promptSnapshot ?? args.prompt_snapshot) ? { promptSnapshot: optionalRecord(args.promptSnapshot ?? args.prompt_snapshot) } : {}),
  }))
}

export async function domainCreateContentCandidateBatch(args: Args): Promise<unknown> {
  return runDomainBatch(args, domainCreateContentCandidate)
}

export async function domainCreateAssetSlotCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.createAssetSlotCandidate({
    payload: requiredRecord(args.payload, 'payload'),
    ...(optionalRecord(args.targetRecord ?? args.target_record) ? { targetRecord: optionalRecord(args.targetRecord ?? args.target_record) } : {}),
    ...(stringValue(args.nonce) ? { nonce: stringValue(args.nonce) } : {}),
  }))
}

export async function domainCreateKeyframeCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.createKeyframeCandidate({
    payload: requiredRecord(args.payload, 'payload'),
    ...(optionalRecord(args.targetRecord ?? args.target_record) ? { targetRecord: optionalRecord(args.targetRecord ?? args.target_record) } : {}),
    ...(stringValue(args.nonce) ? { nonce: stringValue(args.nonce) } : {}),
  }))
}

export async function domainSelectContentUnitCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.selectContentUnitCandidate({
    contentUnitId: requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'),
    candidateId: requiredId(args.candidateId ?? args.candidate_id, 'candidateId'),
    ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
    ...(stringValue(args.stalePolicy ?? args.stale_policy) ? { stalePolicy: stringValue(args.stalePolicy ?? args.stale_policy) as never } : {}),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
  }))
}

export async function domainSelectContentUnitCandidateBatch(args: Args): Promise<unknown> {
  return runDomainBatch(args, domainSelectContentUnitCandidate)
}

export async function domainDecideContentUnitCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.decideContentUnitCandidate({
    contentUnitId: requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'),
    candidateId: requiredId(args.candidateId ?? args.candidate_id, 'candidateId'),
    decision: requiredDecision(args.decision),
    ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
    ...(stringValue(args.stalePolicy ?? args.stale_policy) ? { stalePolicy: stringValue(args.stalePolicy ?? args.stale_policy) as never } : {}),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
    ...(stringValue(args.decidedAt ?? args.decided_at) ? { decidedAt: stringValue(args.decidedAt ?? args.decided_at) } : {}),
    ...(optionalRecord(args.metadata) ? { metadata: optionalRecord(args.metadata) } : {}),
  }))
}

export async function domainSelectCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.selectCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    candidateId: requiredString(args.candidateId ?? args.candidate_id, 'candidateId'),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
  }))
}

export async function domainUpdateCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.updateCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    candidateId: requiredString(args.candidateId ?? args.candidate_id, 'candidateId'),
    payload: requiredRecord(args.payload, 'payload') as never,
  }))
}

export async function domainUnlockCandidate(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.unlockCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
  }))
}

export async function domainDeleteEntity(args: Args): Promise<unknown> {
  await runtimeMutation(args, (runtime) => runtime.deleteEntity({
    entity: optionalRecord(args.entity) as never,
    record: optionalRecord(args.record) ?? {},
  }))
  return { status: 'deleted' }
}

export async function domainReview(args: Args): Promise<unknown> {
  return service(args).reviewWorkspace(inspectInput(args))
}

export async function domainInspect(args: Args): Promise<unknown> {
  return service(args).inspectWorkspace(inspectInput(args))
}

export async function domainOverview(args: Args): Promise<unknown> {
  return service(args).overviewWorkspace()
}

export async function domainReadProductionWorkPlan(args: Args): Promise<unknown> {
  return service(args).productionWorkPlan()
}

export async function domainInterpret(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.interpretWorkspace())
}

export async function domainRegenerationPlan(args: Args): Promise<unknown> {
  return service(args).regenerationPlan()
}

function service(args: Args) {
  return createMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args))
}

async function runtimeMutation<T>(
  args: Args,
  action: (runtime: MovScriptDomainRuntime) => Promise<T>,
): Promise<T> {
  const locator = await requireMCPBackendBoundProject(args)
  try {
    return await action(createMovScriptDomainRuntime(locator))
  } finally {
    invalidateMovScriptDomainRuntime(locator)
  }
}

function invalidateRuntimeForArgs(args: Args): void {
  invalidateMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args))
}

function parseProjectStyle(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function projectContextFieldText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => projectContextFieldText(item)).filter(Boolean).join('；')
  if (isRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function normalizeProjectContextRules(value: unknown): ProjectContextRule[] {
  const rules = Array.isArray(value) ? value.filter(isRecord) : []
  return rules
    .map((rule, index) => {
      const key = projectContextFieldText(rule.key).toLowerCase().replace(/\s+/g, '_')
      const label = projectContextFieldText(rule.label ?? rule.name ?? rule.key) || `扩展规范 ${index + 1}`
      const ruleValue = projectContextFieldText(rule.value ?? rule.content ?? rule.description)
      return {
        id: projectContextFieldText(rule.id) || `rule_${key || index}_${index}`,
        key: key || label.toLowerCase().replace(/\s+/g, '_'),
        label,
        category: projectContextFieldText(rule.category) || '通用',
        value: ruleValue,
        prompt_role: normalizeProjectContextPromptRole(rule.prompt_role ?? rule.promptRole ?? rule.role),
        enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
        required: typeof rule.required === 'boolean' ? rule.required : false,
        order: numberValue(rule.order) ?? (index + 1) * 10,
      }
    })
    .filter((rule) => rule.key || rule.label || rule.value)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
}

function normalizeProjectContextPromptRole(value: unknown): ProjectContextPromptRole {
  if (value === 'context' || value === 'style' || value === 'constraint' || value === 'negative' || value === 'quality_gate') return value
  return 'constraint'
}

function buildProjectContextPromptPreview(
  core: ProjectContextCoreStandard[],
  rules: ProjectContextRule[],
): string {
  const items = [
    ...core.filter((item) => item.value),
    ...rules.filter((item) => item.value),
  ]
  const sections = [
    { role: 'context', title: '项目背景规范' },
    { role: 'style', title: '视觉与表达规范' },
    { role: 'constraint', title: '必须遵守' },
    { role: 'negative', title: '禁止出现' },
    { role: 'quality_gate', title: '质检口径' },
  ].flatMap((section) => {
    const sectionItems = items.filter((item) => item.prompt_role === section.role)
    if (sectionItems.length === 0) return []
    return [`${section.title}：`, ...sectionItems.map((item) => `- ${item.label}：${item.value}`)]
  })
  return sections.length > 0 ? `项目规范：\n${sections.join('\n')}` : '项目规范：\n- 暂无已启用规范。'
}

function extractProjectContextResourceIds(value: string): number[] {
  const ids = new Set<number>()
  for (const pattern of [/resource#(\d+)/gi, /reference_resource_ids\s*[:=]\s*\[?([0-9,\s]+)\]?/gi]) {
    for (const match of value.matchAll(pattern)) {
      const idText = match[1] ?? ''
      for (const part of idText.split(',')) {
        const id = Number(part.trim())
        if (Number.isInteger(id) && id > 0) ids.add(id)
      }
    }
  }
  return Array.from(ids)
}

function stableProjectContextHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function runDomainBatch(args: Args, action: (item: Args) => Promise<unknown>): Promise<Record<string, unknown>> {
  const items = requiredArray(args.items, 'items')
  if (items.length === 0) throw new Error('items must contain at least one item')
  const continueOnError = booleanValue(args.continueOnError ?? args.continue_on_error) ?? true
  const defaults = batchDefaults(args, new Set(['items', 'continueOnError', 'continue_on_error']))
  const results: Record<string, unknown>[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!isRecord(item)) {
      results.push({ index, status: 'error', error: `items[${index}] must be an object` })
      if (!continueOnError) break
      continue
    }
    try {
      results.push({ index, status: 'ok', result: await action({ ...defaults, ...item }) })
    } catch (error) {
      results.push({ index, status: 'error', error: errorMessage(error) })
      if (!continueOnError) break
    }
  }
  for (let index = results.length; index < items.length; index += 1) {
    results.push({
      index,
      status: 'skipped',
      error: 'Skipped because an earlier item failed and continue_on_error is false.',
    })
  }
  const successCount = results.filter((item) => item.status === 'ok').length
  const failedCount = results.filter((item) => item.status === 'error').length
  return {
    status: failedCount === 0 ? 'completed' : successCount > 0 ? 'partial_error' : 'error',
    total: items.length,
    success_count: successCount,
    failed_count: failedCount,
    items: results,
    message: `${successCount}/${items.length} domain batch item(s) completed.`,
  }
}

function batchDefaults(args: Args, excluded: Set<string>): Args {
  const defaults: Args = {}
  for (const [key, value] of Object.entries(args)) {
    if (!excluded.has(key) && value !== undefined) defaults[key] = value
  }
  return defaults
}

export async function domainProjectWorkspaceDir(args: Args): Promise<string> {
  return createMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args)).projectCwd
}

function contextIds(args: Args): Record<string, string | number> {
  return {
    ...(args.productionId !== undefined || args.production_id !== undefined ? { productionId: idValue(args.productionId ?? args.production_id) } : {}),
    ...(args.segmentId !== undefined || args.segment_id !== undefined ? { segmentId: idValue(args.segmentId ?? args.segment_id) } : {}),
    ...(args.sceneMomentId !== undefined || args.scene_moment_id !== undefined ? { sceneMomentId: idValue(args.sceneMomentId ?? args.scene_moment_id) } : {}),
    ...(args.storyboardId !== undefined || args.storyboard_id !== undefined ? { storyboardId: idValue(args.storyboardId ?? args.storyboard_id) } : {}),
    ...(args.contentUnitId !== undefined || args.content_unit_id !== undefined ? { contentUnitId: idValue(args.contentUnitId ?? args.content_unit_id) } : {}),
    ...(args.settingId !== undefined || args.setting_id !== undefined ? { settingId: idValue(args.settingId ?? args.setting_id) } : {}),
    ...(args.settingStateId !== undefined || args.setting_state_id !== undefined ? { settingStateId: idValue(args.settingStateId ?? args.setting_state_id) } : {}),
  }
}

function productionIdFrom(args: Args, production?: Record<string, unknown>): string | number {
  return idValue(args.productionId ?? args.production_id ?? production?.id ?? production?.client_id ?? 'main')
}

function productionWriteResult(
  entityKind: string,
  ids: Record<string, string | number>,
  result: { productionPath: string; writtenPaths: string[]; snapshot: unknown },
): Record<string, unknown> {
  return {
    status: 'upserted',
    entityKind,
    ...ids,
    productionPath: result.productionPath,
    writtenPaths: result.writtenPaths,
    snapshot: result.snapshot,
  }
}

function normalizeKeyframePayload(record: Record<string, unknown>): Record<string, unknown> {
  return pruneUndefinedRecord({
    ...record,
    visual_intent: record.visual_intent ?? record.visualIntent,
    reference_asset_refs: record.reference_asset_refs ?? record.referenceAssetRefs,
    reference_keyframe_refs: record.reference_keyframe_refs ?? record.referenceKeyframeRefs,
  })
}

function normalizeAudioCuePayload(record: Record<string, unknown>): Record<string, unknown> {
  return pruneUndefinedRecord({
    ...record,
    cue_kind: record.cue_kind ?? record.cueKind ?? record.kind,
    storyboard_id: record.storyboard_id ?? record.storyboardId,
    storyboard_ref: record.storyboard_ref ?? record.storyboardRef,
    prompt_hint: record.prompt_hint ?? record.promptHint,
    asset_refs: record.asset_refs ?? record.assetRefs,
  })
}

function normalizeExpressionUnitPayload(record: Record<string, unknown>): Record<string, unknown> {
  return pruneUndefinedRecord({
    ...record,
    kind: record.kind ?? record.expression_kind ?? record.expressionKind,
    script_block_id: record.script_block_id ?? record.scriptBlockId,
  })
}

function pruneUndefinedRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function engineContentUnitInputFromRecord(record: Record<string, unknown>): MovScriptEngineContentUnitInput {
  const editPrompt = optionalRecord(record.edit_prompt ?? record.editPrompt)
  const modelIntent = optionalRecord(record.model_intent ?? record.modelIntent)
  return pruneUndefinedRecord({
    id: record.id ?? record.ID ?? record.client_id,
    title: record.title,
    kind: record.kind,
    contentUnitType: record.content_unit_type ?? record.contentUnitType,
    outputKind: record.output_kind ?? record.outputKind,
    targetKind: record.target_kind ?? record.targetKind,
    targetRef: record.target_ref ?? record.targetRef,
    generationRole: record.generation_role ?? record.generationRole,
    assetRef: record.asset_ref ?? record.assetRef,
    productionId: record.production_ref ?? record.productionRef ?? record.productionId ?? record.production_id,
    segmentId: record.segment_ref ?? record.segmentRef ?? record.segmentId ?? record.segment_id,
    sceneMomentId: record.scene_moment_ref ?? record.sceneMomentRef ?? record.sceneMomentId ?? record.scene_moment_id,
    expressionUnitId: record.expression_unit_ref ?? record.expressionUnitRef ?? record.expressionUnitId ?? record.expression_unit_id,
    storyboardId: record.storyboard_ref ?? record.storyboardRef ?? record.storyboardId ?? record.storyboard_id,
    keyframeId: record.keyframe_ref ?? record.keyframeRef ?? record.keyframeId ?? record.keyframe_id,
    audioCueId: record.audio_cue_ref ?? record.audioCueRef ?? record.audioCueId ?? record.audio_cue_id,
    prompt: record.prompt ?? editPrompt?.text,
    negativePrompt: record.negative_prompt ?? record.negativePrompt ?? editPrompt?.negative_text,
    description: record.description,
    order: numberValue(record.order),
    modelIntent,
  }) as MovScriptEngineContentUnitInput
}

function settingRefsFromRecord(record: Record<string, unknown>): Array<{ id: string | number; settingStateId?: string | number; role?: string; sourceLabel?: string; kind?: string }> {
  const refs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  return refs.flatMap((ref) => {
    const settingId = ref.setting_id ?? ref.settingId ?? ref.setting_ref ?? ref.settingRef
    if (settingId === undefined || settingId === null || String(settingId).trim() === '') return []
    return [{
      id: idValue(settingId),
      ...(ref.setting_state_id !== undefined || ref.settingStateId !== undefined || ref.setting_state_ref !== undefined || ref.settingStateRef !== undefined
        ? { settingStateId: idValue(ref.setting_state_id ?? ref.settingStateId ?? ref.setting_state_ref ?? ref.settingStateRef) }
        : {}),
      ...(stringValue(ref.role) ? { role: stringValue(ref.role) } : {}),
      ...(stringValue(ref.notes ?? ref.source_label ?? ref.sourceLabel) ? { sourceLabel: stringValue(ref.notes ?? ref.source_label ?? ref.sourceLabel) } : {}),
      ...(stringValue(ref.setting_kind ?? ref.kind) ? { kind: stringValue(ref.setting_kind ?? ref.kind) } : {}),
    }]
  })
}

function requiredTargetKind(args: Args): 'asset' | 'keyframe' {
  const value = requiredString(args.targetKind ?? args.target_kind, 'targetKind')
  if (value === 'asset' || value === 'keyframe') return value
  if (value === 'content_unit') {
    throw new Error('content_unit candidates are backend decision records; use domain_create_content_candidate/domain_select_content_unit_candidate')
  }
  throw new Error('targetKind must be asset or keyframe')
}

function semanticKind(value: unknown): SemanticEntityKind | undefined {
  return stringValue(value) as SemanticEntityKind | undefined
}

function inspectInput(args: Args): { commit?: string; checkpointHash?: string } {
  const commit = stringValue(args.commit)
  const checkpointHash = stringValue(args.checkpointHash ?? args.checkpoint_hash)
  return {
    ...(commit ? { commit } : {}),
    ...(checkpointHash ? { checkpointHash } : {}),
  }
}

function contentCandidateStatus(value: unknown): ContentCandidateStatus | undefined {
  const status = stringValue(value)
  if (!status) return undefined
  if (CONTENT_CANDIDATE_STATUSES.has(status as ContentCandidateStatus)) return status as ContentCandidateStatus
  throw new Error('status must be queued, running, succeeded, failed, canceled, or imported')
}

function requiredDecision(value: unknown): 'adopt' | 'reject' | 'defer' {
  const decision = stringValue(value)
  if (decision === 'adopt' || decision === 'reject' || decision === 'defer') return decision
  throw new Error('decision must be adopt, reject, or defer')
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(`${name} is required`)
}

function upsertPayloadRecord(args: Args): Record<string, unknown> {
  return requiredRecord(args.payload ?? args.record ?? args.entity, 'payload')
}

function requiredArray(value: unknown, name: string): unknown[] {
  if (Array.isArray(value)) return value
  throw new Error(`${name} is required`)
}

function requiredString(value: unknown, name: string): string {
  const next = stringValue(value)
  if (!next) throw new Error(`${name} is required`)
  return next
}

function requiredId(value: unknown, name: string): string | number {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name} is required`)
  return idValue(value)
}

function idValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return String(value)
}

function requiredResourceId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  throw new Error('resource_id must be a positive integer RawResource ID')
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function msValue(value: unknown): number | undefined {
  const number = numberValue(value)
  return number === undefined ? undefined : Math.max(1, number)
}

function secToMs(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.max(1, Math.round(value * 1000))
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

async function requiredSceneMomentEditPlan(args: Args, sceneMomentId: string | number): Promise<MovScriptEditPlanArtifact> {
  const editPlan = await service(args).readSceneMomentEditPlan(sceneMomentId)
  if (!isRecord(editPlan)) throw new Error(`scene_moment ${String(sceneMomentId)} edit plan was not found; run domain_interpret first`)
  return editPlan as unknown as MovScriptEditPlanArtifact
}

function productionEditPlanFromBundle(input: {
  productionId: string | number
  productionPath?: string
  projectName?: string
  clips: ProductionTimelineClip[]
  blockers: Array<Record<string, unknown>>
}): MovScriptEditPlanArtifact {
  let cursorSec = 0
  const items = input.clips
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((clip, index) => {
      const durationSec = Math.max(0.1, clip.durationSec || 4)
      const item = {
        id: clip.id,
        content_unit_id: clip.contentUnitId,
        content_unit_ref: `content_units/${String(clip.contentUnitId)}`,
        output_kind: 'video',
        target_kind: 'scene_moment',
        target_ref: clip.sceneMomentPath ?? String(clip.sceneMomentId ?? clip.contentUnitId),
        expression_unit_ref: clip.sceneMomentPath,
        expression_modality: 'visual',
        expression_role: 'scene_moment_output',
        candidate_id: clip.candidateId,
        resource_id: clip.resourceId,
        selected: true,
        stale: false,
        generation_role: 'composed_scene_moment',
        timing_intent: {
          timeline_start_sec: cursorSec,
          duration_sec: durationSec,
          source_duration_sec: durationSec,
        },
        order: index + 1,
      } satisfies MovScriptEditPlanArtifact['tracks'][number]['items'][number]
      cursorSec += durationSec
      return item
    })
  return {
    schema: 'movscript.edit_plan.v1',
    productionId: input.productionId,
    productionPath: input.productionPath ?? `productions/${String(input.productionId)}`,
    sceneMomentId: `production_${String(input.productionId)}`,
    sceneMomentPath: input.productionPath ?? `productions/${String(input.productionId)}`,
    target_ref: input.productionPath ?? `productions/${String(input.productionId)}`,
    status: input.blockers.length === 0 ? 'ready_to_compose' : 'missing_selection',
    tracks: [{ type: 'video', items }],
    compose_inputs: items.map((item) => ({
      content_unit_id: item.content_unit_id,
      resource_id: item.resource_id ?? 0,
      output_kind: 'video' as const,
      track_type: 'video' as const,
    })).filter((item) => item.resource_id > 0),
    ...(input.blockers.length
      ? {
          blockers: input.blockers.map((blocker) => ({
            code: blocker.code === 'selection_stale' || blocker.code === 'resource_missing' ? blocker.code : 'selection_missing',
            content_unit_id: blockerContentUnitId(blocker),
            message: stringValue(blocker.message) ?? 'Production edit plan is blocked by missing scene_moment output selection.',
          })),
        }
      : {}),
  }
}

function blockerContentUnitId(blocker: Record<string, unknown>): string | number {
  const value = blocker.content_unit_id ?? blocker.contentUnitId
  if (typeof value === 'string' || typeof value === 'number') return value
  return 'unknown'
}

function editingProjectContextFromEditPlan(editPlan: MovScriptEditPlanArtifact): Record<string, unknown> {
  const items = editPlan.tracks.flatMap((track) => track.items.map((item) => ({ track, item })))
  return {
    production_id: editPlan.productionId,
    production_path: editPlan.productionPath,
    scene_moment_id: editPlan.sceneMomentId,
    scene_moment_path: editPlan.sceneMomentPath,
    target_ref: editPlan.target_ref,
    selected_content_units: uniqueBy(items.map(({ item }) => ({
      content_unit_id: item.content_unit_id,
      content_unit_ref: item.content_unit_ref,
      output_kind: item.output_kind,
      target_kind: item.target_kind,
      target_ref: item.target_ref,
    })), (item) => String(item.content_unit_id)),
    selected_candidates: items.flatMap(({ item }) => item.candidate_id === undefined ? [] : [{
      content_unit_id: item.content_unit_id,
      candidate_id: item.candidate_id,
      resource_id: item.resource_id,
      selected: item.selected,
      stale: item.stale,
    }]),
    resources: items.flatMap(({ track, item }) => item.resource_id === undefined ? [] : [{
      resource_id: item.resource_id,
      content_unit_id: item.content_unit_id,
      candidate_id: item.candidate_id,
      output_kind: item.output_kind,
      track_type: track.type,
    }]),
    provenance: {
      source: 'movscript_edit_plan',
      selected_candidate_ids: items.flatMap(({ item }) => item.candidate_id === undefined ? [] : [String(item.candidate_id)]),
      input_resource_ids: items.flatMap(({ item }) => item.resource_id === undefined ? [] : [item.resource_id]),
    },
  }
}

function editingProjectContextFromProductionClips(
  productionId: string | number,
  clips: ProductionTimelineClip[],
  blockers: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    production_id: productionId,
    selected_content_units: uniqueBy(clips.map((clip) => ({
      content_unit_id: clip.contentUnitId,
      scene_moment_id: clip.sceneMomentId,
      scene_moment_path: clip.sceneMomentPath,
      output_kind: 'video',
      target_kind: 'production',
    })), (item) => String(item.content_unit_id)),
    selected_candidates: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [{
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      resource_id: clip.resourceId,
      selected: true,
      stale: false,
    }]),
    resources: clips.map((clip) => ({
      resource_id: clip.resourceId,
      content_unit_id: clip.contentUnitId,
      candidate_id: clip.candidateId,
      output_kind: 'video',
      track_type: 'video',
    })),
    blockers,
    provenance: {
      source: 'production_preview_timeline',
      selected_candidate_ids: clips.flatMap((clip) => clip.candidateId === undefined ? [] : [String(clip.candidateId)]),
      input_resource_ids: clips.map((clip) => clip.resourceId),
    },
  }
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

function buildMediaProjectComposeInputs(project: MediaEditingProject): Array<Record<string, unknown>> {
  return mediaProjectVideoItems(project).map((input) => ({
    resource_id: input.resource_id,
    ...(numberValue(input.start_sec) !== undefined ? { start_sec: input.start_sec } : {}),
    ...(numberValue(input.end_sec) !== undefined ? { end_sec: input.end_sec } : {}),
    ...(numberValue(input.duration_sec) !== undefined ? { duration_sec: input.duration_sec } : {}),
    trim_start_sec: input.trim_start_sec,
    trim_end_sec: input.trim_end_sec,
    timeline_start_sec: input.timeline_start_sec,
    timeline_duration_sec: input.timeline_duration_sec,
    clip_id: input.clip_id,
    track_id: input.track_id,
    content_unit_id: input.content_unit_id,
  }))
}

function mediaProjectVideoItems(project: MediaEditingProject): Array<Record<string, unknown>> {
  const assetById = new Map(project.assets.assets.map((asset) => [asset.id, asset]))
  return project.timeline.tracks
    .filter((track) => (track.type === 'video' || track.type === 'image') && track.locked !== true)
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(({ clip }) => clip.assetType === 'video' || clip.assetType === 'image')
    .map(({ track, clip }) => mediaProjectVideoItem(track, clip, assetById))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .sort((left, right) => (numberValue(left.timeline_start_sec) ?? 0) - (numberValue(right.timeline_start_sec) ?? 0) || String(left.clip_id).localeCompare(String(right.clip_id)))
}

function mediaProjectVideoItem(
  track: MediaTrack,
  clip: MediaClip,
  _assetById: Map<string, MediaAssetDescriptor>,
): Record<string, unknown> | undefined {
  const asset = clip.asset
  const resourceId = numberValue(asset?.resourceId)
  if (resourceId === undefined) return undefined
  const startMs = msValue(clip.sourceStartMs) ?? 0
  const durationMs = msValue(clip.durationMs) ?? Math.max(1, (msValue(clip.sourceEndMs) ?? startMs + 4000) - startMs)
  const endMs = msValue(clip.sourceEndMs) ?? startMs + durationMs
  const movscript = isRecord(clip.metadata?.movscript) ? clip.metadata.movscript : undefined
  return {
    resource_id: resourceId,
    start_sec: startMs / 1000,
    end_sec: endMs / 1000,
    duration_sec: durationMs / 1000,
    trim_start_sec: startMs / 1000,
    trim_end_sec: Math.max(0, endMs - startMs - durationMs) / 1000,
    timeline_start_sec: (msValue(clip.timelineStartMs) ?? 0) / 1000,
    timeline_duration_sec: durationMs / 1000,
    clip_id: clip.id,
    track_id: track.id,
    ...(movscript?.contentUnitId !== undefined ? { content_unit_id: movscript.contentUnitId } : {}),
  }
}

async function productionTimelineBundle(args: Args, productionId: string | number): Promise<{
  previewTimeline: WorkspacePreviewTimelineArtifact | undefined
  mediaEditingProject: MediaEditingProject
  clips: ProductionTimelineClip[]
  blockers: Array<Record<string, unknown>>
}> {
  const runtime = service(args)
  const snapshot = await runtime.loadContentWorkspaceSnapshot()
  const previewTimeline = snapshot.previewTimelines.find((timeline) => sameId(timeline.productionId, productionId))
  const blockers: Array<Record<string, unknown>> = []
  if (!previewTimeline) {
    blockers.push({ code: 'preview_timeline_missing', message: `production ${String(productionId)} preview timeline was not found; run domain_interpret first` })
  }
  const clips = previewTimeline ? await productionTimelineClips(runtime, snapshot, previewTimeline, blockers) : []
  const mediaEditingProject = productionMediaEditingProject({
    productionId,
    productionPath: previewTimeline?.productionPath,
    projectName: stringValue(args.projectName ?? args.project_name),
    clips,
    now: stringValue(args.now),
    defaultDurationMs: msValue(args.defaultDurationMs ?? args.default_duration_ms) ?? secToMs(numberValue(args.defaultDurationSec ?? args.default_duration_sec)) ?? 4000,
  })
  return { previewTimeline, mediaEditingProject, clips, blockers }
}

async function productionTimelineClips(
  runtime: MovScriptDomainRuntime,
  snapshot: ContentSourceWorkspaceSnapshot,
  previewTimeline: WorkspacePreviewTimelineArtifact,
  blockers: Array<Record<string, unknown>>,
): Promise<ProductionTimelineClip[]> {
  const contentUnitsById = new Map(snapshot.contentUnits.map((unit) => [String(unit.id ?? pathSegmentAfter(unit.path, 'content_units') ?? unit.path), unit]))
  const candidatesByContentUnitId = contentCandidateRecordsByContentUnitId(snapshot.indexDocuments)
  const selectionsByContentUnitId = await productionTimelineSelectionsByContentUnitId(runtime, snapshot, previewTimeline)
  const sceneItems = previewTimeline.items
    .filter((item) => item.itemType === 'scene_moment')
    .sort((left, right) => left.order - right.order)
  return sceneItems.flatMap((item, index) => {
    const contentUnitIds = productionSceneMomentContentUnitIds(snapshot, item)
    if (contentUnitIds.length === 0) {
      blockers.push({
        code: 'scene_moment_content_unit_missing',
        scene_moment_id: item.entity.id,
        scene_moment_path: item.entity.path,
        message: `scene_moment ${String(item.entity.id ?? item.entity.path)} has no scene_moment_ref video content unit`,
      })
      return []
    }

    for (const contentUnitId of contentUnitIds) {
      const contentUnit = contentUnitsById.get(String(contentUnitId))
      const selection = selectionsByContentUnitId.get(String(contentUnitId))
      const candidateId = selection?.candidate_id
      const candidate = candidateId !== undefined
        ? candidatesByContentUnitId.get(String(contentUnitId))?.find((entry) => sameId(entry.id, candidateId))
        : undefined
      const resourceId = selectedVideoResourceId(candidate)
      if (resourceId !== undefined) {
        const durationSec = numberValue(firstCandidateOutput(candidate)?.duration_sec) ?? 4
        return [{
          id: `production_clip_${safeId(String(item.entity.id ?? index))}_${safeId(String(contentUnitId))}`,
          sceneMomentId: item.entity.id,
          sceneMomentPath: item.entity.path,
          sceneMomentTitle: previewTimelineItemTitle(item),
          contentUnitId,
          candidateId,
          resourceId,
          title: previewTimelineItemTitle(item) ?? String(item.entity.id ?? item.entity.path ?? `Scene ${index + 1}`),
          order: item.order,
          durationSec,
        }]
      }
      blockers.push({
        code: candidateId === undefined ? 'scene_moment_selection_missing' : 'scene_moment_resource_missing',
        scene_moment_id: item.entity.id,
        scene_moment_path: item.entity.path,
        content_unit_id: contentUnitId,
        candidate_id: candidateId,
        output_kind: stringValue(contentUnit?.record.output_kind),
        message: candidateId === undefined
          ? `scene_moment ${String(item.entity.id ?? item.entity.path)} content unit ${String(contentUnitId)} has no selected candidate`
          : `scene_moment ${String(item.entity.id ?? item.entity.path)} selected candidate ${String(candidateId)} has no video resource_id`,
      })
    }
    return []
  })
}

async function productionTimelineSelectionsByContentUnitId(
  runtime: MovScriptDomainRuntime,
  snapshot: ContentSourceWorkspaceSnapshot,
  previewTimeline: WorkspacePreviewTimelineArtifact,
): Promise<Map<string, { candidate_id?: string | number }>> {
  const output = selectionRecordsByContentUnitId(snapshot.indexDocuments)
  const contentUnitIds = Array.from(new Map(previewTimeline.items
    .filter((item) => item.itemType === 'scene_moment')
    .flatMap((item) => productionSceneMomentContentUnitIds(snapshot, item))
    .map((id) => [String(id), id])).values())
  if (contentUnitIds.length === 0 || !runtime.decisionStore) return output
  const contexts = runtime.decisionStore.getContentUnitDecisions
    ? await runtime.decisionStore.getContentUnitDecisions({ contentUnitIds }).catch(() => undefined)
    : undefined
  if (contexts) {
    for (const [contentUnitId, context] of contexts) {
      const selection = decisionContextSelection(context)
      if (selection) output.set(String(contentUnitId), selection)
    }
    return output
  }
  for (const contentUnitId of contentUnitIds) {
    const context = await runtime.decisionStore.getContentUnitDecision({ contentUnitId }).catch(() => undefined)
    const selection = decisionContextSelection(context)
    if (selection) output.set(String(contentUnitId), selection)
  }
  return output
}

function decisionContextSelection(context: unknown): { candidate_id?: string | number } | undefined {
  if (!isRecord(context) || !isRecord(context.selection)) return undefined
  const candidateId = idValue(context.selection.candidate_id)
  return candidateId === undefined ? undefined : { candidate_id: candidateId }
}

function productionMediaEditingProject(input: {
  productionId: string | number
  productionPath?: string
  projectName?: string
  clips: ProductionTimelineClip[]
  now?: string
  defaultDurationMs: number
}): MediaEditingProject {
  const now = input.now ?? new Date().toISOString()
  let cursorMs = 0
  const assets: MediaAssetDescriptor[] = []
  const clips: MediaClip[] = input.clips.map((clip) => {
    const durationMs = Math.max(1, Math.round((clip.durationSec || input.defaultDurationMs / 1000) * 1000))
    const asset: MediaAssetDescriptor = {
      id: `movscript_resource_${clip.resourceId}`,
      sourceKind: 'backend_resource',
      assetType: 'video',
      resourceId: clip.resourceId,
      label: clip.title,
      metadata: {
        movscript: {
          sceneMomentId: clip.sceneMomentId,
          sceneMomentPath: clip.sceneMomentPath,
          contentUnitId: clip.contentUnitId,
          candidateId: clip.candidateId,
          resourceId: clip.resourceId,
          outputKind: 'video',
          trackType: 'video',
          targetKind: 'production',
          targetRef: String(input.productionId),
          selected: true,
          stale: false,
        },
      },
    }
    assets.push(asset)
    const timelineClip: MediaClip = {
      id: clip.id,
      assetType: 'video',
      asset,
      timelineStartMs: cursorMs,
      durationMs,
      sourceStartMs: 0,
      sourceEndMs: durationMs,
      fit: 'cover',
      opacity: 1,
      muted: false,
      metadata: asset.metadata,
    }
    cursorMs += durationMs
    return timelineClip
  })
  return {
    version: 1,
    id: `editing_project_production_${String(input.productionId)}`,
    projectId: `movscript_production_${String(input.productionId)}`,
    title: input.projectName ?? `Production ${String(input.productionId)}`,
    source: {
      kind: 'movscript_edit_plan',
      productionId: String(input.productionId),
      contentUnitIds: input.clips.map((clip) => String(clip.contentUnitId)),
    },
    timeline: {
      version: 1,
      id: `timeline_production_${String(input.productionId)}`,
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: cursorMs,
      tracks: [{
        id: 'track_production_video_0',
        name: 'production video',
        type: 'video',
        zIndex: 0,
        muted: false,
        locked: false,
        clips,
      }],
      metadata: {
        targetRef: String(input.productionId),
        targetKind: 'production',
        productionPath: input.productionPath,
      },
    },
    assets: { assets },
    provenance: {
      targetRef: String(input.productionId),
      productionPath: input.productionPath,
      selectedCandidateIds: input.clips.flatMap((clip) => clip.candidateId === undefined ? [] : [String(clip.candidateId)]),
      inputResourceIds: input.clips.map((clip) => clip.resourceId),
    },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
}

function productionSceneMomentContentUnitIds(
  snapshot: ContentSourceWorkspaceSnapshot,
  item: WorkspacePreviewTimelineItem,
): Array<string | number> {
  const fromTimeline = previewTimelineItemContentUnitIds(item)
  const scanned = snapshot.contentUnits
    .filter((unit) => isSceneMomentVideoContentUnit(unit.record) && sceneMomentRefMatches(unit.record, item))
    .map((unit) => unit.id ?? pathSegmentAfter(unit.path, 'content_units'))
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
  return Array.from(new Map([...fromTimeline, ...scanned].map((id) => [String(id), id])).values())
}

function previewTimelineItemTitle(item: WorkspacePreviewTimelineItem): string | undefined {
  return stringValue((item as WorkspacePreviewTimelineItem & { title?: unknown }).title)
}

function previewTimelineItemContentUnitIds(item: WorkspacePreviewTimelineItem): Array<string | number> {
  const value = (item as WorkspacePreviewTimelineItem & { contentUnitIds?: unknown }).contentUnitIds
  return Array.isArray(value)
    ? value.filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
    : []
}

function isSceneMomentVideoContentUnit(record: Record<string, unknown>): boolean {
  const type = stringValue(record.content_unit_type)
  if (type !== 'scene_moment_ref' && type !== 'scence_moment_ref') return false
  const outputKind = stringValue(record.output_kind)
  return outputKind === undefined || outputKind === 'video'
}

function sceneMomentRefMatches(record: Record<string, unknown>, item: WorkspacePreviewTimelineItem): boolean {
  const refs = [record.scene_moment_ref, record.scence_moment_ref].flatMap((value) => {
    if (typeof value === 'number') return [String(value)]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return []
  })
  return refs.some((ref) =>
    sameId(ref, item.entity.id)
    || ref === item.entity.path
    || lastPathSegment(ref) === lastPathSegment(item.entity.path)
    || (item.entity.path !== undefined && ref.endsWith(item.entity.path)),
  )
}

function contentCandidateRecordsByContentUnitId(documents: ContentSourceWorkspaceSnapshot['indexDocuments']): Map<string, ContentCandidateRecord[]> {
  const output = new Map<string, ContentCandidateRecord[]>()
  for (const document of documents) {
    if (!document.path.endsWith('/content_candidate.json') || !isRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.content_unit_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, [...(output.get(contentUnitId) ?? []), document.data as ContentCandidateRecord])
  }
  return output
}

function selectionRecordsByContentUnitId(documents: ContentSourceWorkspaceSnapshot['indexDocuments']): Map<string, ContentSelectionRecord> {
  const output = new Map<string, ContentSelectionRecord>()
  for (const document of documents) {
    if (!isRecord(document.data)) continue
    const selection = optionalRecord(document.data.selection)
    if (!selection) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.target_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, selection as ContentSelectionRecord)
  }
  return output
}

function contentUnitIdForRuntimeDocument(path: string, ref?: string): string | undefined {
  if (ref) return lastPathSegment(ref) ?? ref
  return pathSegmentAfter(path, 'content_units')
}

function selectedVideoResourceId(candidate: ContentCandidateRecord | undefined): number | undefined {
  const output = firstCandidateOutput(candidate)
  if (stringValue(output?.kind) !== undefined && stringValue(output?.kind) !== 'video') return undefined
  return numberValue(output?.resource_id)
}

function firstCandidateOutput(candidate: ContentCandidateRecord | undefined): Record<string, unknown> | undefined {
  const outputs = Array.isArray(candidate?.outputs) ? candidate.outputs : []
  return outputs.find(isRecord)
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function lastPathSegment(path: string | undefined): string | undefined {
  return path?.split('/').filter(Boolean).at(-1)
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'item'
}

function sameId(left: unknown, right: unknown): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

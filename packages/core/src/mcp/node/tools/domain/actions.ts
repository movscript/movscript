import { randomUUID } from 'node:crypto'
import { normalizeDomainFocus } from '@movscript/domain'
import { createProjectServiceClientFromRuntime } from '@movscript/project'
import { isRecord, stringValue } from '../../../tools/shared/record.js'
import { normalizeWorkspacePath, sameEntityRef, type MovScriptContentCandidateWriteInput } from '@movscript/workspace'
import { createNodeMovScriptWorkspaceFileRepository } from '@movscript/workspace/node'
import type { MovScriptEngineContentUnitInput } from '@movscript/engine'
import {
  buildContentSourceWorkspaceProjectTimelineStatus,
  contentSourceWorkspaceContentUnitStatusSummaries,
  type ContentCandidateRecord,
  type ContentSelectionRecord,
  type ContentSourceWorkspaceSnapshot,
  type WorkspacePreviewTimelineArtifact,
} from '../../../../content/index.js'
import type { SemanticEntityKind } from '@movscript/language/domain'
import {
  createEditingServiceClientFromRuntime,
  type EditingServiceTimelineViewKind,
  type MediaEditingProject,
  type MovScriptEditPlanArtifact,
} from '@movscript/editing'
import {
  createMovScriptDomainRuntime,
  invalidateMovScriptDomainRuntime,
  resolveMCPProjectDecisionStoreConfig,
  type MovScriptDomainRuntime,
} from './runtime.js'
import { resolveMCPProjectWorkspaceLocator } from '../workspace/locator.js'
import { requireMCPBackendBoundProject } from '../project/localProjectBinding.js'
import { backendGet, backendPost } from '../../../../backend/node/client.js'
import {
  candidateIdFromArgs,
  createContentCandidatesSurface,
  createImpactSurface,
  createPreviewTimelineSurface,
  createProjectStatusSurface,
  createPromptSurface,
  projectIdFromArgs,
} from '../surfaces.js'

type Args = Record<string, unknown>
type ContentCandidateStatus = NonNullable<MovScriptContentCandidateWriteInput['status']>
type ProductionTreeContext = {
  productionId: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  expressionUnitId?: string | number
}
type TimelineNamespaceEntityKind = 'production' | 'segment'
type TimelineNamespaceTreeContext = {
  depth: number
  parentTargetPath?: string
}
type TimelineNamespaceTreeCollector = {
  namespaces: Record<string, unknown>[]
  sceneMoments: Record<string, unknown>[]
  primitives: Record<string, unknown>[]
  contentUnits: unknown[]
}
type TimelinePrimitiveKind = 'scene_moment' | 'expression_unit' | 'storyboard' | 'keyframe' | 'audio_cue'
type TimelinePrimitiveRefField =
  | 'sceneMomentId'
  | 'expressionUnitId'
  | 'storyboardId'
  | 'keyframeId'
  | 'audioCueId'
type TimelinePrimitiveSpec = {
  entityKind: TimelinePrimitiveKind
  payloadName: string
  collection: string
  filename: string
  contentUnitType: string
  outputKind: string
  targetKind: string
  refField: TimelinePrimitiveRefField
}
type TimelinePrimitivePathInput = {
  spec: TimelinePrimitiveSpec
  id: string | number
  sceneMomentPath?: string
  expressionUnitPath?: string
}
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

const TIMELINE_PRIMITIVE_SPECS: Record<TimelinePrimitiveKind, TimelinePrimitiveSpec> = {
  scene_moment: {
    entityKind: 'scene_moment',
    payloadName: 'scene_moment',
    collection: 'scene_moments',
    filename: 'scene_moment.json',
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    targetKind: 'scene_moment',
    refField: 'sceneMomentId',
  },
  expression_unit: {
    entityKind: 'expression_unit',
    payloadName: 'expression_unit',
    collection: 'expression_units',
    filename: 'expression_unit.json',
    contentUnitType: 'expression_unit_ref',
    outputKind: 'video',
    targetKind: 'expression_unit',
    refField: 'expressionUnitId',
  },
  storyboard: {
    entityKind: 'storyboard',
    payloadName: 'storyboard',
    collection: 'storyboards',
    filename: 'storyboard.json',
    contentUnitType: 'storyboard_ref',
    outputKind: 'image',
    targetKind: 'storyboard',
    refField: 'storyboardId',
  },
  keyframe: {
    entityKind: 'keyframe',
    payloadName: 'keyframe',
    collection: 'keyframes',
    filename: 'keyframe.json',
    contentUnitType: 'keyframe_ref',
    outputKind: 'image',
    targetKind: 'keyframe',
    refField: 'keyframeId',
  },
  audio_cue: {
    entityKind: 'audio_cue',
    payloadName: 'audio_cue',
    collection: 'audio_cues',
    filename: 'audio_cue.json',
    contentUnitType: 'audio_cue_ref',
    outputKind: 'audio',
    targetKind: 'audio_cue',
    refField: 'audioCueId',
  },
}

async function editingServiceTimelineView(
  args: Args,
  kind: EditingServiceTimelineViewKind,
  input: Record<string, unknown>,
) {
  const locator = resolveMCPProjectWorkspaceLocator(args)
  const decisionStore = await resolveMCPProjectDecisionStoreConfig(locator)
  const result = await createEditingServiceClientFromRuntime().timelineView({
    projectDir: locator.projectDir,
    kind,
    ...(decisionStore ? { decisionStore } : {}),
    ...input,
  })
  return result.result ?? undefined
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
  const locator = resolveMCPProjectWorkspaceLocator(args)
  const response = await createProjectServiceClientFromRuntime().resourceView({
    projectDir: locator.projectDir,
    kind: 'project-context',
  })
  return response.items[0] ?? {
    schema: 'movscript.project_context_snapshot.v1',
    kind: 'project_context_snapshot',
  }
}

export async function domainInterpretContentUnitArtifact(args: Args): Promise<unknown> {
  return service(args).deriveContentUnitArtifact(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainBuildContentUnitBackendPrompt(args: Args): Promise<unknown> {
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const result = await service(args).buildContentUnitBackendPrompt(contentUnitId)
  return isRecord(result)
    ? {
        ...result,
        surface: createPromptSurface(args, {
          contentUnitId,
          mode: result.ok === true ? 'inspect' : 'edit',
          projectId: projectIdFromArgs(args),
        }),
      }
    : result
}

export async function domainReadPreviewTimeline(args: Args): Promise<unknown> {
  const productionId = requiredProductionScopeId(args, 'productionId')
  const result = await readProductionPreviewTimeline(args, productionId)
  return isRecord(result)
    ? {
        ...result,
        surface: createPreviewTimelineSurface(args, {
          productionId,
          projectId: projectIdFromArgs(args),
        }),
      }
    : result
}

export async function domainReadProductionTimeline(args: Args): Promise<unknown> {
  const productionId = requiredProductionScopeId(args, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    media_editing_project: bundle.mediaEditingProject,
    compose_inputs: bundle.composeInputs,
    clips: bundle.clips,
    blockers: bundle.blockers,
  }
}

export async function domainReadSceneMomentEditPlan(args: Args): Promise<unknown> {
  return readSceneMomentEditPlan(args, requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId'))
}

export async function domainReadProductionEditPlan(args: Args): Promise<unknown> {
  const productionId = requiredProductionScopeId(args, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    edit_plan: bundle.editPlan,
    context: bundle.context,
    blockers: bundle.blockers,
  }
}

export async function domainCreateEditingProjectContext(args: Args): Promise<unknown> {
  const sceneMomentId = args.sceneMomentId ?? args.scene_moment_id
  if (sceneMomentId !== undefined) {
    const id = requiredId(sceneMomentId, 'sceneMomentId')
    const bundle = await sceneMomentTimelineBundle(args, id)
    return {
      status: bundle.status,
      target_kind: 'scene_moment',
      scene_moment_id: id,
      edit_plan: bundle.editPlan,
      context: bundle.context,
      blockers: bundle.blockers,
    }
  }

  const productionId = requiredProductionScopeId(args, 'productionId')
  const bundle = await productionTimelineBundle(args, productionId)
  return {
    status: bundle.blockers.length === 0 ? 'ok' : 'blocked',
    target_kind: 'production',
    production_id: productionId,
    preview_timeline: bundle.previewTimeline,
    edit_plan: bundle.editPlan,
    context: bundle.context,
    blockers: bundle.blockers,
  }
}

export async function domainReadSceneMomentTimeline(args: Args): Promise<unknown> {
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId')
  const bundle = await sceneMomentTimelineBundle(args, sceneMomentId)
  return {
    status: bundle.status,
    scene_moment_id: sceneMomentId,
    edit_plan_status: bundle.editPlan.status,
    edit_plan: bundle.editPlan,
    media_editing_project: bundle.mediaEditingProject,
    compose_inputs: bundle.composeInputs,
  }
}

export async function domainReadContentUnitRuntimePanel(args: Args): Promise<unknown> {
  return service(args).readContentUnitRuntimePanel(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadContentUnitGenerationPrompt(args: Args): Promise<unknown> {
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const result = await service(args).readContentUnitGenerationPrompt(contentUnitId)
  return isRecord(result)
    ? {
        ...result,
        surface: createPromptSurface(args, {
          contentUnitId,
          mode: 'inspect',
          projectId: projectIdFromArgs(args),
        }),
      }
    : result
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
    namespaceKind: stringValue(payload.namespace_kind ?? payload.namespaceKind),
    settingNamespaceKind: stringValue(payload.setting_namespace_kind ?? payload.settingNamespaceKind ?? payload.namespace_kind ?? payload.namespaceKind),
    description: stringValue(payload.description),
    alias: stringValue(payload.alias),
    content: payload.content,
    importance: payload.importance,
  }))
}

export async function domainUpsertSettingState(args: Args): Promise<unknown> {
  const payload = upsertPayloadRecord(args)
  return runtimeMutation(args, (runtime) => runtime.createSettingState({
    id: optionalId(payload.id ?? payload.client_id),
    settingId: optionalId(payload.setting_id ?? payload.settingId ?? payload.setting_ref ?? payload.settingRef),
    title: stringValue(payload.title),
    stateKind: stringValue(payload.state_kind ?? payload.kind),
    namespaceKind: stringValue(payload.namespace_kind ?? payload.namespaceKind),
    settingNamespaceKind: stringValue(payload.setting_namespace_kind ?? payload.settingNamespaceKind ?? payload.namespace_kind ?? payload.namespaceKind),
    description: stringValue(payload.description),
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

export async function domainCertifyAssetProvider(args: Args): Promise<unknown> {
  const provider = providerCertificationProvider(args.provider ?? args.provider_key ?? args.providerKey)
  const runtime = service(args)
  const index = await runtime.loadIndex()
  const assetRef = requiredId(args.assetId ?? args.asset_id ?? args.assetRef ?? args.asset_ref, 'assetId')
  const asset = index.entities.find((entity) => entity.entityKind === 'asset' && (
    sameEntityRef(entity.id, assetRef, 'asset')
    || sameEntityRef(lastPathSegment(entity.path), assetRef, 'asset')
    || normalizeWorkspacePath(entity.path.replace(/\/asset\.json$/, '')) === normalizeWorkspacePath(String(assetRef))
  ))
  if (!asset) throw new Error(`asset not found: ${String(assetRef)}`)

  const selection = resolveAssetRefSelection(index, asset)
  const sourceResourceId = resourceIdFromUnknown(args.resourceId ?? args.resource_id)
    ?? selection.resourceId
    ?? resourceIdFromUnknown(asset.record.resource_id ?? asset.record.resourceId)
  if (sourceResourceId === undefined) {
    throw new Error(`asset ${String(asset.id ?? assetRef)} has no selected asset_ref resource_id; select/adopt the asset_ref candidate before certification`)
  }

  const sourceUrl = getOptionalCertificationString(args.source_url ?? args.sourceUrl ?? args.url)
  const name = getOptionalCertificationString(args.name)
    ?? stringValue(asset.record.title)
    ?? stringValue(asset.record.slot)
    ?? String(asset.id ?? assetRef)
  const projectId = stringValue(args.projectId ?? args.project_id)
  const projectName = getOptionalCertificationString(args.projectName ?? args.project_name) ?? projectId
  const settingId = getOptionalCertificationString(args.settingId ?? args.setting_id)
    ?? stringValue(asset.record.setting_id ?? asset.record.settingId)
    ?? settingIdFromAssetPath(asset.path)
  const model = getOptionalCertificationString(args.model ?? args.model_id ?? args.modelId ?? args.public_model_id ?? args.publicModelId)
  const assetGroupID = getOptionalCertificationString(args.asset_group_id ?? args.assetGroupId ?? args.group_id ?? args.groupId)
  const assetGroupName = getOptionalCertificationString(args.asset_group_name ?? args.assetGroupName ?? args.group_name ?? args.groupName)
  const backendResult = await backendPost(`/provider-assets/providers/${encodeURIComponent(provider)}/certify`, {
    provider,
    resource_id: sourceResourceId,
    ...(selection.candidateId !== undefined ? { source_candidate_id: String(selection.candidateId) } : {}),
    ...(projectId ? { project_id: projectId } : {}),
    ...(projectName ? { project_name: projectName } : {}),
    ...(settingId ? { setting_id: settingId } : {}),
    ...(model ? { model } : {}),
    ...(assetGroupID ? { asset_group_id: assetGroupID } : {}),
    ...(assetGroupName ? { asset_group_name: assetGroupName } : {}),
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    name,
    ...(booleanValue(args.allow_private_urls ?? args.allowPrivateUrls) === true ? { allow_private_urls: true } : {}),
    ...(numberValue(args.timeout_ms ?? args.timeoutMs) !== undefined ? { timeout_ms: numberValue(args.timeout_ms ?? args.timeoutMs) } : {}),
  })
  const certification = isRecord(backendResult?.certification) ? backendResult.certification : undefined
  if (!certification) throw new Error('backend provider asset certification response did not include certification')
  const assetUri = getOptionalCertificationString(certification.asset_uri ?? certification.assetUri)
  if (!assetUri) throw new Error('backend provider asset certification response did not include asset_uri')
  const hubAssetId = getOptionalCertificationString(certification.hub_asset_id ?? certification.hubAssetId)
  const certifiedSourceResourceId = resourceIdFromUnknown(certification.source_resource_id ?? certification.sourceResourceId) ?? sourceResourceId
  const certifiedSourceCandidateId = idFromUnknown(certification.source_candidate_id ?? certification.sourceCandidateId)
    ?? selection.candidateId
  const certifiedProvider = getOptionalCertificationString(certification.provider_id ?? certification.providerId ?? backendResult?.provider_id ?? backendResult?.providerId ?? backendResult?.provider)
    ?? provider
  const normalizedCertification = {
    ...certification,
    provider: certifiedProvider,
    provider_id: certifiedProvider,
    source_resource_id: certifiedSourceResourceId,
    ...(model ? { model, public_model_id: model, provider_model_id: getOptionalCertificationString(certification.provider_model_id ?? certification.providerModelId) ?? model } : {}),
    ...(certifiedSourceCandidateId !== undefined ? { source_candidate_id: certifiedSourceCandidateId } : {}),
  }
  const written = await patchAssetProviderCertification(runtime.projectDir, asset.path, asset.record, certifiedProvider, normalizedCertification)
  invalidateMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args))
  return {
    status: 'succeeded',
    provider: certifiedProvider,
    provider_id: certifiedProvider,
    asset_id: asset.id,
    asset_path: asset.path,
    source_resource_id: certifiedSourceResourceId,
    ...(certifiedSourceCandidateId !== undefined ? { source_candidate_id: certifiedSourceCandidateId } : {}),
    asset_uri: assetUri,
    ...(hubAssetId ? { hub_asset_id: hubAssetId } : {}),
    certification: written.certification,
    path: written.path,
    backend_result: backendResult,
    message: `Certified asset ${String(asset.id ?? assetRef)} for ${certifiedProvider}; downstream generation can resolve resource #${String(certifiedSourceResourceId)} as ${assetUri}.`,
  }
}

export async function domainQueryRemoteAssetGroups(args: Args): Promise<unknown> {
  const provider = providerCertificationProvider(args.provider ?? args.provider_id ?? args.providerId ?? args.provider_key ?? args.providerKey)
  const params = new URLSearchParams()
  const model = getOptionalCertificationString(args.model ?? args.model_id ?? args.modelId ?? args.public_model_id ?? args.publicModelId)
  const projectId = getOptionalCertificationString(args.projectId ?? args.project_id)
  if (model) params.set('model', model)
  if (projectId) params.set('project_id', projectId)
  const suffix = params.toString()
  return backendGet(`/provider-assets/providers/${encodeURIComponent(provider)}/groups${suffix ? `?${suffix}` : ''}`)
}

export async function domainQueryRemoteAssets(args: Args): Promise<unknown> {
  const provider = providerCertificationProvider(args.provider ?? args.provider_id ?? args.providerId ?? args.provider_key ?? args.providerKey)
  const groupRef = requiredId(args.groupId ?? args.group_id ?? args.groupRef ?? args.group_ref ?? args.asset_group_id ?? args.assetGroupId, 'groupId')
  return backendGet(`/provider-assets/providers/${encodeURIComponent(provider)}/groups/${encodeURIComponent(String(groupRef))}/assets`)
}

function settingIdFromAssetPath(path: string | undefined): string | undefined {
  const normalized = normalizeWorkspacePath(path ?? '')
  const parts = normalized.split('/').filter(Boolean)
  const settingsIndex = parts.indexOf('settings')
  if (settingsIndex < 0) return undefined
  return stringValue(parts[settingsIndex + 1])
}

export async function domainUpsertSettingTree(args: Args): Promise<unknown> {
  const settingPayload = requiredRecord(args.setting ?? args.payload, 'setting')
  const stateItems = requiredArray(args.states ?? settingPayload.states, 'states').filter(isRecord)
  return runtimeMutation(args, async (runtime) => {
    const setting = await runtime.createSetting({
      id: optionalId(settingPayload.id ?? settingPayload.client_id),
      title: stringValue(settingPayload.title),
      kind: stringValue(settingPayload.setting_kind ?? settingPayload.kind),
      namespaceKind: stringValue(settingPayload.namespace_kind ?? settingPayload.namespaceKind),
      settingNamespaceKind: stringValue(settingPayload.setting_namespace_kind ?? settingPayload.settingNamespaceKind ?? settingPayload.namespace_kind ?? settingPayload.namespaceKind),
      description: stringValue(settingPayload.description),
      alias: stringValue(settingPayload.alias),
      content: settingPayload.content,
      importance: settingPayload.importance,
    })
    const settingId = entityResultId(setting, settingPayload, 'setting')
    const states = []
    for (const stateItem of stateItems) {
      const statePayload = requiredRecord(stateItem.state ?? stateItem.payload ?? stateItem.record ?? stateItem.entity ?? stateItem, 'state')
      const state = await runtime.createSettingState({
        id: optionalId(statePayload.id ?? statePayload.client_id),
        settingId: optionalId(statePayload.setting_id ?? statePayload.settingId ?? statePayload.setting_ref ?? statePayload.settingRef ?? settingId),
        title: stringValue(statePayload.title),
        stateKind: stringValue(statePayload.state_kind ?? statePayload.kind),
        namespaceKind: stringValue(statePayload.namespace_kind ?? statePayload.namespaceKind),
        settingNamespaceKind: stringValue(statePayload.setting_namespace_kind ?? statePayload.settingNamespaceKind ?? statePayload.namespace_kind ?? statePayload.namespaceKind),
        description: stringValue(statePayload.description),
      })
      const stateId = entityResultId(state, statePayload, 'setting_state')
      const assetItems = Array.isArray(stateItem.assets) ? stateItem.assets.filter(isRecord) : []
      const assets = []
      for (const assetItem of assetItems) {
        const assetPayload = requiredRecord(assetItem.payload ?? assetItem.record ?? assetItem.entity ?? assetItem, 'asset')
        assets.push(await runtime.createAsset({
          id: optionalId(assetPayload.id ?? assetPayload.client_id),
          title: stringValue(assetPayload.title),
          settingId: optionalId(assetPayload.setting_id ?? assetPayload.settingId ?? assetPayload.setting_ref ?? assetPayload.settingRef ?? settingId),
          settingStateId: optionalId(assetPayload.setting_state_id ?? assetPayload.settingStateId ?? assetPayload.setting_state_ref ?? assetPayload.settingStateRef ?? stateId),
          slot: stringValue(assetPayload.slot ?? assetPayload.slot_key ?? assetPayload.slotKey),
          assetKind: stringValue(assetPayload.asset_kind ?? assetPayload.kind),
          promptHint: stringValue(assetPayload.prompt_hint ?? assetPayload.promptHint),
          resourceId: optionalId(assetPayload.resource_id ?? assetPayload.resourceId),
        }))
      }
      states.push({ state, assets })
    }
    return { setting, states }
  })
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

export async function domainUpsertProductionTree(args: Args): Promise<unknown> {
  const productionPayload = requiredRecord(args.production ?? args.payload ?? args.record, 'production')
  const segmentItems = requiredArray(args.segments ?? productionPayload.segments, 'segments').filter(isRecord)
  return runtimeMutation(args, async (runtime) => {
    const productionId = productionIdFrom(args, productionPayload)
    const production = await runtime.createProduction({
      id: productionId,
      title: stringValue(productionPayload.title),
    })
    const segments = []
    for (const segmentItem of segmentItems) {
      const segmentPayload = treePayload(segmentItem, 'segment')
      const segmentId = requiredId(segmentPayload.id ?? segmentPayload.client_id, 'segment.id')
      const segment = await runtime.createSegment({
        productionId,
        id: segmentId,
        title: stringValue(segmentPayload.title),
        kind: stringValue(segmentPayload.segment_kind ?? segmentPayload.kind),
        summary: stringValue(segmentPayload.summary ?? segmentPayload.description),
        order: numberValue(segmentPayload.order),
      })
      const sceneMomentItems = arrayRecords(segmentItem.scene_moments ?? segmentItem.sceneMoments)
      const contentUnitItems = arrayRecords(segmentItem.content_units ?? segmentItem.contentUnits)
      const sceneMoments = []
      const contentUnits = []
      for (const contentUnitItem of contentUnitItems) {
        const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
        contentUnits.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
          productionId,
          segmentId,
          contentUnitType: 'segment_ref',
          outputKind: 'video',
          targetKind: 'segment',
          targetRef: segmentId,
        })))
      }
      for (const sceneMomentItem of sceneMomentItems) {
        const sceneMomentPayload = treePayload(sceneMomentItem, 'scene_moment')
        const sceneMomentId = requiredId(sceneMomentPayload.id ?? sceneMomentPayload.client_id, 'scene_moment.id')
        const sceneMoment = await runtime.createSceneMoment({
          productionId,
          segmentId,
          id: sceneMomentId,
          title: stringValue(sceneMomentPayload.title),
          storyboardId: optionalId(sceneMomentPayload.storyboard_id ?? sceneMomentPayload.storyboardId),
          order: numberValue(sceneMomentPayload.order),
          timeText: stringValue(sceneMomentPayload.time_text ?? sceneMomentPayload.when),
          sceneCode: stringValue(sceneMomentPayload.scene_code),
          locationText: stringValue(sceneMomentPayload.location_text ?? sceneMomentPayload.where),
          conditionText: stringValue(sceneMomentPayload.condition_text),
          actionText: stringValue(sceneMomentPayload.action_text ?? sceneMomentPayload.action),
          mood: stringValue(sceneMomentPayload.mood ?? sceneMomentPayload.emotion),
          description: stringValue(sceneMomentPayload.description),
          settings: settingRefsFromRecord(sceneMomentPayload),
        })
        const sceneContentUnits = []
        for (const contentUnitItem of arrayRecords(sceneMomentItem.content_units ?? sceneMomentItem.contentUnits)) {
          const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
          sceneContentUnits.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
            productionId,
            segmentId,
            sceneMomentId,
            contentUnitType: 'scene_moment_ref',
            outputKind: 'video',
            targetKind: 'scene_moment',
            targetRef: sceneMomentId,
          })))
        }
        const expressionUnits = []
        for (const expressionUnitItem of arrayRecords(sceneMomentItem.expression_units ?? sceneMomentItem.expressionUnits)) {
          const expressionUnitPayload = normalizeExpressionUnitPayload(treePayload(expressionUnitItem, 'expression_unit'))
          const expressionUnitId = requiredId(expressionUnitPayload.id ?? expressionUnitPayload.client_id, 'expression_unit.id')
          const expressionUnit = await runtime.createExpressionUnit({
            productionId,
            segmentId,
            sceneMomentId,
            id: expressionUnitId,
            title: stringValue(expressionUnitPayload.title),
            kind: stringValue(expressionUnitPayload.kind),
            text: stringValue(expressionUnitPayload.text ?? expressionUnitPayload.content),
            intent: stringValue(expressionUnitPayload.intent ?? expressionUnitPayload.summary ?? expressionUnitPayload.description),
            speaker: stringValue(expressionUnitPayload.speaker),
            note: stringValue(expressionUnitPayload.note),
            order: numberValue(expressionUnitPayload.order),
          })
          const expressionContentUnits = []
          for (const contentUnitItem of arrayRecords(expressionUnitItem.content_units ?? expressionUnitItem.contentUnits)) {
            const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
            expressionContentUnits.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
              productionId,
              segmentId,
              sceneMomentId,
              expressionUnitId,
              contentUnitType: 'expression_unit_ref',
              outputKind: 'video',
              targetKind: 'expression_unit',
              targetRef: expressionUnitId,
            })))
          }
          const storyboards = await upsertTreeStoryboards(runtime, expressionUnitItem, { productionId, segmentId, sceneMomentId, expressionUnitId })
          const keyframes = await upsertTreeKeyframes(runtime, expressionUnitItem, { productionId, segmentId, sceneMomentId, expressionUnitId })
          const audioCues = await upsertTreeAudioCues(runtime, expressionUnitItem, { productionId, segmentId, sceneMomentId, expressionUnitId })
          expressionUnits.push({ expressionUnit, contentUnits: expressionContentUnits, storyboards, keyframes, audioCues })
        }
        const storyboards = await upsertTreeStoryboards(runtime, sceneMomentItem, { productionId, segmentId, sceneMomentId })
        const keyframes = await upsertTreeKeyframes(runtime, sceneMomentItem, { productionId, segmentId, sceneMomentId })
        const audioCues = await upsertTreeAudioCues(runtime, sceneMomentItem, { productionId, segmentId, sceneMomentId })
        sceneMoments.push({ sceneMoment, contentUnits: sceneContentUnits, expressionUnits, storyboards, keyframes, audioCues })
      }
      segments.push({ segment, contentUnits, sceneMoments })
    }
    const contentUnits = []
    for (const contentUnitItem of arrayRecords(args.content_units ?? args.contentUnits ?? productionPayload.content_units ?? productionPayload.contentUnits)) {
      const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
      contentUnits.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
        productionId,
        contentUnitType: 'production_ref',
        outputKind: 'video',
        targetKind: 'production',
        targetRef: productionId,
      })))
    }
    return { production, contentUnits, segments }
  })
}

export async function domainUpsertTimelineNamespaceTree(args: Args): Promise<unknown> {
  const namespaceItems = timelineNamespaceTreeItems(args)
  if (namespaceItems.length === 0) throw new Error('namespace, root, tree, nodes, or timeline_namespaces is required')
  return runtimeMutation(args, async (runtime) => {
    const collector: TimelineNamespaceTreeCollector = { namespaces: [], sceneMoments: [], primitives: [], contentUnits: [] }
    const tree = []
    for (const item of namespaceItems) {
      tree.push(await upsertTimelineNamespaceTreeNode(runtime, item, { depth: 0 }, collector))
    }
    return {
      schema: 'movscript.timeline_namespace_tree_upsert_result.v1',
      status: 'upserted',
      tree,
      namespaces: collector.namespaces,
      sceneMoments: collector.sceneMoments,
      primitives: collector.primitives,
      contentUnits: collector.contentUnits,
    }
  })
}

async function upsertTimelineNamespaceTreeNode(
  runtime: MovScriptDomainRuntime,
  item: Record<string, unknown>,
  context: TimelineNamespaceTreeContext,
  collector: TimelineNamespaceTreeCollector,
): Promise<Record<string, unknown>> {
  const payload = treePayload(item, 'namespace')
  const namespaceId = requiredId(payload.id ?? payload.client_id, 'namespace.id')
  const namespaceKind = requiredString(
    payload.namespace_kind
      ?? payload.namespaceKind
      ?? payload.timeline_namespace_kind
      ?? payload.timelineNamespaceKind
      ?? payload.domain_kind
      ?? payload.domainKind
      ?? payload.kind,
    'namespace.namespace_kind',
  )
  const entityKind = timelineNamespaceEntityKind(payload, context)
  const targetPath = timelineNamespaceTargetPath(item, payload, context, entityKind, namespaceId)
  const record = timelineNamespaceRecord(payload, {
    entityKind,
    namespaceId,
    namespaceKind,
  })
  const node = await runtime.writeHierarchyNode({
    category: 'timeline_namespace',
    namespaceKind,
    targetPath,
    record,
  })
  const namespaceSummary = {
    id: namespaceId,
    namespace_kind: namespaceKind,
    entity_kind: entityKind,
    targetPath,
    node,
  }
  collector.namespaces.push(namespaceSummary)

  const contentUnits = []
  for (const contentUnitItem of arrayRecords(item.content_units ?? item.contentUnits ?? payload.content_units ?? payload.contentUnits)) {
    const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
    const contentUnit = await runtime.createContentUnit(timelineNamespaceAssemblyContentUnitInput(contentUnitPayload, {
      namespaceId,
      namespaceKind,
    }))
    contentUnits.push(contentUnit)
    collector.contentUnits.push(contentUnit)
  }

  const sceneMoments = []
  for (const sceneMomentItem of timelineNamespaceSceneMomentItems(item, payload)) {
    sceneMoments.push(await upsertTimelinePrimitiveNode(runtime, sceneMomentItem, {
      spec: TIMELINE_PRIMITIVE_SPECS.scene_moment,
      parentDir: timelineNamespaceNodeDir(targetPath),
    }, collector))
  }

  const children = []
  for (const child of timelineNamespaceChildItems(item, payload)) {
    children.push(await upsertTimelineNamespaceTreeNode(runtime, child, {
      depth: context.depth + 1,
      parentTargetPath: targetPath,
    }, collector))
  }

  return {
    ...namespaceSummary,
    contentUnits,
    sceneMoments,
    children,
  }
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
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment.id ?? sceneMoment.client_id, 'sceneMomentId')
  const pathTarget = sceneMomentPathTarget(args, sceneMoment, sceneMomentId)
  if (pathTarget) {
    const result = await runtimeMutation(args, (runtime) => runtime.writeHierarchyNode({
      targetPath: pathTarget,
      record: sceneMomentHierarchyRecord(sceneMoment, sceneMomentId),
    }))
    return {
      status: 'upserted',
      entityKind: 'scene_moment',
      sceneMomentId,
      targetPath: pathTarget,
      result,
    }
  }
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
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
  const expressionUnit = optionalRecord(args.expressionUnit ?? args.expression_unit)
  const keyframeId = requiredId(args.keyframeId ?? args.keyframe_id ?? keyframe.id ?? keyframe.client_id, 'keyframeId')
  const pathTarget = timelinePrimitivePathTarget(args, keyframe, {
    spec: TIMELINE_PRIMITIVE_SPECS.keyframe,
    id: keyframeId,
  })
  if (pathTarget) {
    return writeTimelinePrimitivePathTarget(args, TIMELINE_PRIMITIVE_SPECS.keyframe, keyframe, keyframeId, pathTarget)
  }
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
  const expressionUnitId = idValue(args.expressionUnitId ?? args.expression_unit_id ?? expressionUnit?.id ?? expressionUnit?.client_id)
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
  const storyboardId = idValue(args.storyboardId ?? args.storyboard_id ?? storyboard.id ?? storyboard.client_id ?? 'main') ?? 'main'
  const pathTarget = timelinePrimitivePathTarget(args, storyboard, {
    spec: TIMELINE_PRIMITIVE_SPECS.storyboard,
    id: storyboardId,
  })
  if (pathTarget) {
    const pathResult = await writeTimelinePrimitivePathTarget(args, TIMELINE_PRIMITIVE_SPECS.storyboard, storyboard, storyboardId, pathTarget)
    return {
      ...pathResult,
      storyboardId,
      storyboardPath: pathTarget,
    }
  }
  const productionId = requiredId(args.productionId ?? args.production_id, 'productionId')
  const segmentId = requiredId(args.segmentId ?? args.segment_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id, 'sceneMomentId')
  const expressionUnitId = idValue(args.expressionUnitId ?? args.expression_unit_id ?? storyboard.expression_unit_id ?? expressionUnit?.id ?? expressionUnit?.client_id)
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
  const audioCueId = requiredId(args.audioCueId ?? args.audio_cue_id ?? audioCue.id ?? audioCue.client_id, 'audioCueId')
  const pathTarget = timelinePrimitivePathTarget(args, audioCue, {
    spec: TIMELINE_PRIMITIVE_SPECS.audio_cue,
    id: audioCueId,
  })
  if (pathTarget) {
    return writeTimelinePrimitivePathTarget(args, TIMELINE_PRIMITIVE_SPECS.audio_cue, audioCue, audioCueId, pathTarget)
  }
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
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
  const expressionUnitId = requiredId(args.expressionUnitId ?? args.expression_unit_id ?? expressionUnit.id ?? expressionUnit.client_id, 'expressionUnitId')
  const pathTarget = timelinePrimitivePathTarget(args, expressionUnit, {
    spec: TIMELINE_PRIMITIVE_SPECS.expression_unit,
    id: expressionUnitId,
  })
  if (pathTarget) {
    return writeTimelinePrimitivePathTarget(args, TIMELINE_PRIMITIVE_SPECS.expression_unit, expressionUnit, expressionUnitId, pathTarget)
  }
  const production = optionalRecord(args.production)
  const segment = optionalRecord(args.segment)
  const sceneMoment = optionalRecord(args.sceneMoment ?? args.scene_moment)
  const productionId = productionIdFrom(args, production)
  const segmentId = requiredId(args.segmentId ?? args.segment_id ?? segment?.id ?? segment?.client_id, 'segmentId')
  const sceneMomentId = requiredId(args.sceneMomentId ?? args.scene_moment_id ?? sceneMoment?.id ?? sceneMoment?.client_id, 'sceneMomentId')
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
  const result = await runtimeMutation(args, (runtime) => runtime.updateContentUnitEditPrompt({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    editPrompt: requiredRecord(args.editPrompt ?? args.edit_prompt, 'editPrompt') as never,
  }))
  const contentUnitId = args.contentUnitId ?? args.content_unit_id
  return {
    status: 'updated',
    result,
    ...(contentUnitId !== undefined ? {
      contentUnitId,
      content_unit_id: contentUnitId,
      surface: createPromptSurface(args, {
        contentUnitId: idValue(contentUnitId),
        mode: 'edit',
        projectId: projectIdFromArgs(args),
      }),
    } : {}),
    secondary_surfaces: [
      createImpactSurface(args, {
        projectId: projectIdFromArgs(args),
        target: contentUnitId === undefined ? undefined : String(contentUnitId),
        source: 'domain_update_content_unit_prompt',
      }),
    ],
  }
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
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const result = await runtimeMutation(args, (runtime) => runtime.createContentCandidate({
    contentUnitId,
    ...(args.candidateId !== undefined || args.candidate_id !== undefined ? { candidateId: idValue(args.candidateId ?? args.candidate_id) } : {}),
    ...(stringValue(args.source) ? { source: stringValue(args.source) } : {}),
    ...(status ? { status } : {}),
    ...(optionalRecord(args.producer) ? { producer: optionalRecord(args.producer) } : {}),
    outputs: requiredArray(args.outputs, 'outputs').filter(isRecord) as never,
    ...(optionalRecord(args.promptSnapshot ?? args.prompt_snapshot) ? { promptSnapshot: optionalRecord(args.promptSnapshot ?? args.prompt_snapshot) } : {}),
  }))
  const visibility = await withContentUnitCandidateVisibility(args, contentUnitId, result, {
    candidate_created: true,
    generation_mode: 'content_unit_candidate',
    will_auto_select: false,
    requires_user_adoption: true,
  })
  return {
    ...visibility,
    surface: createContentCandidatesSurface(args, {
      contentUnitId,
      ...(candidateIdFromArgs(args) ? { candidateId: candidateIdFromArgs(args) } : {}),
      ...(firstOutputResourceId(args.outputs) !== undefined ? { resourceId: firstOutputResourceId(args.outputs)! } : {}),
      projectId: projectIdFromArgs(args),
    }),
  }
}

export async function domainCreateContentCandidateBatch(args: Args): Promise<unknown> {
  return runDomainBatch(args, domainCreateContentCandidate)
}

export async function domainRegisterRawResourceAsContentUnitCandidate(args: Args): Promise<unknown> {
  const resourceId = requiredResourceId(args.resourceId ?? args.resource_id)
  const outputKind = contentCandidateOutputKind(args.outputKind ?? args.output_kind ?? args.kind)
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const candidateId = args.candidateId ?? args.candidate_id ?? `raw_${outputKind}_${resourceId}`
  return domainCreateContentCandidate({
    ...args,
    contentUnitId,
    content_unit_id: contentUnitId,
    candidateId,
    candidate_id: candidateId,
    source: stringValue(args.source) ?? 'manual',
    status: args.status ?? 'imported',
    producer: optionalRecord(args.producer) ?? { kind: 'raw_resource_registration' },
    outputs: [{
      kind: outputKind,
      resource_id: resourceId,
      ...(stringValue(args.mimeType ?? args.mime_type) ? { mime_type: stringValue(args.mimeType ?? args.mime_type) } : {}),
      ...(numberValue(args.width) !== undefined ? { width: numberValue(args.width) } : {}),
      ...(numberValue(args.height) !== undefined ? { height: numberValue(args.height) } : {}),
      ...(numberValue(args.durationSec ?? args.duration_sec) !== undefined ? { duration_sec: numberValue(args.durationSec ?? args.duration_sec) } : {}),
      ...(optionalRecord(args.metadata) ? { metadata: optionalRecord(args.metadata) } : {}),
    }],
  })
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
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const result = await runtimeMutation(args, (runtime) => runtime.selectContentUnitCandidate({
    contentUnitId,
    candidateId: requiredId(args.candidateId ?? args.candidate_id, 'candidateId'),
    ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
    ...(stringValue(args.stalePolicy ?? args.stale_policy) ? { stalePolicy: stringValue(args.stalePolicy ?? args.stale_policy) as never } : {}),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
  }))
  const visibility = await withContentUnitCandidateVisibility(args, contentUnitId, result, {
    adoption: 'selection',
    requires_user_adoption: false,
  })
  return {
    ...visibility,
    surface: createContentCandidatesSurface(args, {
      contentUnitId,
      candidateId: String(requiredId(args.candidateId ?? args.candidate_id, 'candidateId')),
      ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
      projectId: projectIdFromArgs(args),
    }),
    secondary_surfaces: [
      createImpactSurface(args, {
        projectId: projectIdFromArgs(args),
        target: String(contentUnitId),
        source: 'domain_select_content_unit_candidate',
      }),
    ],
  }
}

export async function domainSelectContentUnitCandidateBatch(args: Args): Promise<unknown> {
  return runDomainBatch(args, domainSelectContentUnitCandidate)
}

export async function domainDecideContentUnitCandidate(args: Args): Promise<unknown> {
  const contentUnitId = requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId')
  const decision = requiredDecision(args.decision)
  const result = await runtimeMutation(args, (runtime) => runtime.decideContentUnitCandidate({
    contentUnitId,
    candidateId: requiredId(args.candidateId ?? args.candidate_id, 'candidateId'),
    decision,
    ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
    ...(stringValue(args.stalePolicy ?? args.stale_policy) ? { stalePolicy: stringValue(args.stalePolicy ?? args.stale_policy) as never } : {}),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
    ...(stringValue(args.decidedAt ?? args.decided_at) ? { decidedAt: stringValue(args.decidedAt ?? args.decided_at) } : {}),
    ...(optionalRecord(args.metadata) ? { metadata: optionalRecord(args.metadata) } : {}),
  }))
  const visibility = await withContentUnitCandidateVisibility(args, contentUnitId, result, {
    adoption: decision,
    requires_user_adoption: decision !== 'adopt',
  })
  return {
    ...visibility,
    surface: createContentCandidatesSurface(args, {
      contentUnitId,
      candidateId: String(requiredId(args.candidateId ?? args.candidate_id, 'candidateId')),
      ...(args.resourceId !== undefined || args.resource_id !== undefined ? { resourceId: requiredResourceId(args.resourceId ?? args.resource_id) } : {}),
      projectId: projectIdFromArgs(args),
    }),
    ...(decision === 'adopt' ? {
      secondary_surfaces: [
        createImpactSurface(args, {
          projectId: projectIdFromArgs(args),
          target: String(contentUnitId),
          source: 'domain_decide_content_unit_candidate',
        }),
      ],
    } : {}),
  }
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

export async function domainProductionStatusSummary(args: Args): Promise<unknown> {
  const snapshot = await service(args).loadContentWorkspaceSnapshot()
  const requestedProductionId = args.productionId ?? args.production_id
  const productionIds = requestedProductionId !== undefined
    ? [String(requiredId(requestedProductionId, 'productionId'))]
    : snapshot.productions.map((item) => String(idValue(item.id ?? item.record.id ?? item.record.ID ?? item.path)))
  const contentUnitSummaries = contentSourceWorkspaceContentUnitStatusSummaries(snapshot)
  const editingByProduction = new Map((snapshot.editingTimelines ?? [])
    .filter((item) => item.targetKind === 'production')
    .map((item) => [String(item.targetId), item]))
  const projectTimelineStatus = buildContentSourceWorkspaceProjectTimelineStatus(snapshot, contentUnitSummaries)

  return {
    schema: 'movscript.production_status_summary.v1',
    status: 'ok',
    legacy_alias: true,
    preferred_schema: 'movscript.project_timeline_status.v1',
    namespace_vocabulary: projectTimelineStatus.namespace_vocabulary,
    project_timeline_status: projectTimelineStatus,
    timeline_namespaces: projectTimelineStatus.timeline_namespaces,
    timeline_assemblies: projectTimelineStatus.timeline_assemblies,
    production_count: productionIds.length,
    productions: productionIds.map((productionId) => {
      const production = snapshot.productions.find((item) => sameId(item.id ?? item.record.id ?? item.record.ID, productionId))
      const editing = editingByProduction.get(productionId)
      return {
        production_id: productionId,
        title: stringValue(production?.record.title),
        path: production?.path,
        prerequisites: {
          settings_count: snapshot.settings.length,
          setting_states_count: snapshot.settingStates.length,
          assets_count: snapshot.assets.length,
        },
        storyboards: snapshot.storyboards.map((item) => entityStatusLine(item)),
        keyframes: snapshot.keyframes.map((item) => entityStatusLine(item)),
        content_units: contentUnitSummaries,
        shots_videos: contentUnitSummaries.filter((item) => item.output_kind === 'video' || item.content_unit_type === 'scene_moment_ref' || item.content_unit_type === 'scence_moment_ref'),
        job_status: 'not_tracked_in_domain_summary',
        blocking_refs: Array.isArray(editing?.blockers) ? editing.blockers : [],
        stale_status: contentUnitSummaries.some((item) => item.stale_status === 'stale') ? 'has_stale_selection' : 'ok',
      }
    }),
    surface: createProjectStatusSurface(args, {
      projectId: projectIdFromArgs(args),
      ...(productionIds.length === 1 ? { productionId: productionIds[0] } : {}),
    }),
  }
}

export async function domainInterpret(args: Args): Promise<unknown> {
  return runtimeMutation(args, (runtime) => runtime.interpretWorkspace())
}

export async function domainRegenerationPlan(args: Args): Promise<unknown> {
  const result = await service(args).regenerationPlan()
  return isRecord(result)
    ? {
        ...result,
        surface: createImpactSurface(args, {
          projectId: projectIdFromArgs(args),
          target: stringValue(args.target ?? args.contentUnitId ?? args.content_unit_id),
          source: 'domain_regeneration_plan',
        }),
      }
    : result
}

function service(args: Args) {
  return createMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args))
}

type AssetRefSelection = {
  contentUnitId?: string | number
  contentUnitPath?: string
  candidateId?: string | number
  resourceId?: number
}

function resolveAssetRefSelection(
  index: Awaited<ReturnType<MovScriptDomainRuntime['loadIndex']>>,
  asset: { id?: string | number; path: string; record: Record<string, unknown> },
): AssetRefSelection {
  const assetRef = asset.id ?? lastPathSegment(asset.path)
  const contentUnit = index.entities.find((entity) => entity.entityKind === 'content_unit'
    && entity.record.content_unit_type === 'asset_ref'
    && sameEntityRef(entity.record.asset_ref, assetRef, 'asset'))
  if (!contentUnit) return {}
  const contentUnitPath = contentUnit.path.replace(/\/content_unit\.json$/, '')
  const selection = index.documents.find((document) => {
    if (!isRecord(document.data)) return false
    return document.data.schema === 'movscript.decision_context.v1'
      && document.data.target_kind === 'content_unit'
      && document.data.target_ref === contentUnitPath
  })?.data
  const selectionRecord = isRecord(selection) && isRecord(selection.selection) ? selection.selection : undefined
  return {
    contentUnitId: contentUnit.id,
    contentUnitPath,
    candidateId: idFromUnknown(selectionRecord?.candidate_id ?? selectionRecord?.candidateId),
    resourceId: resourceIdFromUnknown(selectionRecord?.resource_id ?? selectionRecord?.resourceId),
  }
}

async function patchAssetProviderCertification(
  projectDir: string,
  assetPath: string,
  fallbackRecord: Record<string, unknown>,
  provider: string,
  certification: Record<string, unknown>,
): Promise<{ path: string; certification: Record<string, unknown> }> {
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectDir)
  const path = normalizeWorkspacePath(assetPath)
  const current = await fileRepository.read({ path }).then((file) => JSON.parse(file.content) as unknown).catch(() => fallbackRecord)
  if (!isRecord(current)) throw new Error(`asset source is not a JSON object: ${path}`)
  const providerCertifications = isRecord(current.provider_certifications)
    ? { ...current.provider_certifications }
    : {}
  providerCertifications[providerCertificationStorageKey(provider, certification)] = certification
  const next = {
    ...current,
    provider_certifications: providerCertifications,
  }
  await fileRepository.write({ path, content: `${JSON.stringify(next, null, 2)}\n` })
  return {
    path,
    certification,
  }
}

function providerCertificationStorageKey(provider: string, certification: Record<string, unknown>): string {
  const model = getOptionalCertificationString(certification.model ?? certification.public_model_id ?? certification.publicModelId ?? certification.provider_model_id ?? certification.providerModelId)
  return model ? `${provider}::model:${model}` : provider
}

function providerCertificationProvider(value: unknown): string {
  const provider = getOptionalCertificationString(value) ?? 'volcengine_ark_official'
  const normalized = provider.toLowerCase()
  if (normalized === 'jimeng' || normalized === 'jimeng2' || normalized === 'seedance' || normalized === 'seedance2') return 'volcengine_ark_official'
  if (normalized === 'yunwu' || normalized === 'yunwu_gateway') return 'yunwu_gateway'
  return provider
}

function getOptionalCertificationString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idFromUnknown(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function resourceIdFromUnknown(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined
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

function requiredProductionScopeId(args: Args, field: string): string | number {
  if (args.productionId !== undefined || args.production_id !== undefined) {
    return requiredId(args.productionId ?? args.production_id, field)
  }
  const focus = normalizeDomainFocus(args)
  if (focus.scope?.kind === 'production' && focus.scope.ref) return focus.scope.ref
  throw new Error(`Missing required argument: ${field}`)
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

function timelineNamespaceTreeItems(args: Args): Record<string, unknown>[] {
  const arrayValue = args.namespaces ?? args.timeline_namespaces ?? args.timelineNamespaces ?? args.nodes
  const arrayItems = arrayRecords(arrayValue)
  if (arrayItems.length > 0) return arrayItems
  const root = optionalRecord(args.namespace ?? args.root ?? args.tree ?? args.payload ?? args.record)
  return root ? [root] : []
}

function timelineNamespaceEntityKind(
  payload: Record<string, unknown>,
  context: TimelineNamespaceTreeContext,
): TimelineNamespaceEntityKind {
  const explicit = stringValue(payload.entity_kind ?? payload.entityKind ?? payload.source_kind ?? payload.sourceKind)
  if (explicit === 'production' || explicit === 'segment') return explicit
  const targetPath = stringValue(payload.target_path ?? payload.targetPath)
  if (targetPath?.endsWith('/production.json')) return 'production'
  if (targetPath?.endsWith('/segment.json')) return 'segment'
  return context.depth === 0 ? 'production' : 'segment'
}

function timelineNamespaceTargetPath(
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
  context: TimelineNamespaceTreeContext,
  entityKind: TimelineNamespaceEntityKind,
  namespaceId: string | number,
): string {
  const explicit = stringValue(payload.target_path ?? payload.targetPath ?? item.target_path ?? item.targetPath)
  if (explicit) return explicit.replace(/^\/+/, '')
  const idToken = pathToken(namespaceId)
  if (entityKind === 'production' || !context.parentTargetPath) {
    return entityKind === 'production'
      ? `timeline/${idToken}/production.json`
      : `timeline/${idToken}/segment.json`
  }
  return `${timelineNamespaceNodeDir(context.parentTargetPath)}/segments/${idToken}/segment.json`
}

function timelineNamespaceNodeDir(targetPath: string): string {
  return targetPath.replace(/\/(?:production|segment)\.json$/, '')
}

function normalizedSourcePath(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function sourceNodeDir(path: string): string {
  const normalized = normalizedSourcePath(path)
  const namespaceDir = timelineNamespaceNodeDir(normalized)
  if (namespaceDir !== normalized) return namespaceDir
  return normalized.endsWith('.json') ? normalized.replace(/\/[^/]+\.json$/, '') : normalized
}

function timelineNamespaceRecord(
  payload: Record<string, unknown>,
  input: {
    entityKind: TimelineNamespaceEntityKind
    namespaceId: string | number
    namespaceKind: string
  },
): Record<string, unknown> {
  const sanitized = stripNamespaceRecordFields(payload)
  return pruneUndefinedRecord({
    ...sanitized,
    schema: `movscript.${input.entityKind}.v1`,
    kind: input.entityKind,
    id: input.namespaceId,
    title: stringValue(payload.title),
    order: numberValue(payload.order),
    intent: stringValue(payload.intent ?? payload.summary ?? payload.description),
    namespace_kind: input.namespaceKind,
    timeline_namespace_kind: input.namespaceKind,
  })
}

function timelineNamespaceChildItems(
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  return arrayRecords(
    item.children
      ?? item.namespaces
      ?? item.timeline_namespaces
      ?? item.timelineNamespaces
      ?? item.segments
      ?? payload.children
      ?? payload.namespaces
      ?? payload.timeline_namespaces
      ?? payload.timelineNamespaces
      ?? payload.segments,
  )
}

function timelineNamespaceSceneMomentItems(
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  return arrayRecords(item.scene_moments ?? item.sceneMoments ?? payload.scene_moments ?? payload.sceneMoments)
}

function sceneMomentPathTarget(
  args: Args,
  record: Record<string, unknown>,
  sceneMomentId: string | number,
): string | undefined {
  const explicit = stringValue(args.targetPath ?? args.target_path ?? record.targetPath ?? record.target_path)
  if (explicit) return normalizedSourcePath(explicit)
  const namespacePath = stringValue(
    args.namespacePath
      ?? args.namespace_path
      ?? args.timelineNamespacePath
      ?? args.timeline_namespace_path
      ?? args.parentPath
      ?? args.parent_path
      ?? record.namespacePath
      ?? record.namespace_path
      ?? record.timelineNamespacePath
      ?? record.timeline_namespace_path
      ?? record.parentPath
      ?? record.parent_path,
  )
  if (!namespacePath) return undefined
  return `${sourceNodeDir(namespacePath)}/scene_moments/${pathToken(sceneMomentId)}/scene_moment.json`
}

function sceneMomentHierarchyRecord(
  payload: Record<string, unknown>,
  sceneMomentId: string | number,
): Record<string, unknown> {
  return pruneUndefinedRecord({
    ...timelinePrimitiveRecord(payload, TIMELINE_PRIMITIVE_SPECS.scene_moment, sceneMomentId),
    storyboard_id: optionalId(payload.storyboard_id ?? payload.storyboardId),
    time_text: stringValue(payload.time_text ?? payload.timeText ?? payload.when),
    scene_code: stringValue(payload.scene_code ?? payload.sceneCode),
    location_text: stringValue(payload.location_text ?? payload.locationText ?? payload.where),
    condition_text: stringValue(payload.condition_text ?? payload.conditionText),
    action_text: stringValue(payload.action_text ?? payload.actionText ?? payload.action),
    mood: stringValue(payload.mood ?? payload.emotion),
    description: stringValue(payload.description),
    settings: Array.isArray(payload.settings) ? payload.settings : undefined,
    setting_refs: Array.isArray(payload.setting_refs ?? payload.settingRefs)
      ? (payload.setting_refs ?? payload.settingRefs)
      : undefined,
  })
}

function timelinePrimitivePathTarget(
  args: Args,
  record: Record<string, unknown>,
  input: TimelinePrimitivePathInput,
): string | undefined {
  const explicit = stringValue(args.targetPath ?? args.target_path ?? record.targetPath ?? record.target_path)
  if (explicit) return normalizedSourcePath(explicit)
  const parentPath = timelinePrimitiveParentPath(args, record, input.spec)
  if (!parentPath) return undefined
  return `${sourceNodeDir(parentPath)}/${input.spec.collection}/${pathToken(input.id)}/${input.spec.filename}`
}

function timelinePrimitiveParentPath(
  args: Args,
  record: Record<string, unknown>,
  spec: TimelinePrimitiveSpec,
): string | undefined {
  const explicitParent = stringValue(args.parentPath ?? args.parent_path ?? record.parentPath ?? record.parent_path)
  if (explicitParent) return explicitParent
  const expressionUnitPath = stringValue(
    args.expressionUnitPath
      ?? args.expression_unit_path
      ?? record.expressionUnitPath
      ?? record.expression_unit_path,
  )
  if ((spec.entityKind === 'keyframe' || spec.entityKind === 'storyboard') && expressionUnitPath) return expressionUnitPath
  return stringValue(
    args.sceneMomentPath
      ?? args.scene_moment_path
      ?? record.sceneMomentPath
      ?? record.scene_moment_path,
  )
}

async function writeTimelinePrimitivePathTarget(
  args: Args,
  spec: TimelinePrimitiveSpec,
  payload: Record<string, unknown>,
  id: string | number,
  targetPath: string,
): Promise<Record<string, unknown>> {
  const result = await runtimeMutation(args, (runtime) => runtime.writeHierarchyNode({
    targetPath,
    record: timelinePrimitiveRecord(payload, spec, id),
  }))
  return {
    status: 'upserted',
    entityKind: spec.entityKind,
    [`${camelEntityKind(spec.entityKind)}Id`]: id,
    targetPath,
    result,
  }
}

async function upsertTimelinePrimitiveNode(
  runtime: MovScriptDomainRuntime,
  item: Record<string, unknown>,
  input: { spec: TimelinePrimitiveSpec; parentDir: string },
  collector: TimelineNamespaceTreeCollector,
): Promise<Record<string, unknown>> {
  const payload = treePayload(item, input.spec.payloadName)
  const primitiveId = requiredId(payload.id ?? payload.client_id, `${input.spec.payloadName}.id`)
  const targetPath = timelinePrimitiveTargetPath(item, payload, input.parentDir, input.spec, primitiveId)
  const targetRef = timelinePrimitiveRef(targetPath, input.spec)
  const record = timelinePrimitiveRecord(payload, input.spec, primitiveId)
  const node = await runtime.writeHierarchyNode({ targetPath, record })
  const summary = {
    id: primitiveId,
    entity_kind: input.spec.entityKind,
    targetPath,
    targetRef,
    node,
  }
  if (input.spec.entityKind === 'scene_moment') {
    collector.sceneMoments.push(summary)
  } else {
    collector.primitives.push(summary)
  }

  const contentUnits = []
  for (const contentUnitItem of arrayRecords(item.content_units ?? item.contentUnits ?? payload.content_units ?? payload.contentUnits)) {
    const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
    const contentUnit = await runtime.createContentUnit(timelinePrimitiveContentUnitInput(contentUnitPayload, input.spec, targetRef))
    contentUnits.push(contentUnit)
    collector.contentUnits.push(contentUnit)
  }

  const parentDir = timelinePrimitiveNodeDir(targetPath, input.spec)
  const expressionUnits = input.spec.entityKind === 'scene_moment'
    ? await upsertTimelinePrimitiveChildren(runtime, item, payload, parentDir, TIMELINE_PRIMITIVE_SPECS.expression_unit, collector)
    : []
  const storyboards = timelinePrimitiveSupportsSceneChildren(input.spec)
    ? await upsertTimelinePrimitiveChildren(runtime, item, payload, parentDir, TIMELINE_PRIMITIVE_SPECS.storyboard, collector)
    : []
  const keyframes = timelinePrimitiveSupportsSceneChildren(input.spec)
    ? await upsertTimelinePrimitiveChildren(runtime, item, payload, parentDir, TIMELINE_PRIMITIVE_SPECS.keyframe, collector)
    : []
  const audioCues = timelinePrimitiveSupportsSceneChildren(input.spec)
    ? await upsertTimelinePrimitiveChildren(runtime, item, payload, parentDir, TIMELINE_PRIMITIVE_SPECS.audio_cue, collector)
    : []

  return {
    ...summary,
    contentUnits,
    ...(expressionUnits.length > 0 ? { expressionUnits } : {}),
    ...(storyboards.length > 0 ? { storyboards } : {}),
    ...(keyframes.length > 0 ? { keyframes } : {}),
    ...(audioCues.length > 0 ? { audioCues } : {}),
  }
}

async function upsertTimelinePrimitiveChildren(
  runtime: MovScriptDomainRuntime,
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
  parentDir: string,
  spec: TimelinePrimitiveSpec,
  collector: TimelineNamespaceTreeCollector,
): Promise<Record<string, unknown>[]> {
  const children = []
  for (const child of timelinePrimitiveChildItems(item, payload, spec)) {
    children.push(await upsertTimelinePrimitiveNode(runtime, child, { spec, parentDir }, collector))
  }
  return children
}

function timelinePrimitiveChildItems(
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
  spec: TimelinePrimitiveSpec,
): Record<string, unknown>[] {
  const camel = camelCollectionName(spec.collection)
  return arrayRecords(item[spec.collection] ?? item[camel] ?? payload[spec.collection] ?? payload[camel])
}

function timelinePrimitiveSupportsSceneChildren(spec: TimelinePrimitiveSpec): boolean {
  return spec.entityKind === 'scene_moment' || spec.entityKind === 'expression_unit'
}

function timelinePrimitiveTargetPath(
  item: Record<string, unknown>,
  payload: Record<string, unknown>,
  parentDir: string,
  spec: TimelinePrimitiveSpec,
  primitiveId: string | number,
): string {
  const explicit = stringValue(payload.target_path ?? payload.targetPath ?? item.target_path ?? item.targetPath)
  if (explicit) return explicit.replace(/^\/+/, '')
  return `${parentDir}/${spec.collection}/${pathToken(primitiveId)}/${spec.filename}`
}

function timelinePrimitiveRef(targetPath: string, spec: TimelinePrimitiveSpec): string {
  return targetPath.replace(new RegExp(`/${escapeRegExp(spec.filename)}$`), '')
}

function timelinePrimitiveNodeDir(targetPath: string, spec: TimelinePrimitiveSpec): string {
  return timelinePrimitiveRef(targetPath, spec)
}

function timelinePrimitiveRecord(
  payload: Record<string, unknown>,
  spec: TimelinePrimitiveSpec,
  primitiveId: string | number,
): Record<string, unknown> {
  const sanitized = stripTimelinePrimitiveRecordFields(payload)
  return pruneUndefinedRecord({
    ...sanitized,
    schema: `movscript.${spec.entityKind}.v1`,
    kind: spec.entityKind,
    id: primitiveId,
    title: stringValue(payload.title),
    order: numberValue(payload.order),
    ...(spec.entityKind === 'scene_moment'
      ? {
          storyboard_id: optionalId(payload.storyboard_id ?? payload.storyboardId),
          time_text: stringValue(payload.time_text ?? payload.timeText ?? payload.when),
          scene_code: stringValue(payload.scene_code ?? payload.sceneCode),
          location_text: stringValue(payload.location_text ?? payload.locationText ?? payload.where),
          condition_text: stringValue(payload.condition_text ?? payload.conditionText),
          action_text: stringValue(payload.action_text ?? payload.actionText ?? payload.action),
          mood: stringValue(payload.mood ?? payload.emotion),
          description: stringValue(payload.description),
        }
      : {}),
    ...(spec.entityKind === 'expression_unit'
      ? {
          expression_kind: stringValue(payload.expression_kind ?? payload.expressionKind ?? nonSystemKind(payload.kind, spec.entityKind)),
          visual_kind: stringValue(payload.visual_kind ?? payload.visualKind),
          speaker_ref: optionalId(payload.speaker_ref ?? payload.speakerRef),
          source_expression_ref: optionalId(payload.source_expression_ref ?? payload.sourceExpressionRef),
          text: stringValue(payload.text ?? payload.content),
          note: stringValue(payload.note),
          intent: stringValue(payload.intent ?? payload.summary ?? payload.description),
          content: optionalRecord(payload.content),
          timing_intent: optionalRecord(payload.timing_intent ?? payload.timingIntent),
          voice_profile_ref: optionalId(payload.voice_profile_ref ?? payload.voiceProfileRef),
          span: optionalRecord(payload.span),
          script_block_id: optionalId(payload.script_block_id ?? payload.scriptBlockId),
        }
      : {}),
    ...(spec.entityKind === 'storyboard'
      ? {
          visual_intent: stringValue(payload.visual_intent ?? payload.visualIntent ?? payload.prompt_hint ?? payload.promptHint ?? payload.description),
          timeline: optionalRecord(payload.timeline),
          graph: optionalRecord(payload.graph),
        }
      : {}),
    ...(spec.entityKind === 'keyframe'
      ? {
          role: stringValue(payload.role ?? payload.status),
          visual_intent: stringValue(payload.visual_intent ?? payload.visualIntent ?? payload.prompt_hint ?? payload.promptHint ?? payload.description),
          timing: optionalRecord(payload.timing),
          composition: optionalRecord(payload.composition),
          continuity: optionalRecord(payload.continuity),
          reference_asset_refs: Array.isArray(payload.reference_asset_refs ?? payload.referenceAssetRefs)
            ? (payload.reference_asset_refs ?? payload.referenceAssetRefs)
            : undefined,
          reference_keyframe_refs: Array.isArray(payload.reference_keyframe_refs ?? payload.referenceKeyframeRefs)
            ? (payload.reference_keyframe_refs ?? payload.referenceKeyframeRefs)
            : undefined,
        }
      : {}),
    ...(spec.entityKind === 'audio_cue'
      ? {
          cue_kind: stringValue(payload.cue_kind ?? payload.cueKind ?? nonSystemKind(payload.kind, spec.entityKind)),
          storyboard_id: optionalId(payload.storyboard_id ?? payload.storyboardId),
          expression_unit_ref: optionalId(payload.expression_unit_ref ?? payload.expressionUnitRef ?? payload.expression_unit_id ?? payload.expressionUnitId),
          prompt_hint: stringValue(payload.prompt_hint ?? payload.promptHint),
          asset_refs: Array.isArray(payload.asset_refs ?? payload.assetRefs) ? (payload.asset_refs ?? payload.assetRefs) : undefined,
        }
      : {}),
  })
}

function timelinePrimitiveContentUnitInput(
  record: Record<string, unknown>,
  spec: TimelinePrimitiveSpec,
  targetRef: string,
): MovScriptEngineContentUnitInput {
  const input = treeContentUnitInput(record, {
    contentUnitType: spec.contentUnitType,
    outputKind: spec.outputKind,
    targetKind: spec.targetKind,
    targetRef,
    [spec.refField]: targetRef,
  } as MovScriptEngineContentUnitInput)
  if (input.productionId !== undefined || input.segmentId !== undefined) {
    throw new Error('timeline namespace primitive content_units must not use production_ref, production_id, segment_ref, or segment_id')
  }
  if (input.contentUnitType === 'production_ref' || input.contentUnitType === 'segment_ref') {
    throw new Error('timeline namespace primitive content_units must not use content_unit_type=production_ref or segment_ref')
  }
  return {
    ...input,
    productionId: undefined,
    segmentId: undefined,
  }
}

function stripTimelinePrimitiveRecordFields(record: Record<string, unknown>): Record<string, unknown> {
  const forbidden = new Set([
    'content_units',
    'contentUnits',
    'content_unit_type',
    'contentUnitType',
    'expression_units',
    'expressionUnits',
    'storyboards',
    'keyframes',
    'audio_cues',
    'audioCues',
    'target_path',
    'targetPath',
    'namespace_path',
    'namespacePath',
    'timeline_namespace_path',
    'timelineNamespacePath',
    'scene_moment_path',
    'sceneMomentPath',
    'expression_unit_path',
    'expressionUnitPath',
    'parent_path',
    'parentPath',
    'target_category',
    'targetCategory',
    'target_kind',
    'targetKind',
    'target_ref',
    'targetRef',
    'output_kind',
    'outputKind',
    'production_ref',
    'productionRef',
    'production_id',
    'productionId',
    'segment_ref',
    'segmentRef',
    'segment_id',
    'segmentId',
    'content_unit_ref',
    'contentUnitRef',
    'content_unit_refs',
    'contentUnitRefs',
    'content_unit_id',
    'contentUnitId',
    'main_content_unit_id',
    'mainContentUnitId',
    'candidate',
    'candidates',
    'selection',
    'selections',
    'selected_candidate_id',
    'selectedCandidateId',
    'selected_resource_id',
    'selectedResourceId',
    'resource_id',
    'resourceId',
    'client_id',
    'clientId',
    'storyboardId',
    'expression_unit_id',
    'expressionUnitId',
    'expression_unit_ref',
    'expressionUnitRef',
    'timeText',
    'when',
    'sceneCode',
    'locationText',
    'where',
    'conditionText',
    'actionText',
    'action',
    'emotion',
    'expressionKind',
    'visualKind',
    'speakerRef',
    'sourceExpressionRef',
    'timingIntent',
    'voiceProfileRef',
    'scriptBlockId',
    'cueKind',
    'visualIntent',
    'promptHint',
    'referenceAssetRefs',
    'referenceKeyframeRefs',
    'assetRefs',
  ])
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => !forbidden.has(key) && value !== undefined))
}

function nonSystemKind(value: unknown, entityKind: TimelinePrimitiveKind): string | undefined {
  const kind = stringValue(value)
  return kind && kind !== entityKind ? kind : undefined
}

function camelCollectionName(collection: string): string {
  return collection.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function camelEntityKind(entityKind: TimelinePrimitiveKind): string {
  return entityKind.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function timelineNamespaceAssemblyContentUnitInput(
  record: Record<string, unknown>,
  scope: { namespaceId: string | number; namespaceKind: string },
): MovScriptEngineContentUnitInput {
  const explicit = engineContentUnitInputFromRecord(record)
  if (explicit.contentUnitType && explicit.contentUnitType !== 'timeline_assembly_ref') {
    throw new Error('timeline namespace content_units must use content_unit_type=timeline_assembly_ref')
  }
  if (explicit.targetKind && explicit.targetKind !== 'timeline_assembly') {
    throw new Error('timeline namespace content_units must use target_kind=timeline_assembly')
  }
  if (explicit.productionId !== undefined || explicit.segmentId !== undefined) {
    throw new Error('timeline namespace content_units must not use production_ref, production_id, segment_ref, or segment_id')
  }
  const targetRef = explicit.targetRef ?? `timeline_assembly:${scope.namespaceKind}:${scope.namespaceId}`
  return pruneUndefinedRecord({
    ...explicit,
    contentUnitType: 'timeline_assembly_ref',
    outputKind: explicit.outputKind ?? 'video',
    targetCategory: 'timeline_assembly',
    targetKind: 'timeline_assembly',
    targetRef,
    scopeKind: explicit.scopeKind ?? scope.namespaceKind,
    scopeRef: explicit.scopeRef ?? scope.namespaceId,
    productionId: undefined,
    segmentId: undefined,
  }) as MovScriptEngineContentUnitInput
}

function stripNamespaceRecordFields(record: Record<string, unknown>): Record<string, unknown> {
  const forbidden = new Set([
    'children',
    'namespaces',
    'timeline_namespaces',
    'timelineNamespaces',
    'segments',
    'content_units',
    'contentUnits',
    'content_unit_ref',
    'contentUnitRef',
    'content_unit_refs',
    'contentUnitRefs',
    'content_unit_id',
    'contentUnitId',
    'main_content_unit_id',
    'mainContentUnitId',
    'content_unit_type',
    'contentUnitType',
    'target_path',
    'targetPath',
    'target_category',
    'targetCategory',
    'target_kind',
    'targetKind',
    'target_ref',
    'targetRef',
    'output_kind',
    'outputKind',
    'production_ref',
    'productionRef',
    'production_id',
    'productionId',
    'segment_ref',
    'segmentRef',
    'segment_id',
    'segmentId',
    'scene_moment_ref',
    'sceneMomentRef',
    'asset_ref',
    'assetRef',
    'client_id',
    'clientId',
    'namespaceKind',
    'timelineNamespaceKind',
    'domain_kind',
    'domainKind',
    'entity_kind',
    'entityKind',
    'source_kind',
    'sourceKind',
    'candidate',
    'candidates',
    'selection',
    'selections',
    'selected_candidate_id',
    'selectedCandidateId',
    'selected_resource_id',
    'selectedResourceId',
    'resource_id',
    'resourceId',
  ])
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => !forbidden.has(key) && value !== undefined))
}

function pathToken(value: string | number): string {
  const token = String(value).trim().replace(/[\\/#?]+/g, '_').replace(/\s+/g, '_')
  return token || 'node'
}

function treePayload(item: Record<string, unknown>, name: string): Record<string, unknown> {
  return requiredRecord(item[name] ?? item.payload ?? item.record ?? item.entity ?? item, name)
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function treeContentUnitInput(record: Record<string, unknown>, defaults: MovScriptEngineContentUnitInput): MovScriptEngineContentUnitInput {
  const explicitInput = engineContentUnitInputFromRecord(record)
  if (isExplicitTimelineAssemblyContentUnit(explicitInput)) {
    return {
      ...defaults,
      ...explicitInput,
      productionId: explicitInput.productionId,
      segmentId: explicitInput.segmentId,
      sceneMomentId: explicitInput.sceneMomentId,
      expressionUnitId: explicitInput.expressionUnitId,
      storyboardId: explicitInput.storyboardId,
      keyframeId: explicitInput.keyframeId,
      audioCueId: explicitInput.audioCueId,
      assetRef: explicitInput.assetRef,
    }
  }
  return {
    ...defaults,
    ...explicitInput,
  }
}

function isExplicitTimelineAssemblyContentUnit(input: MovScriptEngineContentUnitInput): boolean {
  return input.contentUnitType === 'timeline_assembly_ref'
    || input.targetCategory === 'timeline_assembly'
    || input.targetKind === 'timeline_assembly'
}

async function upsertTreeStoryboards(
  runtime: MovScriptDomainRuntime,
  parent: Record<string, unknown>,
  context: ProductionTreeContext,
): Promise<unknown[]> {
  const output = []
  for (const item of arrayRecords(parent.storyboards)) {
    const storyboard = treePayload(item, 'storyboard')
    const storyboardId = optionalId(storyboard.id ?? storyboard.client_id) ?? 'main'
    output.push(await runtime.createStoryboard({
      productionId: context.productionId,
      segmentId: requiredId(context.segmentId, 'segmentId'),
      sceneMomentId: requiredId(context.sceneMomentId, 'sceneMomentId'),
      ...(context.expressionUnitId ? { expressionUnitId: context.expressionUnitId } : {}),
      id: storyboardId,
      title: stringValue(storyboard.title),
      visualIntent: stringValue(storyboard.visual_intent ?? storyboard.visualIntent ?? storyboard.prompt_hint ?? storyboard.description),
      order: numberValue(storyboard.order),
      timeline: optionalRecord(storyboard.timeline),
      graph: optionalRecord(storyboard.graph),
    }))
    for (const contentUnitItem of arrayRecords(item.content_units ?? item.contentUnits)) {
      const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
      output.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
        productionId: context.productionId,
        segmentId: context.segmentId,
        sceneMomentId: context.sceneMomentId,
        expressionUnitId: context.expressionUnitId,
        storyboardId,
        contentUnitType: 'storyboard_ref',
        outputKind: 'image',
        targetKind: 'storyboard',
        targetRef: storyboardId,
      })))
    }
  }
  return output
}

async function upsertTreeKeyframes(
  runtime: MovScriptDomainRuntime,
  parent: Record<string, unknown>,
  context: ProductionTreeContext,
): Promise<unknown[]> {
  const output = []
  for (const item of arrayRecords(parent.keyframes)) {
    const keyframe = normalizeKeyframePayload(treePayload(item, 'keyframe'))
    const keyframeId = requiredId(keyframe.id ?? keyframe.client_id, 'keyframe.id')
    output.push(await runtime.createKeyframe({
      productionId: context.productionId,
      segmentId: requiredId(context.segmentId, 'segmentId'),
      sceneMomentId: requiredId(context.sceneMomentId, 'sceneMomentId'),
      ...(context.expressionUnitId ? { expressionUnitId: context.expressionUnitId } : {}),
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
    for (const contentUnitItem of arrayRecords(item.content_units ?? item.contentUnits)) {
      const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
      output.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
        productionId: context.productionId,
        segmentId: context.segmentId,
        sceneMomentId: context.sceneMomentId,
        expressionUnitId: context.expressionUnitId,
        keyframeId,
        contentUnitType: 'keyframe_ref',
        outputKind: 'image',
        targetKind: 'keyframe',
        targetRef: keyframeId,
      })))
    }
  }
  return output
}

async function upsertTreeAudioCues(
  runtime: MovScriptDomainRuntime,
  parent: Record<string, unknown>,
  context: ProductionTreeContext,
): Promise<unknown[]> {
  const output = []
  for (const item of arrayRecords(parent.audio_cues ?? parent.audioCues)) {
    const audioCue = normalizeAudioCuePayload(treePayload(item, 'audio_cue'))
    const audioCueId = requiredId(audioCue.id ?? audioCue.client_id, 'audio_cue.id')
    output.push(await runtime.createAudioCue({
      productionId: context.productionId,
      segmentId: requiredId(context.segmentId, 'segmentId'),
      sceneMomentId: requiredId(context.sceneMomentId, 'sceneMomentId'),
      ...(context.expressionUnitId ? { expressionUnitId: context.expressionUnitId } : {}),
      id: audioCueId,
      title: stringValue(audioCue.title),
      kind: stringValue(audioCue.cue_kind ?? audioCue.kind),
      storyboardId: optionalId(audioCue.storyboard_id ?? audioCue.storyboardId),
      promptHint: stringValue(audioCue.prompt_hint ?? audioCue.promptHint),
    }))
    for (const contentUnitItem of arrayRecords(item.content_units ?? item.contentUnits)) {
      const contentUnitPayload = treePayload(contentUnitItem, 'content_unit')
      output.push(await runtime.createContentUnit(treeContentUnitInput(contentUnitPayload, {
        productionId: context.productionId,
        segmentId: context.segmentId,
        sceneMomentId: context.sceneMomentId,
        expressionUnitId: context.expressionUnitId,
        audioCueId,
        contentUnitType: 'expression_unit_ref',
        outputKind: 'audio',
        targetKind: context.expressionUnitId ? 'expression_unit' : 'scene_moment',
        targetRef: context.expressionUnitId ?? context.sceneMomentId,
      })))
    }
  }
  return output
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
    targetCategory: record.target_category ?? record.targetCategory,
    targetKind: record.target_kind ?? record.targetKind,
    targetRef: record.target_ref ?? record.targetRef,
    scopeKind: record.scope_kind ?? record.scopeKind,
    scopeRef: record.scope_ref ?? record.scopeRef,
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

function optionalId(value: unknown): string | number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  return idValue(value)
}

function entityResultId(result: unknown, fallback: Record<string, unknown>, name: string): string | number {
  const resultRecord = isRecord(result) && isRecord(result.record) ? result.record : {}
  return requiredId(resultRecord.id ?? resultRecord.ID ?? fallback.id ?? fallback.client_id, `${name}.id`)
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
  const editPlan = await readSceneMomentEditPlan(args, sceneMomentId)
  if (!isRecord(editPlan)) throw new Error(`scene_moment ${String(sceneMomentId)} edit plan was not found; run domain_interpret first`)
  return editPlan as unknown as MovScriptEditPlanArtifact
}

async function readSceneMomentEditPlan(args: Args, sceneMomentId: string | number): Promise<unknown> {
  return editingServiceTimelineView(args, 'sceneMomentEditPlan', { sceneMomentId })
}

async function readProductionPreviewTimeline(args: Args, productionId: string | number): Promise<WorkspacePreviewTimelineArtifact | undefined> {
  const previewTimeline = await editingServiceTimelineView(args, 'previewTimeline', { productionId })
  return isRecord(previewTimeline)
    ? previewTimeline as unknown as WorkspacePreviewTimelineArtifact
    : undefined
}

async function sceneMomentTimelineBundle(args: Args, sceneMomentId: string | number): Promise<{
  status: string
  mediaEditingProject: MediaEditingProject
  editPlan: MovScriptEditPlanArtifact
  context: Record<string, unknown>
  composeInputs: Array<Record<string, unknown>>
  blockers: Array<Record<string, unknown>>
}> {
  const result = await editingServiceTimelineView(args, 'sceneMomentTimelineBundle', {
    sceneMomentId,
    id: stringValue(args.editingProjectId ?? args.editing_project_id),
    projectId: stringValue(args.timelineProjectId ?? args.timeline_project_id),
    title: stringValue(args.projectName ?? args.project_name ?? args.sceneName ?? args.scene_name),
    defaultDurationMs: msValue(args.defaultDurationMs ?? args.default_duration_ms) ?? secToMs(numberValue(args.defaultDurationSec ?? args.default_duration_sec)),
  })
  if (!isRecord(result)) throw new Error('editing service did not return scene moment timeline bundle')
  const mediaEditingProject = isRecord(result.media_editing_project)
    ? result.media_editing_project as unknown as MediaEditingProject
    : isRecord(result.mediaEditingProject)
      ? result.mediaEditingProject as unknown as MediaEditingProject
      : undefined
  if (!mediaEditingProject) throw new Error('editing service scene moment timeline bundle did not include media_editing_project')
  const editPlan = isRecord(result.edit_plan)
    ? result.edit_plan as unknown as MovScriptEditPlanArtifact
    : isRecord(result.editPlan)
      ? result.editPlan as unknown as MovScriptEditPlanArtifact
      : undefined
  if (!editPlan) throw new Error('editing service scene moment timeline bundle did not include edit_plan')
  const context = isRecord(result.context) ? result.context : {}
  const composeInputs = Array.isArray(result.compose_inputs)
    ? result.compose_inputs.filter(isRecord) as Array<Record<string, unknown>>
    : Array.isArray(result.composeInputs)
      ? result.composeInputs.filter(isRecord) as Array<Record<string, unknown>>
      : []
  const blockers = Array.isArray(result.blockers)
    ? result.blockers.filter(isRecord) as Array<Record<string, unknown>>
    : []
  const status = stringValue(result.status) ?? (blockers.length === 0 ? 'ok' : 'blocked')
  return { status, mediaEditingProject, editPlan, context, composeInputs, blockers }
}

async function productionTimelineBundle(args: Args, productionId: string | number): Promise<{
  previewTimeline: WorkspacePreviewTimelineArtifact | undefined
  mediaEditingProject: MediaEditingProject
  editPlan: MovScriptEditPlanArtifact
  context: Record<string, unknown>
  composeInputs: Array<Record<string, unknown>>
  clips: ProductionTimelineClip[]
  blockers: Array<Record<string, unknown>>
}> {
  const result = await editingServiceTimelineView(args, 'productionTimelineBundle', {
    productionId,
    title: stringValue(args.projectName ?? args.project_name),
    now: stringValue(args.now),
    defaultDurationMs: msValue(args.defaultDurationMs ?? args.default_duration_ms) ?? secToMs(numberValue(args.defaultDurationSec ?? args.default_duration_sec)) ?? 4000,
  })
  if (!isRecord(result)) throw new Error('editing service did not return production timeline bundle')
  const mediaEditingProject = isRecord(result.media_editing_project)
    ? result.media_editing_project as unknown as MediaEditingProject
    : isRecord(result.mediaEditingProject)
      ? result.mediaEditingProject as unknown as MediaEditingProject
      : undefined
  if (!mediaEditingProject) throw new Error('editing service production timeline bundle did not include media_editing_project')
  const editPlan = isRecord(result.edit_plan)
    ? result.edit_plan as unknown as MovScriptEditPlanArtifact
    : isRecord(result.editPlan)
      ? result.editPlan as unknown as MovScriptEditPlanArtifact
      : undefined
  if (!editPlan) throw new Error('editing service production timeline bundle did not include edit_plan')
  const previewTimeline = isRecord(result.preview_timeline)
    ? result.preview_timeline as unknown as WorkspacePreviewTimelineArtifact
    : isRecord(result.previewTimeline)
      ? result.previewTimeline as unknown as WorkspacePreviewTimelineArtifact
      : undefined
  const context = isRecord(result.context) ? result.context : {}
  const composeInputs = Array.isArray(result.compose_inputs)
    ? result.compose_inputs.filter(isRecord) as Array<Record<string, unknown>>
    : Array.isArray(result.composeInputs)
      ? result.composeInputs.filter(isRecord) as Array<Record<string, unknown>>
      : []
  const clips = Array.isArray(result.clips) ? result.clips as ProductionTimelineClip[] : []
  const blockers = Array.isArray(result.blockers)
    ? result.blockers.filter(isRecord) as Array<Record<string, unknown>>
    : []
  return { previewTimeline, mediaEditingProject, editPlan, context, composeInputs, clips, blockers }
}

function contentCandidateRecordsByContentUnitId(documents: ContentSourceWorkspaceSnapshot['indexDocuments']): Map<string, ContentCandidateRecord[]> {
  const output = new Map<string, ContentCandidateRecord[]>()
  for (const document of documents) {
    if (document.path.endsWith('/content_candidate.json') && isRecord(document.data)) {
      const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.content_unit_ref))
      if (!contentUnitId) continue
      appendContentCandidateRecord(output, contentUnitId, document.data as ContentCandidateRecord)
      continue
    }
    if (!isContentUnitDecisionContextRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringValue(document.data.target_ref))
    if (!contentUnitId) continue
    for (const candidate of Array.isArray(document.data.candidates) ? document.data.candidates : []) {
      const record = normalizeDecisionContentCandidateRecord(candidate, contentUnitId)
      if (record) appendContentCandidateRecord(output, contentUnitId, record)
    }
  }
  return output
}

function appendContentCandidateRecord(
  output: Map<string, ContentCandidateRecord[]>,
  contentUnitId: string,
  candidate: ContentCandidateRecord,
): void {
  const candidates = output.get(contentUnitId) ?? []
  const candidateId = idFromUnknown(candidate.id)
  if (candidateId === undefined) {
    output.set(contentUnitId, [...candidates, candidate])
    return
  }
  const existingIndex = candidates.findIndex((existing) => sameId(existing.id, candidateId))
  if (existingIndex < 0) {
    output.set(contentUnitId, [...candidates, candidate])
    return
  }
  output.set(contentUnitId, [
    ...candidates.slice(0, existingIndex),
    mergeContentCandidateRecords(candidates[existingIndex], candidate),
    ...candidates.slice(existingIndex + 1),
  ])
}

function normalizeDecisionContentCandidateRecord(candidate: unknown, contentUnitId: string): ContentCandidateRecord | undefined {
  if (!isRecord(candidate) || idFromUnknown(candidate.id) === undefined) return undefined
  return {
    ...candidate,
    content_unit_ref: stringValue(candidate.content_unit_ref) ?? `content_units/${contentUnitId}`,
  } as ContentCandidateRecord
}

function mergeContentCandidateRecords(existing: ContentCandidateRecord, incoming: ContentCandidateRecord): ContentCandidateRecord {
  const merged: ContentCandidateRecord = { ...existing, ...incoming }
  if (!Array.isArray(incoming.outputs) && Array.isArray(existing.outputs)) merged.outputs = existing.outputs
  if (!isRecord(incoming.producer) && isRecord(existing.producer)) merged.producer = existing.producer
  if (!isRecord(incoming.prompt_snapshot) && isRecord(existing.prompt_snapshot)) merged.prompt_snapshot = existing.prompt_snapshot
  if (!stringValue(incoming.status) && stringValue(existing.status)) merged.status = existing.status
  if (!stringValue(incoming.source) && stringValue(existing.source)) merged.source = existing.source
  if (!stringValue(incoming.created_at) && stringValue(existing.created_at)) merged.created_at = existing.created_at
  if (!stringValue(incoming.content_unit_ref) && stringValue(existing.content_unit_ref)) merged.content_unit_ref = existing.content_unit_ref
  return merged
}

function isContentUnitDecisionContextRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.schema === 'movscript.decision_context.v1'
    && value.target_kind === 'content_unit'
}

async function withContentUnitCandidateVisibility(
  args: Args,
  contentUnitId: string | number,
  result: unknown,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const status = await readContentUnitCandidateVisibility(args, contentUnitId).catch((error) => ({
    visibility_error: errorMessage(error),
    content_unit_candidates: [],
    selected_candidate: undefined,
    selected_raw_resource: undefined,
    stale_status: 'unknown',
    frontend: { visible_in_panel: false, refresh_required: true },
  }))
  return {
    status: 'ok',
    contentUnitId,
    content_unit_id: contentUnitId,
    result,
    ...status,
    ...extra,
  }
}

export async function readContentUnitCandidateVisibility(args: Args, contentUnitId: string | number): Promise<Record<string, unknown>> {
  const snapshot = await service(args).loadContentWorkspaceSnapshot()
  const candidates = contentCandidateRecordsByContentUnitId(snapshot.indexDocuments).get(String(contentUnitId)) ?? []
  const selection = selectionRecordsByContentUnitId(snapshot.indexDocuments).get(String(contentUnitId))
  const selectedCandidate = selection?.candidate_id !== undefined
    ? candidates.find((candidate) => sameId(candidate.id, selection.candidate_id))
    : undefined
  const selectedResourceId = numberValue(selection?.resource_id) ?? numberValue(firstCandidateOutput(selectedCandidate)?.resource_id)
  return {
    content_unit_candidates: candidates,
    candidate_count: candidates.length,
    selected_candidate: selectedCandidate,
    selected_raw_resource: selectedResourceId === undefined ? undefined : { resource_id: selectedResourceId },
    stale_status: stringValue(selection?.stale_policy) === 'accept_stale' ? 'accepted_stale' : 'ok',
    frontend: {
      visible_in_panel: candidates.length > 0,
      refresh_required: true,
    },
  }
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

function entityStatusLine(entity: ContentSourceWorkspaceSnapshot['storyboards'][number]): Record<string, unknown> {
  return {
    id: idValue(entity.id ?? entity.record.id ?? entity.record.ID ?? entity.path),
    title: stringValue(entity.record.title),
    path: entity.path,
  }
}

function contentCandidateOutputKind(value: unknown): 'image' | 'video' | 'audio' | 'text' | 'metadata' {
  const kind = stringValue(value)
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text' || kind === 'metadata') return kind
  return 'image'
}

function firstCandidateOutput(candidate: ContentCandidateRecord | undefined): Record<string, unknown> | undefined {
  const outputs = Array.isArray(candidate?.outputs) ? candidate.outputs : []
  return outputs.find(isRecord)
}

function firstOutputResourceId(outputs: unknown): number | undefined {
  const items = Array.isArray(outputs) ? outputs : []
  for (const item of items) {
    if (!isRecord(item)) continue
    const resourceId = numberValue(item.resource_id ?? item.resourceId)
    if (resourceId !== undefined && Number.isInteger(resourceId) && resourceId > 0) return resourceId
  }
  return undefined
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

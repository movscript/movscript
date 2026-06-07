import {
  createNodeMovScriptWorkspaceService,
  resolveMovScriptProjectWorkspacePaths,
} from '../../../../workspace/node/index.js'
import { resolveMCPDefaultWorkspaceDir } from '../workspace/dir.js'
import { isRecord, stringValue } from '../../../tools/shared/record.js'
import type { SemanticEntityKind } from '../../../../workspace/domain/index.js'

type Args = Record<string, unknown>

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

export async function domainCompileContentGenerationPrompt(args: Args): Promise<unknown> {
  return service(args).compileContentGenerationPrompt(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainReadPreviewTimeline(args: Args): Promise<unknown> {
  return service(args).readPreviewTimeline(requiredId(args.productionId ?? args.production_id, 'productionId'))
}

export async function domainReadContentGenerationPrompt(args: Args): Promise<unknown> {
  return service(args).readContentGenerationPrompt(requiredId(args.contentUnitId ?? args.content_unit_id, 'contentUnitId'))
}

export async function domainUpsertProjectStandards(args: Args): Promise<unknown> {
  return service(args).upsertProjectStandards({
    ...projectScope(args),
    record: optionalRecord(args.record),
    projectStyle: requiredRecord(args.projectStyle ?? args.project_style, 'projectStyle'),
  })
}

export async function domainUpsertSetting(args: Args): Promise<unknown> {
  return service(args).upsertSetting({
    ...projectScope(args),
    entity: optionalRecord(args.entity) as never,
    record: optionalRecord(args.record),
    payload: requiredRecord(args.payload, 'payload'),
  })
}

export async function domainUpsertAsset(args: Args): Promise<unknown> {
  return service(args).upsertAsset({
    ...projectScope(args),
    entity: optionalRecord(args.entity) as never,
    record: optionalRecord(args.record),
    payload: requiredRecord(args.payload, 'payload'),
  })
}

export async function domainUpsertScript(args: Args): Promise<unknown> {
  return service(args).upsertScript({
    ...projectScope(args),
    scriptId: requiredId(args.scriptId ?? args.script_id, 'scriptId'),
    record: optionalRecord(args.record),
    sourceText: requiredString(args.sourceText ?? args.source_text, 'sourceText'),
    ...(optionalRecord(args.metadata) ? { metadata: optionalRecord(args.metadata) } : {}),
  })
}

export async function domainReadScriptSource(args: Args): Promise<unknown> {
  return service(args).readScriptSource({
    record: requiredRecord(args.record, 'record'),
    ...(optionalRecord(args.entity) ? { entity: optionalRecord(args.entity) as never } : {}),
  })
}

export async function domainSnapshotScriptVersion(args: Args): Promise<unknown> {
  return service(args).snapshotScriptVersionFromMarkdown({
    scriptId: requiredId(args.scriptId ?? args.script_id, 'scriptId'),
    versionId: requiredId(args.versionId ?? args.version_id, 'versionId'),
    ...(stringValue(args.versionLabel ?? args.version_label) ? { versionLabel: stringValue(args.versionLabel ?? args.version_label) } : {}),
    ...(stringValue(args.sourcePath ?? args.source_path) ? { sourcePath: stringValue(args.sourcePath ?? args.source_path) } : {}),
  })
}

export async function domainUpsertContentUnit(args: Args): Promise<unknown> {
  return service(args).upsertContentUnit({
    ...projectScope(args),
    unit: requiredRecord(args.unit, 'unit'),
    ...(Array.isArray(args.keyframes) ? { keyframes: args.keyframes.filter(isRecord) } : {}),
  })
}

export async function domainUpdateContentUnitPrompt(args: Args): Promise<unknown> {
  return service(args).updateContentUnitEditablePrompt({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    editablePrompt: requiredRecord(args.editablePrompt ?? args.editable_prompt, 'editablePrompt'),
  })
}

export async function domainUpdateSceneMomentTiming(args: Args): Promise<unknown> {
  return service(args).updateSceneMomentStoryboardTiming({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    items: requiredArray(args.items, 'items') as never,
    ...(optionalRecord(args.audio) ? { audio: optionalRecord(args.audio) as never } : {}),
    ...(optionalRecord(args.transition) ? { transition: optionalRecord(args.transition) as never } : {}),
    ...(stringValue(args.activeStoryboardId ?? args.active_storyboard_id) ? { activeStoryboardId: stringValue(args.activeStoryboardId ?? args.active_storyboard_id) } : {}),
  })
}

export async function domainUpdateStoryboardShotPlans(args: Args): Promise<unknown> {
  return service(args).updateStoryboardShotPlans({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    shotPlans: requiredArray(args.shotPlans ?? args.shot_plans, 'shotPlans').filter(isRecord),
  })
}

export async function domainAppendCandidate(args: Args): Promise<unknown> {
  return service(args).appendCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    payload: requiredRecord(args.payload, 'payload') as never,
    ...(args.lock !== undefined ? { lock: args.lock as never } : {}),
    ...(stringValue(args.nonce) ? { nonce: stringValue(args.nonce) } : {}),
  })
}

export async function domainSelectCandidate(args: Args): Promise<unknown> {
  return service(args).selectCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    candidateId: requiredString(args.candidateId ?? args.candidate_id, 'candidateId'),
    ...(stringValue(args.reason) ? { reason: stringValue(args.reason) } : {}),
  })
}

export async function domainUpdateCandidate(args: Args): Promise<unknown> {
  return service(args).updateCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
    candidateId: requiredString(args.candidateId ?? args.candidate_id, 'candidateId'),
    payload: requiredRecord(args.payload, 'payload') as never,
  })
}

export async function domainUnlockCandidate(args: Args): Promise<unknown> {
  return service(args).unlockCandidate({
    targetPath: requiredString(args.targetPath ?? args.target_path, 'targetPath'),
    targetKind: requiredTargetKind(args),
  })
}

export async function domainDeleteEntity(args: Args): Promise<unknown> {
  await service(args).deleteEntity({
    entity: optionalRecord(args.entity) as never,
    record: optionalRecord(args.record) ?? {},
  })
  return { status: 'deleted' }
}

export async function domainReview(args: Args): Promise<unknown> {
  return service(args).reviewWorkspace?.()
}

export async function domainBuild(args: Args): Promise<unknown> {
  return service(args).buildWorkspace?.()
}

function service(args: Args) {
  return createNodeMovScriptWorkspaceService({
    projectDir: undefined,
    workspaceDir: stringValue(args.workspaceDir ?? args.workspace_dir) ?? resolveMCPDefaultWorkspaceDir(),
    ...(args.userId !== undefined || args.user_id !== undefined ? { userId: idValue(args.userId ?? args.user_id) } : {}),
    ...(args.orgId !== undefined || args.org_id !== undefined ? { orgId: idValue(args.orgId ?? args.org_id) } : {}),
    ...(args.projectId !== undefined || args.project_id !== undefined ? { projectId: idValue(args.projectId ?? args.project_id) } : {}),
  })
}

export async function domainProjectWorkspaceDir(args: Args): Promise<string> {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? resolveMCPDefaultWorkspaceDir()
  return resolveMovScriptProjectWorkspacePaths({
    workspaceDir,
    ...(args.userId !== undefined || args.user_id !== undefined ? { userId: idValue(args.userId ?? args.user_id) } : {}),
    ...(args.orgId !== undefined || args.org_id !== undefined ? { orgId: idValue(args.orgId ?? args.org_id) } : {}),
    ...(args.projectId !== undefined || args.project_id !== undefined ? { projectId: idValue(args.projectId ?? args.project_id) } : {}),
  }).projectDir
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

function projectScope(args: Args): Record<string, string | number> {
  return args.projectId !== undefined || args.project_id !== undefined ? { projectId: idValue(args.projectId ?? args.project_id) } : {}
}

function requiredTargetKind(args: Args): 'asset' | 'keyframe' | 'content_unit' {
  const value = requiredString(args.targetKind ?? args.target_kind, 'targetKind')
  if (value === 'asset' || value === 'keyframe' || value === 'content_unit') return value
  throw new Error('targetKind must be asset, keyframe, or content_unit')
}

function semanticKind(value: unknown): SemanticEntityKind | undefined {
  return stringValue(value) as SemanticEntityKind | undefined
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(`${name} is required`)
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

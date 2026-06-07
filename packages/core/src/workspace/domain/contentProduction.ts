import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '../indexer/index.js'
import { queryMovScriptWorkspaceEntities } from '../indexer/index.js'

export interface ContentProductionContext {
  contentUnit: MovScriptWorkspaceIndexedEntity
  projectStandards?: MovScriptWorkspaceIndexedEntity
  sceneMoment?: MovScriptWorkspaceIndexedEntity
  storyboard?: MovScriptWorkspaceIndexedEntity
  writingExpressions: MovScriptWorkspaceIndexedEntity[]
  sceneKeyframes: MovScriptWorkspaceIndexedEntity[]
  contentUnitKeyframes: MovScriptWorkspaceIndexedEntity[]
  settings: MovScriptWorkspaceIndexedEntity[]
  settingStates: MovScriptWorkspaceIndexedEntity[]
  assets: MovScriptWorkspaceIndexedEntity[]
}

export interface ContentGenerationPromptBundle {
  contentUnitId?: string | number
  unitKind?: string
  prompt: string
  negativePrompt?: string
  notes?: string
  references: ContentGenerationReferenceBundle
  context: {
    projectStandards?: Record<string, unknown>
    sceneMoment?: Record<string, unknown>
    storyboard?: Record<string, unknown>
    shotPlans: Record<string, unknown>[]
    writingExpressions: Record<string, unknown>[]
    settingRefs: Record<string, unknown>[]
    sceneKeyframes: Record<string, unknown>[]
    contentUnitKeyframes: Record<string, unknown>[]
    assets: Record<string, unknown>[]
  }
  constraints: Record<string, unknown>
}

export interface ContentGenerationReferenceBundle {
  assets: ContentGenerationReferenceResource[]
  sceneKeyframes: ContentGenerationReferenceResource[]
  contentUnitKeyframes: ContentGenerationReferenceResource[]
  contentUnitResult?: ContentGenerationReferenceResource
}

export interface ContentGenerationReferenceResource {
  sourceKind: 'asset' | 'keyframe' | 'content_unit'
  sourceId?: string | number
  sourcePath: string
  candidateId?: string | number
  resourceId?: string | number
  locked: boolean
}

export function prepareContentProductionContext(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitId: string | number,
): ContentProductionContext {
  const contentUnit = queryMovScriptWorkspaceEntities(index, {
    entityKind: 'content_unit',
    contentUnitId,
    limit: 1,
  })[0] ?? queryMovScriptWorkspaceEntities(index, {
    entityKind: 'content_unit',
    limit: undefined,
  }).find((entity) => sameId(entity.id, contentUnitId))
  if (!contentUnit) throw new Error(`Content unit not found: ${contentUnitId}`)

  const projectStandards = queryMovScriptWorkspaceEntities(index, { entityKind: 'project_standards', limit: 1 })[0]
  const sourceContext = recordField(contentUnit.record.source_context)
  const sceneMomentRef = stringField(sourceContext?.scene_moment_ref)
  const storyboardRef = stringField(sourceContext?.storyboard_ref)
  const sceneMoment = findEntityByPathOrId(index, 'scene_moment', sceneMomentRef)
  const storyboard = findEntityByPathOrId(index, 'storyboard', storyboardRef)
  const storyboardDir = storyboard?.path.replace(/\/storyboard\.json$/, '')
  const writingExpressions = storyboardDir
    ? queryMovScriptWorkspaceEntities(index, { entityKind: 'writing_expression' })
      .filter((entity) => entity.path.startsWith(`${storyboardDir}/writing_expressions/`))
    : []
  const storyboardSettingRefs = arrayField(storyboard?.record.setting_refs).filter(isRecord)
  const settingIds = new Set(storyboardSettingRefs.map((ref) => stringField(ref.setting_id)).filter(isString))
  const settingStateIds = new Set(storyboardSettingRefs.map((ref) => stringField(ref.setting_state_id)).filter(isString))

  const settings = queryMovScriptWorkspaceEntities(index, { entityKind: 'setting' })
    .filter((entity) => entity.id !== undefined && settingIds.has(String(entity.id)))
  const settingStates = queryMovScriptWorkspaceEntities(index, { entityKind: 'setting_state' })
    .filter((entity) => entity.id !== undefined && settingStateIds.has(String(entity.id)))
  const assets = queryMovScriptWorkspaceEntities(index, { entityKind: 'asset' })
    .filter((entity) => entityMatchesAnyPathPrefix(entity, [...settings, ...settingStates]))
  const sceneMomentDir = sceneMoment?.path.replace(/\/scene_moment\.json$/, '')
  const sceneKeyframes = sceneMomentDir
    ? queryMovScriptWorkspaceEntities(index, { entityKind: 'keyframe' })
      .filter((entity) => entity.path.startsWith(`${sceneMomentDir}/keyframes/`))
    : []
  const contentUnitKeyframes = queryMovScriptWorkspaceEntities(index, { entityKind: 'keyframe' })
    .filter((entity) => entity.path.includes(`content_units/${contentUnit.id}/keyframes/`) || sameId(entity.record.content_unit_id, contentUnit.id))

  return {
    contentUnit,
    ...(projectStandards ? { projectStandards } : {}),
    sceneMoment,
    storyboard,
    writingExpressions,
    sceneKeyframes,
    contentUnitKeyframes,
    settings,
    settingStates,
    assets,
  }
}

export function compileContentGenerationPromptBundle(context: ContentProductionContext): ContentGenerationPromptBundle {
  const contentUnit = context.contentUnit.record
  const editablePrompt = recordField(contentUnit.editable_prompt)
  const storyboard = context.storyboard?.record
  const shotPlans = arrayField(storyboard?.shot_plans).filter(isRecord)
  const contentUnitResult = referenceResourceForEntity(context.contentUnit, 'content_unit')

  return {
    contentUnitId: context.contentUnit.id,
    unitKind: stringField(contentUnit.unit_kind),
    prompt: stringField(editablePrompt?.prompt) ?? '',
    negativePrompt: stringField(editablePrompt?.negative_prompt),
    notes: stringField(editablePrompt?.notes),
    references: {
      assets: context.assets.map((entity) => referenceResourceForEntity(entity, 'asset')).filter(isDefined),
      sceneKeyframes: context.sceneKeyframes.map((entity) => referenceResourceForEntity(entity, 'keyframe')).filter(isDefined),
      contentUnitKeyframes: context.contentUnitKeyframes.map((entity) => referenceResourceForEntity(entity, 'keyframe')).filter(isDefined),
      ...(contentUnitResult ? { contentUnitResult } : {}),
    },
    context: {
      projectStandards: context.projectStandards?.record,
      sceneMoment: context.sceneMoment?.record,
      storyboard,
      shotPlans,
      writingExpressions: context.writingExpressions.map((entity) => entity.record),
      settingRefs: arrayField(storyboard?.setting_refs).filter(isRecord),
      sceneKeyframes: context.sceneKeyframes.map((entity) => entity.record),
      contentUnitKeyframes: context.contentUnitKeyframes.map((entity) => entity.record),
      assets: context.assets.map((entity) => entity.record),
    },
    constraints: recordField(contentUnit.generation_constraints) ?? {},
  }
}

function referenceResourceForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  sourceKind: ContentGenerationReferenceResource['sourceKind'],
): ContentGenerationReferenceResource | undefined {
  const candidates = arrayField(entity.record.candidates).filter(isRecord)
  const lock = recordField(entity.record.lock)
  const lockedCandidateId = idField(lock?.candidate_id)
  const lockedCandidate = lockedCandidateId === undefined
    ? undefined
    : candidates.find((candidate) => sameId(candidate.id, lockedCandidateId))
  const candidate = lockedCandidate ?? candidates[0]
  const candidateId = idField(candidate?.id) ?? lockedCandidateId
  const resourceId = idField(lock?.resource_id) ?? idField(candidate?.resource_id)
  if (candidateId === undefined && resourceId === undefined) return undefined
  return {
    sourceKind,
    ...(entity.id !== undefined ? { sourceId: entity.id } : {}),
    sourcePath: entity.path,
    ...(candidateId !== undefined ? { candidateId } : {}),
    ...(resourceId !== undefined ? { resourceId } : {}),
    locked: lock !== undefined && (lockedCandidateId !== undefined || idField(lock.resource_id) !== undefined),
  }
}

function findEntityByPathOrId(
  index: MovScriptWorkspaceDomainIndex,
  entityKind: 'scene_moment' | 'storyboard',
  ref: string | undefined,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (!ref) return undefined
  const normalizedRef = ref.replace(/\/+$/, '')
  return queryMovScriptWorkspaceEntities(index, { entityKind })
    .find((entity) => entity.path.replace(/\/[^/]+\.json$/, '') === normalizedRef || entity.path === `${normalizedRef}/${entityKind}.json` || sameId(entity.id, ref))
}

function entityMatchesAnyPathPrefix(entity: MovScriptWorkspaceIndexedEntity, owners: MovScriptWorkspaceIndexedEntity[]): boolean {
  return owners.some((owner) => entity.path.startsWith(owner.path.replace(/\/[^/]+\.json$/, '/')))
}

function sameId(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return false
  return String(left) === String(right)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

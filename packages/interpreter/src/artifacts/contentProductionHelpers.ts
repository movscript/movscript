import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { queryMovScriptWorkspaceEntities } from '@movscript/workspace/indexer'
import { sameEntityRef } from '@movscript/workspace/layout'
import type {
  AdapterDependencies,
  ContentUnitOutputKind,
  ContentUnitPromptRef,
  ContentUnitPromptRefKind,
  ContentUnitProviderAssetCertification,
  ContentUnitResolvedRef,
  ContentUnitUpstreamSelection,
} from './contentProductionTypes.js'

export function contentUnitKeyframes(
  index: MovScriptWorkspaceDomainIndex,
  contentUnit: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity[] {
  const refs = [
    ...arrayField(contentUnit.record.keyframe_refs),
    ...(idField(contentUnit.record.keyframe_ref) !== undefined ? [contentUnit.record.keyframe_ref] : []),
  ]
  const byKey = new Map<string, MovScriptWorkspaceIndexedEntity>()
  for (const keyframe of refs.map((ref) => findEntityByRef(index, 'keyframe', ref)).filter(isDefined)) {
    byKey.set(entityKey(keyframe), keyframe)
  }
  return [...byKey.values()].sort((left, right) => String(left.id ?? left.path).localeCompare(String(right.id ?? right.path)))
}

export function resolveAssetRefSelections(
  index: MovScriptWorkspaceDomainIndex,
  refs: unknown[],
): ContentUnitUpstreamSelection[] {
  const assetRefs = refs.map(idField).filter(isDefined)
  const assetRefUnits = queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
    .filter((entity) => entity.record.content_unit_type === 'asset_ref'
      && assetRefs.some((ref) => sameEntityRef(entity.record.asset_ref, ref, 'asset')))
  return assetRefUnits.flatMap((entity) => {
    const selection = readSelectedContentUnit(index, entityDir(entity.path))
    if (!selection) return []
    const candidateId = idField(selection.candidate_id)
    const resourceId = resourceIdField(selection.resource_id)
    return [{
      content_unit_ref: entityDir(entity.path),
      ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
      ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
      stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
      role: 'asset_ref',
      continuity_role: 'visual_reference',
    }]
  })
}

export function projectStyleReferenceResourceIds(
  index: MovScriptWorkspaceDomainIndex,
): number[] {
  const standards = firstEntity(index, 'project_standards')
  if (!standards) return []
  return uniqueIds([
    ...resourceIdsFromValue(standards.record.style_reference_images),
    ...resourceIdsFromValue(standards.record.style_references),
    ...resourceIdsFromValue(standards.record.reference_resource_ids),
    ...arrayField(standards.record.custom_rules)
      .filter(isRecord)
      .filter((rule) => rule.enabled !== false)
      .filter((rule) => stringField(rule.key) === 'style_reference_images')
      .flatMap((rule) => resourceIdsFromValue(rule.value)),
  ])
}

const PROMPT_REF_PATTERN = /\{\{([a-z_]+)::?([^{}:\s][^{}]*)\}\}/g

export function parseContentUnitEditPromptRefs(value: unknown): ContentUnitPromptRef[] {
  const editPrompt = recordField(value)
  return [
    ...parsePromptRefsFromText(stringField(editPrompt?.text), 'edit_prompt.text'),
    ...parsePromptRefsFromText(stringField(editPrompt?.negative_text), 'edit_prompt.negative_text'),
    ...parsePromptRefsFromText(stringField(editPrompt?.notes), 'edit_prompt.notes'),
  ]
}

export function parsePromptRefsFromText(text: string | undefined, field: string): ContentUnitPromptRef[] {
  if (!text) return []
  const refs: ContentUnitPromptRef[] = []
  for (const match of text.matchAll(PROMPT_REF_PATTERN)) {
    const kind = promptRefKind(match[1])
    const id = match[2]?.trim()
    if (!kind || !id) continue
    refs.push({
      kind,
      id,
      raw: match[0],
      source: {
        field,
        start: match.index,
        end: match.index === undefined ? undefined : match.index + match[0].length,
      },
    })
  }
  return refs
}

export function primaryRefKindForContentUnitType(contentUnitType: string): ContentUnitPromptRefKind | undefined {
  switch (contentUnitType) {
    case 'production_ref':
      return 'production'
    case 'segment_ref':
      return 'segment'
    case 'asset_ref':
      return 'asset'
    case 'keyframe_ref':
      return 'keyframe'
    case 'storyboard_ref':
      return 'storyboard'
    case 'scence_moment_ref':
    case 'scene_moment_ref':
      return 'scene_moment'
    case 'expression_unit_ref':
      return 'expression_unit'
    default:
      return undefined
  }
}

export interface ContentUnitPrimaryRef {
  kind: ContentUnitPromptRefKind
  id: string
}

export function primaryRefIdsForContentUnitRecord(
  record: Record<string, unknown>,
  kind: ContentUnitPromptRefKind,
): string[] {
  switch (kind) {
    case 'asset':
      return compactStrings(record.asset_ref)
    case 'keyframe':
      return compactStrings(record.keyframe_ref)
    case 'storyboard':
      return compactStrings(record.storyboard_ref)
    case 'production':
      return compactStrings(record.target_kind === 'production' ? record.target_ref : undefined, record.production_ref)
    case 'segment':
      return compactStrings(record.target_kind === 'segment' ? record.target_ref : undefined, record.segment_ref)
    case 'scene_moment':
      return compactStrings(record.target_kind === 'scene_moment' ? record.target_ref : undefined, record.scene_moment_ref, record.scence_moment_ref)
    case 'expression_unit':
      return compactStrings(record.target_kind === 'expression_unit' ? record.target_ref : undefined, record.expression_unit_ref)
    case 'content_unit':
      return compactStrings(record.content_unit_ref)
    default:
      return []
  }
}

export function primaryRefFieldNameForKind(kind: ContentUnitPromptRefKind): string {
  return kind === 'scene_moment' ? 'scene_moment_ref' : `${kind}_ref`
}

export function primaryContentUnitRefs(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  kind: ContentUnitPromptRefKind,
): ContentUnitPrimaryRef[] {
  return primaryRefIdsForContentUnitRecord(contentUnit.record, kind).map((id) => ({ kind, id }))
}

export function hasAmbiguousPrimaryRefs(refs: ContentUnitPrimaryRef[], kind: ContentUnitPromptRefKind): boolean {
  const unique: ContentUnitPrimaryRef[] = []
  for (const ref of refs) {
    if (unique.some((item) => samePromptRefId(item.id, ref.id, kind))) continue
    unique.push(ref)
  }
  return unique.length > 1
}

export function outputKindForContentUnitType(contentUnitType: string, value: unknown): ContentUnitOutputKind {
  const explicit = contentUnitOutputKind(value)
  if (explicit !== 'metadata') return explicit
  switch (contentUnitType) {
    case 'asset_ref':
    case 'keyframe_ref':
    case 'storyboard_ref':
      return 'image'
    case 'scence_moment_ref':
    case 'scene_moment_ref':
    case 'production_ref':
    case 'segment_ref':
      return 'video'
    case 'expression_unit_ref':
      return contentUnitOutputKind(value)
    default:
      return 'metadata'
  }
}

export function expectedOutputKindForContentUnitType(contentUnitType: string): ContentUnitOutputKind | undefined {
  switch (contentUnitType) {
    case 'asset_ref':
    case 'keyframe_ref':
    case 'storyboard_ref':
      return 'image'
    case 'scence_moment_ref':
    case 'scene_moment_ref':
    case 'production_ref':
    case 'segment_ref':
      return 'video'
    case 'expression_unit_ref':
      return undefined
    default:
      return undefined
  }
}

export function resolvePromptRefEntity(
  index: MovScriptWorkspaceDomainIndex,
  ref: ContentUnitPromptRef,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (ref.kind === 'content_unit') {
    return queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
      .find((entity) => sameEntityRef(entity.id, ref.id, 'content_unit') || sameEntityRef(entityDir(entity.path).split('/').pop(), ref.id, 'content_unit'))
  }
  return findEntityByRef(index, ref.kind, ref.id)
}

export function resolveContentUnitForPromptRef(
  index: MovScriptWorkspaceDomainIndex,
  ref: ContentUnitPromptRef,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (ref.kind === 'content_unit') return resolvePromptRefEntity(index, ref)
  const expectedTypes = contentUnitTypesForPromptRefKind(ref.kind)
  return queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
    .find((entity) => {
      if (!expectedTypes.includes(String(entity.record.content_unit_type ?? ''))) return false
      return primaryContentUnitRefs(entity, ref.kind)
        .some((candidate) => samePromptRefId(candidate.id, ref.id, ref.kind))
    })
}

export function resolveUpstreamSelectionForPromptRef(
  index: MovScriptWorkspaceDomainIndex,
  ref: ContentUnitPromptRef,
): ContentUnitUpstreamSelection | undefined {
  const contentUnit = resolveContentUnitForPromptRef(index, ref)
  if (!contentUnit) return undefined
  const selection = readSelectedContentUnit(index, entityDir(contentUnit.path))
  if (!selection) return undefined
  const candidateId = idField(selection.candidate_id)
  const resourceId = resourceIdField(selection.resource_id)
  const providerAsset = ref.kind === 'asset'
    ? activeProviderAssetCertificationForPromptRef(index, ref, { resourceId, candidateId })
    : undefined
  return {
    content_unit_ref: entityDir(contentUnit.path),
    ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
    ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
    ...(providerAsset ? { provider_asset: providerAsset } : {}),
    stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
    role: `${ref.kind}_ref`,
  }
}

export function activeProviderAssetCertificationForPromptRef(
  index: MovScriptWorkspaceDomainIndex,
  ref: Pick<ContentUnitPromptRef, 'kind' | 'id'>,
  input: { resourceId?: number; candidateId?: string | number } = {},
): ContentUnitProviderAssetCertification | undefined {
  if (ref.kind !== 'asset') return undefined
  const asset = findEntityByRef(index, 'asset', ref.id)
  return activeProviderAssetCertification(asset?.record, input)
}

export function activeProviderAssetCertification(
  assetRecord: Record<string, unknown> | undefined,
  input: { resourceId?: number; candidateId?: string | number } = {},
): ContentUnitProviderAssetCertification | undefined {
  const certifications = recordField(assetRecord?.provider_certifications)
    ?? recordField(assetRecord?.providerCertifications)
  if (!certifications) return undefined
  for (const [provider, rawCertification] of Object.entries(certifications)) {
    const certification = recordField(rawCertification)
    if (!certification) continue
    if (stringField(certification.status) !== 'active') continue
    const assetUri = providerAssetUri(certification)
    if (!assetUri) continue
    const sourceResourceId = resourceIdField(certification.source_resource_id ?? certification.sourceResourceId)
    if (input.resourceId !== undefined && sourceResourceId !== undefined && sourceResourceId !== input.resourceId) continue
    const sourceCandidateId = idField(certification.source_candidate_id ?? certification.sourceCandidateId)
    if (input.candidateId !== undefined && sourceCandidateId !== undefined && String(sourceCandidateId) !== String(input.candidateId)) continue
    return {
      provider,
      status: 'active',
      asset_uri: assetUri,
      ...(stringField(certification.hub_asset_id ?? certification.hubAssetId) ? { hub_asset_id: stringField(certification.hub_asset_id ?? certification.hubAssetId) } : {}),
      ...(sourceResourceId !== undefined ? { source_resource_id: sourceResourceId } : {}),
      ...(sourceCandidateId !== undefined ? { source_candidate_id: sourceCandidateId } : {}),
      ...(stringField(certification.source_hash ?? certification.sourceHash) ? { source_hash: stringField(certification.source_hash ?? certification.sourceHash) } : {}),
      ...(stringField(certification.certified_at ?? certification.certifiedAt) ? { certified_at: stringField(certification.certified_at ?? certification.certifiedAt) } : {}),
      ...(stringField(certification.updated_at ?? certification.updatedAt) ? { updated_at: stringField(certification.updated_at ?? certification.updatedAt) } : {}),
    }
  }
  return undefined
}

export function resolvePromptRefs(
  index: MovScriptWorkspaceDomainIndex,
  refs: ContentUnitPromptRef[],
  _primaryKind: ContentUnitPromptRefKind | undefined,
): { refs: ContentUnitResolvedRef[]; upstreamSelections: ContentUnitUpstreamSelection[] } {
  const upstreamSelections: ContentUnitUpstreamSelection[] = []
  const resolvedRefs = refs.map((ref): ContentUnitResolvedRef => {
    const role = 'input'
    const entity = resolvePromptRefEntity(index, ref)
    const selection = resolveUpstreamSelectionForPromptRef(index, ref)
    if (selection) upstreamSelections.push(selection)
    return {
      ...ref,
      role,
      ...(entity ? {
        resolved: {
          entityKind: entity.entityKind,
          ...(entity.id !== undefined ? { id: entity.id } : {}),
          path: entity.path,
        },
      } : {}),
      ...(selection ? { selection } : {}),
    }
  })
  return { refs: resolvedRefs, upstreamSelections }
}

function promptRefKind(value: string | undefined): ContentUnitPromptRefKind | undefined {
  switch (value) {
    case 'asset':
    case 'production':
    case 'segment':
    case 'keyframe':
    case 'storyboard':
    case 'scene_moment':
    case 'expression_unit':
    case 'content_unit':
      return value
    default:
      return undefined
  }
}

function contentUnitTypesForPromptRefKind(kind: ContentUnitPromptRefKind): string[] {
  if (kind === 'scene_moment') return ['scence_moment_ref', 'scene_moment_ref']
  if (kind === 'expression_unit') return ['expression_unit_ref']
  return [`${kind}_ref`]
}

function samePromptRefId(left: unknown, right: unknown, kind: ContentUnitPromptRefKind): boolean {
  return String(left) === String(right)
    || lastPathSegment(left) === String(right)
    || lastPathSegment(right) === String(left)
    || sameEntityRef(left, right, kind)
}

function lastPathSegment(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes('/')) return undefined
  return value.split('/').filter(Boolean).at(-1)
}

export function readSelectedContentUnit(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitRef: string,
): Record<string, unknown> | undefined {
  const context = index.documents.find((document) => {
    if (!isRecord(document.data)) return false
    if (document.data.schema !== 'movscript.decision_context.v1') return false
    return document.data.target_kind === 'content_unit' && document.data.target_ref === contentUnitRef
  })?.data as Record<string, unknown> | undefined
  const selection = recordField(context?.selection)
  return selection ? {
    ...selection,
    stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
  } : undefined
}

export function readContentUnitCandidate(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitRef: string,
  candidateId: string | number,
): Record<string, unknown> | undefined {
  const sourceCandidate = index.documents.find((document) => {
    if (!document.path.startsWith(`${contentUnitRef}/candidates/`)) return false
    if (!document.path.endsWith('/content_candidate.json')) return false
    const record = recordField(document.data)
    return record !== undefined && String(record.id ?? '') === String(candidateId)
  })?.data
  const sourceRecord = recordField(sourceCandidate)
  if (sourceRecord) return sourceRecord

  const context = index.documents.find((document) => {
    const record = recordField(document.data)
    return record?.schema === 'movscript.decision_context.v1'
      && record.target_kind === 'content_unit'
      && record.target_ref === contentUnitRef
  })?.data
  for (const candidate of arrayField(recordField(context)?.candidates).map(recordField).filter(isDefined)) {
    if (String(candidate.id ?? '') === String(candidateId)) return candidate
  }
  return undefined
}

export function findEntityByRef(
  index: MovScriptWorkspaceDomainIndex,
  entityKind: 'production' | 'segment' | 'asset' | 'setting' | 'setting_state' | 'scene_moment' | 'expression_unit' | 'storyboard' | 'keyframe',
  ref: unknown,
): MovScriptWorkspaceIndexedEntity | undefined {
  const value = idField(ref)
  if (value === undefined) return undefined
  const normalized = typeof value === 'string' ? value.replace(/\/+$/, '') : String(value)
  return queryMovScriptWorkspaceEntities(index, { entityKind })
    .find((entity) => {
      const dir = entityDir(entity.path)
      return dir === normalized || entity.path === `${normalized}/${entityKind}.json` || sameEntityRef(entity.id, value, entityKind)
    })
}

export function parentExpressionUnitForEntity(
  index: MovScriptWorkspaceDomainIndex,
  entity: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity | undefined {
  const expressionUnitRef = stringField(entity.record.expression_unit_ref)
  if (expressionUnitRef) return findEntityByRef(index, 'expression_unit', expressionUnitRef)
  const expressionUnitId = pathSegmentAfter(entity.path, 'expression_units')
  return expressionUnitId ? findEntityByRef(index, 'expression_unit', expressionUnitId) : undefined
}

export function requiredString(value: unknown, message: string): string {
  const next = stringField(value)
  if (!next) throw new Error(message)
  return next
}

export function entityList(dependencies: AdapterDependencies, role: string): MovScriptWorkspaceIndexedEntity[] {
  return dependencies.entities[role] ?? []
}

export function firstEntity(index: MovScriptWorkspaceDomainIndex, entityKind: 'project_standards'): MovScriptWorkspaceIndexedEntity | undefined {
  return queryMovScriptWorkspaceEntities(index, { entityKind, limit: 1 })[0]
}

export function assetOwners(index: MovScriptWorkspaceDomainIndex, asset: MovScriptWorkspaceIndexedEntity): MovScriptWorkspaceIndexedEntity[] {
  const settingId = pathSegmentAfter(asset.path, 'settings')
  const stateId = pathSegmentAfter(asset.path, 'states')
  return [
    stateId ? findEntityByRef(index, 'setting_state', stateId) : undefined,
    settingId ? findEntityByRef(index, 'setting', settingId) : undefined,
  ].filter(isDefined)
}

export function optionalEntity<T>(entity: T | undefined): T[] {
  return entity ? [entity] : []
}

export function canonicalEntities(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceIndexedEntity[] {
  return index.entities
}

export function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

export function entityKey(entity: MovScriptWorkspaceIndexedEntity): string {
  return `${entity.entityKind}:${String(entity.id ?? entity.path)}`
}

export function summaryLine(label: string, record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined
  const title = stringField(record.title)
  const intent = stringField(record.visual_intent ?? record.action ?? record.prompt_hint ?? record.text ?? record.description)
  return `${label}: ${[title, intent].filter(isString).join(' - ')}`
}

export function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function resourceIdsFromValue(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(resourceIdsFromValue)
  const text = stringField(value)
  if (text) {
    const ids: number[] = []
    const patterns = [
      /resource#([0-9]+)/gi,
      /reference_resource_ids\s*[:=]\s*\[?([0-9,\s]+)\]?/gi,
      /style_reference_resource_ids\s*[:=]\s*\[?([0-9,\s]+)\]?/gi,
    ]
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        for (const part of String(match[1] ?? '').split(',')) {
          const parsed = Number(part.trim())
          if (Number.isInteger(parsed) && parsed > 0) ids.push(parsed)
        }
      }
    }
    if (ids.length > 0) return ids
    const parsed = Number(text)
    return Number.isInteger(parsed) && parsed > 0 ? [parsed] : []
  }
  const id = resourceIdField(value)
  if (id !== undefined) return [id]
  if (isRecord(value)) return resourceIdsFromValue(value.resource_id ?? value.resourceId ?? value.id)
  return []
}

function uniqueIds<T extends string | number>(values: T[]): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  for (const value of values) {
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(value)
  }
  return output
}

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    const id = idField(value)
    return id === undefined ? [] : [String(id)]
  })
}

export function contentUnitOutputKind(value: unknown): ContentUnitOutputKind {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'metadata') return value
  return 'metadata'
}

export function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function providerAssetUri(certification: Record<string, unknown>): string | undefined {
  const direct = stringField(certification.asset_uri ?? certification.assetUri)
  if (direct) return direct
  const hubAssetId = stringField(certification.hub_asset_id ?? certification.hubAssetId)
  return hubAssetId ? `asset://${hubAssetId}` : undefined
}

export function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

export function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('__workspace_'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableJsonValue(item)]))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

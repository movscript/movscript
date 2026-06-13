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

const PROMPT_REF_PATTERN = /\{\{([a-z_]+):([^{}:\s][^{}]*)\}\}/g

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
    case 'asset_ref':
      return 'asset'
    case 'keyframe_ref':
      return 'keyframe'
    case 'storyboard_ref':
      return 'storyboard'
    case 'scence_moment_ref':
    case 'scene_moment_ref':
      return 'scene_moment'
    case 'shot_ref':
      return 'shot'
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
    case 'scene_moment':
      return compactStrings(record.scene_moment_ref, record.scence_moment_ref)
    case 'shot':
      return compactStrings(record.shot_ref)
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
    case 'shot_ref':
      return 'video'
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
    case 'shot_ref':
      return 'video'
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
  return {
    content_unit_ref: entityDir(contentUnit.path),
    ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
    ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
    stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
    role: `${ref.kind}_ref`,
  }
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
    case 'keyframe':
    case 'storyboard':
    case 'scene_moment':
    case 'shot':
    case 'content_unit':
      return value
    default:
      return undefined
  }
}

function contentUnitTypesForPromptRefKind(kind: ContentUnitPromptRefKind): string[] {
  if (kind === 'scene_moment') return ['scence_moment_ref', 'scene_moment_ref']
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

export function findEntityByRef(
  index: MovScriptWorkspaceDomainIndex,
  entityKind: 'asset' | 'setting' | 'setting_state' | 'scene_moment' | 'shot' | 'storyboard' | 'keyframe',
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

export function parentShotForEntity(
  index: MovScriptWorkspaceDomainIndex,
  entity: MovScriptWorkspaceIndexedEntity,
): MovScriptWorkspaceIndexedEntity | undefined {
  const shotRef = stringField(entity.record.shot_ref)
  if (shotRef) return findEntityByRef(index, 'shot', shotRef)
  const shotId = pathSegmentAfter(entity.path, 'shots')
  return shotId ? findEntityByRef(index, 'shot', shotId) : undefined
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

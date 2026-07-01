import {
  entityPathSlug,
  sameEntityRef,
  semanticEntityId,
} from '../layout/index.js'
import {
  contentUnitTargetValidationDiagnostics,
  isContentUnitPromptRefKind,
  outputKindForContentUnitType,
  primaryRefFieldNameForKind,
  primaryRefIdsForContentUnitRecord,
  primaryRefKindForContentUnitType,
} from '@movscript/domain'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  unit: Record<string, unknown>
}

export interface MovScriptContentUnitWriteResult {
  contentUnitPath: string
  record: Record<string, unknown>
}

export async function upsertMovScriptContentUnit(
  input: MovScriptContentUnitWriteInput,
): Promise<MovScriptContentUnitWriteResult> {
  const contentUnitId = stableEntityId(input.unit.ID ?? input.unit.id ?? input.unit.client_id, 'content_unit')
  const contentUnitPath = movScriptContentUnitPath(input.unit)
  const current = await readOptionalRecord(input.fileRepository, contentUnitPath)
  const record = normalizeContentUnitRecord(input.unit, current, contentUnitId)
  validateContentUnitTarget(record)
  validateContentUnitPrimaryPromptRefs(record)
  await writeRecord(input.fileRepository, contentUnitPath, record)

  return { contentUnitPath, record }
}

export function movScriptContentUnitPath(unit: Record<string, unknown>): string {
  const id = stableEntityId(unit.ID ?? unit.id ?? unit.client_id, 'content_unit')
  return `${contentUnitDirectory(id)}/content_unit.json`
}

export function movScriptContentUnitKeyframePath(input: {
  contentUnitId: string | number
  keyframeId: string | number
}): string {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const keyframeId = stableEntityId(input.keyframeId, 'keyframe')
  return `${contentUnitDirectory(contentUnitId)}/keyframes/${entityPathSlug(keyframeId, 'keyframe')}/keyframe.json`
}

export function movScriptContentUnitsSceneAggregatePath(input: { scene_moment_id?: unknown }): string {
  const sceneMomentId = stableEntityId(input.scene_moment_id, 'scene_moment')
  return `content_units/by_scene_moment/${sceneMomentId}.json`
}

function normalizeContentUnitRecord(
  unit: Record<string, unknown>,
  current: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const contentUnitType = stringValue(unit.content_unit_type ?? unit.contentUnitType ?? current.content_unit_type)
    ?? 'storyboard_ref'
  const outputKind = stringValue(unit.output_kind ?? unit.outputKind ?? current.output_kind)
    ?? defaultOutputKind(contentUnitType)
  const scopeKind = stringValue(unit.scope_kind ?? unit.scopeKind ?? current.scope_kind)
  const scopeRef = stringValue(unit.scope_ref ?? unit.scopeRef ?? current.scope_ref)
  const targetKind = stringValue(unit.target_kind ?? unit.targetKind ?? current.target_kind)
  const targetRef = stringValue(unit.target_ref ?? unit.targetRef ?? current.target_ref)

  return pruneUndefined({
    ...stripWorkspacePrivateFields(current),
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id,
    title: stringValue(unit.title ?? current.title) ?? 'Untitled content unit',
    content_unit_type: contentUnitType,
    output_kind: outputKind,
    target_category: stringValue(unit.target_category ?? unit.targetCategory ?? current.target_category),
    target_kind: targetKind,
    target_ref: targetRef,
    scope_kind: scopeKind,
    scope_ref: scopeRef,
    generation_role: stringValue(unit.generation_role ?? unit.generationRole ?? current.generation_role),
    order: finiteNumber(unit.order) ?? finiteNumber(current.order),
    description: stringValue(unit.description ?? current.description) ?? '',
    asset_ref: stringValue(unit.asset_ref ?? unit.assetRef ?? current.asset_ref),
    production_ref: stringValue(unit.production_ref ?? unit.productionRef ?? current.production_ref),
    segment_ref: stringValue(unit.segment_ref ?? unit.segmentRef ?? current.segment_ref),
    keyframe_ref: stringValue(unit.keyframe_ref ?? unit.keyframeRef ?? current.keyframe_ref),
    storyboard_ref: stringValue(unit.storyboard_ref ?? unit.storyboardRef ?? current.storyboard_ref),
    scene_moment_ref: stringValue(unit.scene_moment_ref ?? unit.sceneMomentRef ?? current.scene_moment_ref),
    expression_unit_ref: stringValue(unit.expression_unit_ref ?? unit.expressionUnitRef ?? current.expression_unit_ref),
    content_unit_ref: stringValue(unit.content_unit_ref ?? unit.contentUnitRef ?? current.content_unit_ref),
    voice_profile_ref: stringValue(unit.voice_profile_ref ?? unit.voiceProfileRef ?? current.voice_profile_ref),
    edit_prompt: normalizeEditPrompt(unit.edit_prompt ?? unit.editPrompt ?? unit.prompt ?? current.edit_prompt),
    generation_references: normalizeGenerationReferences(unit.generation_references ?? unit.generationReferences ?? current.generation_references),
    reference_assets: normalizeReferenceAssets(unit.reference_assets ?? unit.referenceAssets ?? current.reference_assets),
    model_intent: isRecord(unit.model_intent ?? unit.modelIntent) ? unit.model_intent ?? unit.modelIntent : current.model_intent,
    ...(unit.__delete === true ? { __delete: true } : {}),
  })
}

function contentUnitDirectory(id: string): string {
  return `content_units/${entityPathSlug(id, 'content_unit')}`
}

function defaultOutputKind(contentUnitType: string): string {
  return outputKindForContentUnitType(contentUnitType, undefined)
}

function validateContentUnitTarget(record: Record<string, unknown>): void {
  for (const diagnostic of contentUnitTargetValidationDiagnostics(record)) {
    throw new Error(diagnostic.message)
  }
}

function validateContentUnitPrimaryPromptRefs(record: Record<string, unknown>): void {
  const contentUnitType = stringValue(record.content_unit_type)
  if (!contentUnitType) return
  const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
  if (!primaryKind) return
  const primaryRefs = primaryRefIdsForContentUnitRecord(record, primaryKind)
  if (primaryRefs.length === 0) return
  const promptRefs = parseContentUnitEditPromptRefs(record.edit_prompt)
  for (const promptRef of promptRefs) {
    if (promptRef.kind !== primaryKind) continue
    if (!primaryRefs.some((primaryRef) => sameRefId(primaryRef, promptRef.id, primaryKind))) continue
    throw new Error(`${contentUnitType} content_unit edit_prompt must not reference its own ${primaryRefFieldNameForKind(primaryKind)}: ${promptRef.raw}`)
  }
}

interface PromptRef {
  kind: string
  id: string
  raw: string
}

const PROMPT_REF_PATTERN = /\{\{([a-z_]+):([^{}:\s][^{}]*)\}\}/g

function parseContentUnitEditPromptRefs(value: unknown): PromptRef[] {
  const editPrompt = isRecord(value) ? value : {}
  return [
    ...parsePromptRefsFromText(stringValue(editPrompt.text)),
    ...parsePromptRefsFromText(stringValue(editPrompt.negative_text)),
    ...parsePromptRefsFromText(stringValue(editPrompt.notes)),
  ]
}

function normalizeGenerationReferences(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((item): Record<string, unknown>[] => {
    if (!isRecord(item)) return []
    const ref = pruneUndefined({
      id: stringValue(item.id),
      kind: stringValue(item.kind ?? item.ref_kind ?? item.refKind ?? item.type),
      ref: stringValue(item.ref ?? item.target_ref ?? item.targetRef ?? item.source_ref ?? item.sourceRef) ?? finiteNumber(item.ref),
      raw: stringValue(item.raw),
      resource_id: finiteNumber(item.resource_id ?? item.resourceId),
      media_type: stringValue(item.media_type ?? item.mediaType),
      role: stringValue(item.role),
      source_ref: stringValue(item.source_ref ?? item.sourceRef),
      label: stringValue(item.label ?? item.title),
      source: stringValue(item.source),
    })
    return Object.keys(ref).length > 0 ? [ref] : []
  })
  return refs.length > 0 ? refs : undefined
}

function normalizeReferenceAssets(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((item): Record<string, unknown>[] => {
    if (!isRecord(item)) return []
    const ref = pruneUndefined({
      role: stringValue(item.role),
      media_type: stringValue(item.media_type ?? item.mediaType),
      resource_id: finiteNumber(item.resource_id ?? item.resourceId),
      source_ref: stringValue(item.source_ref ?? item.sourceRef),
    })
    return ref.role && ref.media_type && ref.resource_id ? [ref] : []
  })
  return refs.length > 0 ? refs : undefined
}

function parsePromptRefsFromText(text: string | undefined): PromptRef[] {
  if (!text) return []
  const refs: PromptRef[] = []
  for (const match of text.matchAll(PROMPT_REF_PATTERN)) {
    const kind = promptRefKind(match[1])
    const id = match[2]?.trim()
    if (!kind || !id) continue
    refs.push({ kind, id, raw: match[0] })
  }
  return refs
}

function promptRefKind(value: string | undefined): string | undefined {
  return isContentUnitPromptRefKind(value) ? value : undefined
}

function sameRefId(left: string, right: string, kind: string): boolean {
  return sameEntityRef(left, right, kind)
    || lastPathSegment(left) === right
    || lastPathSegment(right) === left
}

function lastPathSegment(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes('/')) return undefined
  return value.split('/').filter(Boolean).at(-1)
}

function stableEntityId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return fileRepository.read({ path }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    return isRecord(parsed) ? parsed : {}
  }).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function positiveNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function normalizeEditPrompt(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return { text: value }
  if (isRecord(value)) return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}

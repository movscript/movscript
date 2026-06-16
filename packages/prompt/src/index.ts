import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { queryMovScriptWorkspaceEntities } from '@movscript/workspace/indexer'
import {
  entityPathSlug,
  sameEntityRef,
} from '@movscript/workspace/layout'

export type MovScriptPromptOutputKind = 'image' | 'video' | 'audio' | 'text' | 'metadata'
export type MovScriptPromptRefKind = 'production' | 'segment' | 'asset' | 'keyframe' | 'storyboard' | 'scene_moment' | 'expression_unit' | 'shot' | 'content_unit'
export type MovScriptPromptRefRole = 'input'

export interface MovScriptPromptRef {
  kind: MovScriptPromptRefKind
  id: string
  raw: string
  source: {
    field: 'edit_prompt.text' | 'edit_prompt.negative_text' | 'edit_prompt.notes'
    start?: number
    end?: number
  }
}

export interface MovScriptResolvedPromptRef extends MovScriptPromptRef {
  role: MovScriptPromptRefRole
  resolved?: {
    entityKind: string
    id?: string | number
    path?: string
  }
  upstream_content_unit_ref?: string
  upstream_content_unit_id?: string | number
  resource_id?: number
  replacement?: string
  blocker?: MovScriptPromptBuildBlocker
}

export interface MovScriptPromptDecisionContext {
  target_kind?: string
  target_ref?: string
  candidates?: Record<string, unknown>[]
  selection?: Record<string, unknown>
  status?: string
}

export interface MovScriptContentUnitDecisionProvider {
  getContentUnitDecision(input: {
    contentUnitId: string | number
    contentUnitRef?: string
  }): Promise<MovScriptPromptDecisionContext | undefined>
}

export type MovScriptPromptBuildBlockerCode =
  | 'content_unit_not_found'
  | 'content_unit_id_missing'
  | 'primary_ref_missing'
  | 'primary_ref_ambiguous'
  | 'ref_not_found'
  | 'upstream_content_unit_not_found'
  | 'decision_context_missing'
  | 'upstream_selection_missing'
  | 'upstream_candidate_missing'
  | 'upstream_resource_missing'
  | 'upstream_selection_stale'
  | 'prompt_dependency_cycle'

export interface MovScriptPromptBuildBlocker {
  code: MovScriptPromptBuildBlockerCode
  ref?: string
  content_unit_ref?: string
  content_unit_id?: string | number
  resource_ref?: string | number
  message: string
}

export interface MovScriptPromptReplacement {
  ref: string
  field: MovScriptPromptRef['source']['field']
  resource_id: number
  token: string
}

export interface MovScriptCompiledContentUnitPrompt {
  schema: 'movscript.backend_prompt.v1'
  content_unit_ref: string
  content_unit_id?: string | number
  content_unit_type: string
  output_kind: MovScriptPromptOutputKind
  text?: string
  negative_text?: string
  notes?: string
  style_reference_resource_ids?: number[]
  resource_ids: number[]
  replacements: MovScriptPromptReplacement[]
  refs: MovScriptResolvedPromptRef[]
  blockers?: MovScriptPromptBuildBlocker[]
}

export type MovScriptContentUnitPromptBuildResult =
  | {
    ok: true
    prompt: MovScriptCompiledContentUnitPrompt
  }
  | {
    ok: false
    prompt: MovScriptCompiledContentUnitPrompt
    blockers: MovScriptPromptBuildBlocker[]
  }

export interface BuildContentUnitBackendPromptInput {
  index: MovScriptWorkspaceDomainIndex
  contentUnit: MovScriptWorkspaceIndexedEntity
  decisionProvider: MovScriptContentUnitDecisionProvider
}

export interface BuildContentUnitBackendPromptByIdInput {
  index: MovScriptWorkspaceDomainIndex
  contentUnitId: string | number
  decisionProvider: MovScriptContentUnitDecisionProvider
}

const PROMPT_REF_PATTERN = /\{\{([a-z_]+):([^{}:\s][^{}]*)\}\}/g

export async function buildContentUnitBackendPromptById(
  input: BuildContentUnitBackendPromptByIdInput,
): Promise<MovScriptContentUnitPromptBuildResult> {
  const contentUnit = queryMovScriptWorkspaceEntities(input.index, { entityKind: 'content_unit' })
    .find((entity) => entity.id !== undefined && sameEntityRef(entity.id, input.contentUnitId, 'content_unit'))
  if (!contentUnit) {
    return failedPrompt({
      contentUnitRef: `content_units/${entityPathSlug(input.contentUnitId, 'content_unit')}`,
      contentUnitId: input.contentUnitId,
      contentUnitType: '',
      outputKind: 'metadata',
      blockers: [{
        code: 'content_unit_not_found',
        content_unit_id: input.contentUnitId,
        message: `content unit does not exist: ${String(input.contentUnitId)}`,
      }],
    })
  }
  return buildContentUnitBackendPrompt({
    index: input.index,
    contentUnit,
    decisionProvider: input.decisionProvider,
  })
}

export async function buildContentUnitBackendPrompt(
  input: BuildContentUnitBackendPromptInput,
): Promise<MovScriptContentUnitPromptBuildResult> {
  const contentUnitRef = entityDir(input.contentUnit.path)
  const contentUnitType = stringField(input.contentUnit.record.content_unit_type) ?? ''
  const outputKind = contentUnitOutputKind(input.contentUnit.record.output_kind)
  const editPrompt = recordField(input.contentUnit.record.edit_prompt)
  const refs = parseContentUnitEditPromptRefs(editPrompt)
  const primaryKind = primaryRefKindForContentUnitType(contentUnitType)
  const primaryRefs = primaryKind ? primaryContentUnitRefs(input.contentUnit, primaryKind) : []
  const styleReferenceResourceIds = usesVisualStyleReferences(outputKind)
    ? projectStyleReferenceResourceIds(input.index)
    : []
  const decisionCache = new Map<string, Promise<MovScriptPromptDecisionContext | undefined>>()
  const blockers: MovScriptPromptBuildBlocker[] = []

  if (primaryKind) {
    if (primaryRefs.length === 0) {
      blockers.push({
        code: 'primary_ref_missing',
        content_unit_ref: contentUnitRef,
        message: `${contentUnitType} requires a ${primaryKind} primary ref`,
      })
    }
    if (hasAmbiguousPrimaryRefs(primaryRefs, primaryKind)) {
      blockers.push({
        code: 'primary_ref_ambiguous',
        content_unit_ref: contentUnitRef,
        message: `${contentUnitType} accepts only one ${primaryKind} primary ref`,
      })
    }
  }

  if (input.contentUnit.id === undefined) {
    blockers.push({
      code: 'content_unit_id_missing',
      content_unit_ref: contentUnitRef,
      message: `content unit is missing id: ${contentUnitRef}`,
    })
  }

  const resolvedRefs: MovScriptResolvedPromptRef[] = []
  for (const ref of refs) {
    const role: MovScriptPromptRefRole = 'input'
    const entity = resolvePromptRefEntity(input.index, ref)
    const base: MovScriptResolvedPromptRef = {
      ...ref,
      role,
      ...(entity ? {
        resolved: {
          entityKind: entity.entityKind,
          ...(entity.id !== undefined ? { id: entity.id } : {}),
          path: entity.path,
        },
      } : {}),
    }
    if (!entity) {
      const blocker: MovScriptPromptBuildBlocker = {
        code: 'ref_not_found',
        ref: ref.raw,
        message: `prompt ref does not resolve: ${ref.raw}`,
      }
      blockers.push(blocker)
      resolvedRefs.push({ ...base, blocker })
      continue
    }
    const upstream = resolveContentUnitForPromptRef(input.index, ref)
    if (!upstream || upstream.id === undefined) {
      const blocker: MovScriptPromptBuildBlocker = {
        code: 'upstream_content_unit_not_found',
        ref: ref.raw,
        message: `prompt input has no ${ref.kind}_ref content unit: ${ref.raw}`,
      }
      blockers.push(blocker)
      resolvedRefs.push({ ...base, blocker })
      continue
    }

    const upstreamRef = entityDir(upstream.path)
    if (upstreamRef === contentUnitRef) {
      const blocker: MovScriptPromptBuildBlocker = {
        code: 'prompt_dependency_cycle',
        ref: ref.raw,
        content_unit_ref: upstreamRef,
        content_unit_id: upstream.id,
        message: `prompt input forms a dependency cycle: ${ref.raw}`,
      }
      blockers.push(blocker)
      resolvedRefs.push({
        ...base,
        upstream_content_unit_ref: upstreamRef,
        upstream_content_unit_id: upstream.id,
        blocker,
      })
      continue
    }

    const decision = await decisionFor(input.decisionProvider, decisionCache, upstream.id, upstreamRef)
    const decisionBlocker = blockerForDecision(ref, upstream, upstreamRef, decision)
    if (decisionBlocker) {
      blockers.push(decisionBlocker)
      resolvedRefs.push({
        ...base,
        upstream_content_unit_ref: upstreamRef,
        upstream_content_unit_id: upstream.id,
        blocker: decisionBlocker,
      })
      continue
    }

    const resourceId = selectedResourceId(decision)
    if (resourceId === undefined) {
      const blocker: MovScriptPromptBuildBlocker = {
        code: 'upstream_resource_missing',
        ref: ref.raw,
        content_unit_ref: upstreamRef,
        content_unit_id: upstream.id,
        message: `prompt input selected content unit has no resource_id: ${ref.raw}`,
      }
      blockers.push(blocker)
      resolvedRefs.push({
        ...base,
        upstream_content_unit_ref: upstreamRef,
        upstream_content_unit_id: upstream.id,
        blocker,
      })
      continue
    }

    resolvedRefs.push({
      ...base,
      upstream_content_unit_ref: upstreamRef,
      upstream_content_unit_id: upstream.id,
      resource_id: resourceId,
      replacement: resourceToken(resourceId),
    })
  }

  const replacements = resolvedRefs.flatMap((ref): MovScriptPromptReplacement[] => {
    if (ref.resource_id === undefined || !ref.replacement) return []
    return [{
      ref: ref.raw,
      field: ref.source.field,
      resource_id: ref.resource_id,
      token: ref.replacement,
    }]
  })
  const prompt: MovScriptCompiledContentUnitPrompt = pruneUndefined({
    schema: 'movscript.backend_prompt.v1' as const,
    content_unit_ref: contentUnitRef,
    content_unit_id: input.contentUnit.id,
    content_unit_type: contentUnitType,
    output_kind: outputKind,
    text: compilePromptText(stringField(editPrompt?.text), resolvedRefs, 'edit_prompt.text'),
    negative_text: compilePromptText(stringField(editPrompt?.negative_text), resolvedRefs, 'edit_prompt.negative_text'),
    notes: compilePromptText(stringField(editPrompt?.notes), resolvedRefs, 'edit_prompt.notes'),
    style_reference_resource_ids: styleReferenceResourceIds.length > 0 ? styleReferenceResourceIds : undefined,
    resource_ids: uniqueIds([
      ...replacements.map((replacement) => replacement.resource_id),
      ...styleReferenceResourceIds,
    ]),
    replacements,
    refs: resolvedRefs,
    blockers: blockers.length > 0 ? dedupeBlockers(blockers) : undefined,
  })

  if (blockers.length > 0) {
    return { ok: false, prompt, blockers: dedupeBlockers(blockers) }
  }
  return { ok: true, prompt }
}

export function parseContentUnitEditPromptRefs(editPrompt: unknown): MovScriptPromptRef[] {
  const prompt = recordField(editPrompt)
  return [
    ...parsePromptRefsFromText(stringField(prompt?.text), 'edit_prompt.text'),
    ...parsePromptRefsFromText(stringField(prompt?.negative_text), 'edit_prompt.negative_text'),
    ...parsePromptRefsFromText(stringField(prompt?.notes), 'edit_prompt.notes'),
  ]
}

export function parsePromptRefsFromText(
  text: string | undefined,
  field: MovScriptPromptRef['source']['field'],
): MovScriptPromptRef[] {
  if (!text) return []
  const refs: MovScriptPromptRef[] = []
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

function failedPrompt(input: {
  contentUnitRef: string
  contentUnitId?: string | number
  contentUnitType: string
  outputKind: MovScriptPromptOutputKind
  blockers: MovScriptPromptBuildBlocker[]
}): MovScriptContentUnitPromptBuildResult {
  return {
    ok: false,
    blockers: input.blockers,
    prompt: {
      schema: 'movscript.backend_prompt.v1',
      content_unit_ref: input.contentUnitRef,
      ...(input.contentUnitId !== undefined ? { content_unit_id: input.contentUnitId } : {}),
      content_unit_type: input.contentUnitType,
      output_kind: input.outputKind,
      resource_ids: [],
      replacements: [],
      refs: [],
      blockers: input.blockers,
    },
  }
}

async function decisionFor(
  provider: MovScriptContentUnitDecisionProvider,
  cache: Map<string, Promise<MovScriptPromptDecisionContext | undefined>>,
  contentUnitId: string | number,
  contentUnitRef: string,
): Promise<MovScriptPromptDecisionContext | undefined> {
  const key = String(contentUnitId)
  const cached = cache.get(key)
  if (cached) return cached
  const next = provider.getContentUnitDecision({ contentUnitId, contentUnitRef })
  cache.set(key, next)
  return next
}

function blockerForDecision(
  ref: MovScriptPromptRef,
  upstream: MovScriptWorkspaceIndexedEntity,
  upstreamRef: string,
  decision: MovScriptPromptDecisionContext | undefined,
): MovScriptPromptBuildBlocker | undefined {
  if (!decision) {
    return {
      code: 'decision_context_missing',
      ref: ref.raw,
      content_unit_ref: upstreamRef,
      content_unit_id: upstream.id,
      message: `prompt input content unit has no backend decision context: ${ref.raw}`,
    }
  }
  const selection = selectedDecision(decision)
  if (!selection) {
    return {
      code: 'upstream_selection_missing',
      ref: ref.raw,
      content_unit_ref: upstreamRef,
      content_unit_id: upstream.id,
      message: `prompt input content unit has no selected backend candidate: ${ref.raw}`,
    }
  }
  if (selection.stale === true && stalePolicy(selection) !== 'accept_stale') {
    return {
      code: 'upstream_selection_stale',
      ref: ref.raw,
      content_unit_ref: upstreamRef,
      content_unit_id: upstream.id,
      message: `prompt input selected backend candidate is stale: ${ref.raw}`,
    }
  }
  const candidateId = idField(selection.candidate_id)
  if (candidateId !== undefined && Array.isArray(decision.candidates)) {
    const candidate = decision.candidates.find((item) => sameId(item.id, candidateId))
    if (!candidate) {
      return {
        code: 'upstream_candidate_missing',
        ref: ref.raw,
        content_unit_ref: upstreamRef,
        content_unit_id: upstream.id,
        message: `prompt input selected backend candidate is missing: ${ref.raw}`,
      }
    }
  }
  if (selectedResourceId(decision) === undefined) {
    return {
      code: 'upstream_resource_missing',
      ref: ref.raw,
      content_unit_ref: upstreamRef,
      content_unit_id: upstream.id,
      message: `prompt input selected backend candidate has no resource_id: ${ref.raw}`,
    }
  }
  return undefined
}

function selectedDecision(decision: MovScriptPromptDecisionContext): Record<string, unknown> | undefined {
  const selection = recordField(decision.selection)
  return selection && Object.keys(selection).length > 0 ? selection : undefined
}

function selectedResourceId(decision: MovScriptPromptDecisionContext | undefined): number | undefined {
  const selection = decision ? selectedDecision(decision) : undefined
  const direct = resourceIdField(selection?.resource_id)
  if (direct !== undefined) return direct
  const candidateId = idField(selection?.candidate_id)
  if (candidateId === undefined || !Array.isArray(decision?.candidates)) return undefined
  const candidate = decision.candidates.find((item) => sameId(item.id, candidateId))
  return firstCandidateResourceId(candidate)
}

function firstCandidateResourceId(candidate: Record<string, unknown> | undefined): number | undefined {
  const output = arrayField(candidate?.outputs).filter(isRecord)[0]
  return resourceIdField(output?.resource_id)
}

function compilePromptText(
  text: string | undefined,
  refs: MovScriptResolvedPromptRef[],
  field: MovScriptPromptRef['source']['field'],
): string | undefined {
  if (!text) return undefined
  const replacements = refs
    .filter((ref) => ref.source.field === field && ref.replacement)
    .sort((left, right) => (right.source.start ?? 0) - (left.source.start ?? 0))
  let output = text
  for (const ref of replacements) {
    if (ref.source.start === undefined || ref.source.end === undefined || !ref.replacement) {
      output = output.split(ref.raw).join(ref.replacement)
      continue
    }
    output = `${output.slice(0, ref.source.start)}${ref.replacement}${output.slice(ref.source.end)}`
  }
  return output
}

function resolvePromptRefEntity(
  index: MovScriptWorkspaceDomainIndex,
  ref: MovScriptPromptRef,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (ref.kind === 'content_unit') {
    return queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
      .find((entity) => entity.id !== undefined && sameEntityRef(entity.id, ref.id, 'content_unit')
        || sameEntityRef(entityDir(entity.path).split('/').pop(), ref.id, 'content_unit'))
  }
  return findEntityByRef(index, ref.kind, ref.id)
}

function resolveContentUnitForPromptRef(
  index: MovScriptWorkspaceDomainIndex,
  ref: MovScriptPromptRef,
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

interface PrimaryContentUnitRef {
  kind: MovScriptPromptRefKind
  id: string
}

function primaryContentUnitRefs(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  kind: MovScriptPromptRefKind,
): PrimaryContentUnitRef[] {
  return flatPrimaryRefIds(contentUnit.record, kind).map((id) => ({ kind, id }))
}

function flatPrimaryRefIds(record: Record<string, unknown>, kind: MovScriptPromptRefKind): string[] {
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
    case 'shot':
      return compactStrings(record.shot_ref)
    case 'content_unit':
      return compactStrings(record.content_unit_ref)
    default:
      return []
  }
}

function hasAmbiguousPrimaryRefs(refs: PrimaryContentUnitRef[], kind: MovScriptPromptRefKind): boolean {
  const unique: PrimaryContentUnitRef[] = []
  for (const ref of refs) {
    if (unique.some((item) => samePromptRefId(item.id, ref.id, kind))) continue
    unique.push(ref)
  }
  return unique.length > 1
}

function samePromptRefId(left: unknown, right: unknown, kind: MovScriptPromptRefKind): boolean {
  return String(left) === String(right)
    || lastPathSegment(left) === String(right)
    || lastPathSegment(right) === String(left)
    || sameEntityRef(left, right, kind)
}

function lastPathSegment(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes('/')) return undefined
  return value.split('/').filter(Boolean).at(-1)
}

function findEntityByRef(
  index: MovScriptWorkspaceDomainIndex,
  entityKind: Exclude<MovScriptPromptRefKind, 'content_unit'>,
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

function promptRefKind(value: string | undefined): MovScriptPromptRefKind | undefined {
  switch (value) {
    case 'asset':
    case 'production':
    case 'segment':
    case 'keyframe':
    case 'storyboard':
    case 'scene_moment':
    case 'expression_unit':
    case 'shot':
    case 'content_unit':
      return value
    default:
      return undefined
  }
}

function primaryRefKindForContentUnitType(contentUnitType: string): MovScriptPromptRefKind | undefined {
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
    case 'shot_ref':
      return 'shot'
    default:
      return undefined
  }
}

function contentUnitTypesForPromptRefKind(kind: MovScriptPromptRefKind): string[] {
  if (kind === 'scene_moment') return ['scence_moment_ref', 'scene_moment_ref']
  if (kind === 'expression_unit') return ['expression_unit_ref']
  return [`${kind}_ref`]
}

function contentUnitOutputKind(value: unknown): MovScriptPromptOutputKind {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'metadata') return value
  return 'metadata'
}

function usesVisualStyleReferences(outputKind: MovScriptPromptOutputKind): boolean {
  return outputKind === 'image' || outputKind === 'video'
}

function projectStyleReferenceResourceIds(index: MovScriptWorkspaceDomainIndex): number[] {
  const standards = queryMovScriptWorkspaceEntities(index, { entityKind: 'project_standards', limit: 1 })[0]
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

function resourceToken(resourceId: number): string {
  return `[[resource::${String(resourceId)}]]`
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function stalePolicy(selection: Record<string, unknown>): string {
  return stringField(selection.stale_policy) ?? 'strict'
}

function sameId(left: unknown, right: unknown): boolean {
  const leftId = idField(left)
  const rightId = idField(right)
  return leftId !== undefined && rightId !== undefined && String(leftId) === String(rightId)
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

function dedupeBlockers(blockers: MovScriptPromptBuildBlocker[]): MovScriptPromptBuildBlocker[] {
  const seen = new Set<string>()
  const output: MovScriptPromptBuildBlocker[] = []
  for (const blocker of blockers) {
    const key = `${blocker.code}:${blocker.ref ?? ''}:${blocker.content_unit_ref ?? ''}:${blocker.message}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(blocker)
  }
  return output
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

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    const id = idField(value)
    return id === undefined ? [] : [String(id)]
  })
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

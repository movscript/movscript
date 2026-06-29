import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import type {
  MovScriptContentUnitOutputKind,
  MovScriptContentUnitPromptRefKind,
} from '@movscript/domain'
import {
  contentUnitTypesForPromptRefKind as domainContentUnitTypesForPromptRefKind,
  isContentUnitPromptRefKind,
  outputKindForContentUnitType as domainOutputKindForContentUnitType,
  primaryRefIdsForContentUnitRecord as domainPrimaryRefIdsForContentUnitRecord,
  primaryRefKindForContentUnitType as domainPrimaryRefKindForContentUnitType,
} from '@movscript/domain'
import { formatResourceMention } from '@movscript/workspace'
import { queryMovScriptWorkspaceEntities } from '@movscript/workspace/indexer'
import {
  entityPathSlug,
  sameEntityRef,
} from '@movscript/workspace/layout'

export type MovScriptPromptOutputKind = MovScriptContentUnitOutputKind
export type MovScriptPromptRefKind = MovScriptContentUnitPromptRefKind | 'candidate' | 'resource'
export type MovScriptPromptRefRole =
  | 'input'
  | 'generic'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'first_frame'
  | 'last_frame'
  | 'style_reference'
  | 'motion_reference'
  | 'source_video'
  | 'source_audio'
  | string

export type MovScriptPromptRefMediaType = 'image' | 'video' | 'audio' | 'text' | 'file' | string

export interface MovScriptPromptRef {
  kind: MovScriptPromptRefKind
  id: string
  raw: string
  role?: MovScriptPromptRefRole
  media_type?: MovScriptPromptRefMediaType
  source: {
    field: 'edit_prompt.text' | 'edit_prompt.negative_text' | 'edit_prompt.notes' | 'edit_prompt.structured'
    start?: number
    end?: number
  }
}

export interface MovScriptUnsupportedPromptRef {
  kind: string
  id: string
  raw: string
  source: MovScriptPromptRef['source']
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
  | 'unsupported_prompt_ref_kind'

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

export interface MovScriptCompiledPromptReferenceAsset {
  resource_id: number
  role: MovScriptPromptRefRole
  media_type: MovScriptPromptRefMediaType
  source_ref: string
}

export interface MovScriptShotPlanItem {
  order?: number
  title?: string
  duration_sec?: number
  action?: string
  result?: string
  dialogue?: string
  narration?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  lighting?: string
  depth_of_field?: string
  composition?: string
  transition?: string
  notes?: string
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
  structured?: Record<string, unknown>
  structured_text?: string
  style_reference_resource_ids?: number[]
  resource_ids: number[]
  reference_assets?: MovScriptCompiledPromptReferenceAsset[]
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
  promptText?: string
}

export interface BuildContentUnitBackendPromptByIdInput {
  index: MovScriptWorkspaceDomainIndex
  contentUnitId: string | number
  decisionProvider: MovScriptContentUnitDecisionProvider
  promptText?: string
}

const PROMPT_REF_PATTERN = /\{\{([a-z_]+)::?([^{}:\s][^{}]*)\}\}/g

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
    ...(input.promptText !== undefined ? { promptText: input.promptText } : {}),
  })
}

export async function buildContentUnitBackendPrompt(
  input: BuildContentUnitBackendPromptInput,
): Promise<MovScriptContentUnitPromptBuildResult> {
  const contentUnitRef = entityDir(input.contentUnit.path)
  const contentUnitType = stringField(input.contentUnit.record.content_unit_type) ?? ''
  const outputKind = contentUnitOutputKind(input.contentUnit.record.output_kind)
  const editPrompt = contentUnitEditPrompt(input.contentUnit.record.edit_prompt, input.promptText)
  const refs = parseContentUnitEditPromptRefs(editPrompt)
  const unsupportedRefs = parseUnsupportedContentUnitEditPromptRefs(editPrompt)
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

  for (const ref of unsupportedRefs) {
    blockers.push(unsupportedPromptRefBlocker(ref))
  }

  const resolvedRefs: MovScriptResolvedPromptRef[] = []
  for (const ref of refs) {
    const role: MovScriptPromptRefRole = ref.role ?? 'input'
    const directRef = await resolveDirectPromptResourceRef({
      ref,
      role,
      contentUnit: input.contentUnit,
      contentUnitRef,
      decisionProvider: input.decisionProvider,
      decisionCache,
    })
    if (directRef) {
      if (directRef.blocker) blockers.push(directRef.blocker)
      resolvedRefs.push(directRef)
      continue
    }
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

    const resourceId = promptInputResourceId(decision)
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
      replacement: resourceToken(resourceId, ref),
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
  const structured = normalizedPromptStructured(editPrompt?.structured, contentUnitType, outputKind)
  const structuredText = structuredPromptText(structured, contentUnitType, outputKind)
  const referenceAssets = referenceAssetsForResolvedRefs(resolvedRefs)
  const compiledText = compiledPromptTextWithStructured({
    text: compilePromptText(stringField(editPrompt?.text), resolvedRefs, 'edit_prompt.text'),
    structuredText: compilePromptText(structuredText, resolvedRefs, 'edit_prompt.structured'),
  })
  const prompt: MovScriptCompiledContentUnitPrompt = pruneUndefined({
    schema: 'movscript.backend_prompt.v1' as const,
    content_unit_ref: contentUnitRef,
    content_unit_id: input.contentUnit.id,
    content_unit_type: contentUnitType,
    output_kind: outputKind,
    text: compiledText,
    negative_text: compilePromptText(stringField(editPrompt?.negative_text), resolvedRefs, 'edit_prompt.negative_text'),
    notes: compilePromptText(stringField(editPrompt?.notes), resolvedRefs, 'edit_prompt.notes'),
    structured,
    structured_text: structuredText,
    style_reference_resource_ids: styleReferenceResourceIds.length > 0 ? styleReferenceResourceIds : undefined,
    resource_ids: uniqueIds([
      ...replacements.map((replacement) => replacement.resource_id),
      ...styleReferenceResourceIds,
    ]),
    reference_assets: referenceAssets.length > 0 ? referenceAssets : undefined,
    replacements,
    refs: resolvedRefs,
    blockers: blockers.length > 0 ? dedupeBlockers(blockers) : undefined,
  })

  if (blockers.length > 0) {
    return { ok: false, prompt, blockers: dedupeBlockers(blockers) }
  }
  return { ok: true, prompt }
}

function contentUnitEditPrompt(value: unknown, promptText: string | undefined): Record<string, unknown> | undefined {
  const base = recordField(value)
  if (promptText === undefined) return base
  return {
    ...(base ?? {}),
    text: promptText,
  }
}

export function parseContentUnitEditPromptRefs(editPrompt: unknown): MovScriptPromptRef[] {
  const prompt = recordField(editPrompt)
  const structuredText = structuredPromptTextFromUnknown(prompt?.structured)
  return [
    ...parsePromptRefsFromText(stringField(prompt?.text), 'edit_prompt.text'),
    ...parsePromptRefsFromText(stringField(prompt?.negative_text), 'edit_prompt.negative_text'),
    ...parsePromptRefsFromText(stringField(prompt?.notes), 'edit_prompt.notes'),
    ...parsePromptRefsFromText(structuredText, 'edit_prompt.structured'),
  ]
}

export function parseUnsupportedContentUnitEditPromptRefs(editPrompt: unknown): MovScriptUnsupportedPromptRef[] {
  const prompt = recordField(editPrompt)
  const structuredText = structuredPromptTextFromUnknown(prompt?.structured)
  return [
    ...parseUnsupportedPromptRefsFromText(stringField(prompt?.text), 'edit_prompt.text'),
    ...parseUnsupportedPromptRefsFromText(stringField(prompt?.negative_text), 'edit_prompt.negative_text'),
    ...parseUnsupportedPromptRefsFromText(stringField(prompt?.notes), 'edit_prompt.notes'),
    ...parseUnsupportedPromptRefsFromText(structuredText, 'edit_prompt.structured'),
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
    const payload = parsePromptRefPayload(match[2])
    if (!kind || !payload.id) continue
    refs.push({
      kind,
      id: payload.id,
      raw: match[0],
      ...(payload.role ? { role: payload.role } : {}),
      ...(payload.mediaType ? { media_type: payload.mediaType } : {}),
      source: {
        field,
        start: match.index,
        end: match.index === undefined ? undefined : match.index + match[0].length,
      },
    })
  }
  return refs
}

export function parseUnsupportedPromptRefsFromText(
  text: string | undefined,
  field: MovScriptPromptRef['source']['field'],
): MovScriptUnsupportedPromptRef[] {
  if (!text) return []
  const refs: MovScriptUnsupportedPromptRef[] = []
  for (const match of text.matchAll(PROMPT_REF_PATTERN)) {
    const kindValue = match[1]?.trim()
    const id = parsePromptRefPayload(match[2]).id
    if (!kindValue || !id || promptRefKind(kindValue)) continue
    refs.push({
      kind: kindValue,
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

function parsePromptRefPayload(value: string | undefined): { id: string; role?: MovScriptPromptRefRole; mediaType?: MovScriptPromptRefMediaType } {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  const id = parts.shift() ?? ''
  let role = ''
  let mediaType = ''
  for (const part of parts) {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(.+)$/)
    if (!match) continue
    const key = normalizePromptRefMetadataPart(match[1])
    const metadataValue = normalizePromptRefMetadataPart(match[2])
    if (!metadataValue) continue
    if (key === 'role') role = metadataValue
    if (key === 'media' || key === 'media_type' || key === 'mediatype') mediaType = metadataValue
  }
  return {
    id,
    ...(role ? { role } : {}),
    ...(mediaType ? { mediaType } : {}),
  }
}

function normalizePromptRefMetadataPart(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/^['"]|['"]$/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizedPromptStructured(
  value: unknown,
  contentUnitType: string,
  outputKind: MovScriptPromptOutputKind,
): Record<string, unknown> | undefined {
  const record = recordField(value)
  if (!record) return undefined
  const shotPlan = shouldCompileSceneMomentShotPlan(contentUnitType, outputKind)
    ? normalizedShotPlan(record.shot_plan ?? record.shotPlan ?? record.shots)
    : []
  const passthrough = pruneUndefined({
    ...record,
    ...(shotPlan.length > 0 ? { shot_plan: shotPlan } : {}),
  })
  return Object.keys(passthrough).length > 0 ? passthrough : undefined
}

function structuredPromptTextFromUnknown(value: unknown): string | undefined {
  const record = recordField(value)
  if (!record) return undefined
  const shotPlan = normalizedShotPlan(record.shot_plan ?? record.shotPlan ?? record.shots)
  if (shotPlan.length > 0) return renderShotPlanText(shotPlan)
  const json = JSON.stringify(record)
  return json === '{}' ? undefined : json
}

function structuredPromptText(
  structured: Record<string, unknown> | undefined,
  contentUnitType: string,
  outputKind: MovScriptPromptOutputKind,
): string | undefined {
  if (!structured || !shouldCompileSceneMomentShotPlan(contentUnitType, outputKind)) return undefined
  const shotPlan = Array.isArray(structured.shot_plan) ? normalizedShotPlan(structured.shot_plan) : []
  return shotPlan.length > 0 ? renderShotPlanText(shotPlan) : undefined
}

function compiledPromptTextWithStructured(input: {
  text?: string
  structuredText?: string
}): string | undefined {
  const parts = [input.text, input.structuredText].filter((part): part is string => Boolean(part && part.trim()))
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function shouldCompileSceneMomentShotPlan(
  contentUnitType: string,
  outputKind: MovScriptPromptOutputKind,
): boolean {
  return outputKind === 'video' && (contentUnitType === 'scene_moment_ref' || contentUnitType === 'scence_moment_ref')
}

function normalizedShotPlan(value: unknown): MovScriptShotPlanItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index): MovScriptShotPlanItem[] => {
    const record = recordField(item)
    if (!record) return []
    const normalized = pruneUndefined({
      order: positiveNumber(record.order ?? record.index ?? record.shot_number ?? record.shotNumber) ?? index + 1,
      title: stringField(record.title ?? record.name),
      duration_sec: positiveNumber(record.duration_sec ?? record.durationSec ?? record.duration),
      action: stringField(record.action ?? record.description ?? record.intent),
      result: stringField(record.result ?? record.end_state ?? record.endState),
      dialogue: stringField(record.dialogue),
      narration: stringField(record.narration),
      shot_size: stringField(record.shot_size ?? record.shotSize ?? record.shot_type ?? record.shotType),
      camera_angle: stringField(record.camera_angle ?? record.cameraAngle ?? record.angle),
      camera_motion: stringField(record.camera_motion ?? record.cameraMotion ?? record.movement),
      lighting: stringField(record.lighting ?? record.lighting_style ?? record.lightingStyle),
      depth_of_field: stringField(record.depth_of_field ?? record.depthOfField ?? record.dof),
      composition: stringField(record.composition),
      transition: stringField(record.transition),
      notes: stringField(record.notes ?? record.note),
    }) as MovScriptShotPlanItem
    const hasCreativeContent = Boolean(
      normalized.title
      || normalized.action
      || normalized.result
      || normalized.dialogue
      || normalized.narration
      || normalized.shot_size
      || normalized.camera_angle
      || normalized.camera_motion
      || normalized.lighting
      || normalized.depth_of_field
      || normalized.composition
      || normalized.transition
      || normalized.notes,
    )
    return hasCreativeContent ? [normalized] : []
  })
}

function renderShotPlanText(shotPlan: MovScriptShotPlanItem[]): string {
  const lines = [
    'LOCKED SCENE MOMENT SHOT PLAN:',
    'Generate this scene moment as one continuous video while preserving the following shot order and cinematic parameters. Do not drop, merge, reorder, or contradict non-empty shot fields.',
  ]
  for (const shot of shotPlan) {
    const label = `Shot ${shot.order ?? '?'}${shot.title ? ` - ${shot.title}` : ''}`
    const fields = [
      label,
      shot.duration_sec !== undefined ? `duration=${shot.duration_sec}s` : undefined,
      shot.action ? `action=${shot.action}` : undefined,
      shot.result ? `result=${shot.result}` : undefined,
      shot.dialogue ? `dialogue=${shot.dialogue}` : undefined,
      shot.narration ? `narration=${shot.narration}` : undefined,
      shot.shot_size ? `shot_size=${shot.shot_size}` : undefined,
      shot.camera_angle ? `camera_angle=${shot.camera_angle}` : undefined,
      shot.camera_motion ? `camera_motion=${shot.camera_motion}` : undefined,
      shot.lighting ? `lighting=${shot.lighting}` : undefined,
      shot.depth_of_field ? `depth_of_field=${shot.depth_of_field}` : undefined,
      shot.composition ? `composition=${shot.composition}` : undefined,
      shot.transition ? `transition=${shot.transition}` : undefined,
      shot.notes ? `notes=${shot.notes}` : undefined,
    ].filter((field): field is string => Boolean(field))
    lines.push(`- ${fields.join('; ')}`)
  }
  return lines.join('\n')
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

function unsupportedPromptRefBlocker(ref: MovScriptUnsupportedPromptRef): MovScriptPromptBuildBlocker {
  return {
    code: 'unsupported_prompt_ref_kind',
    ref: ref.raw,
    message: `unsupported prompt ref kind "${ref.kind}": ${ref.raw}. Use system primitive, content_unit, candidate, or resource refs; namespace vocabulary is context, not a selected-resource dependency.`,
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
    const candidates = Array.isArray(decision.candidates) ? decision.candidates : []
    if (latestResourceCandidate(candidates)) return undefined
    return candidates.length > 0
      ? {
        code: 'upstream_resource_missing',
        ref: ref.raw,
        content_unit_ref: upstreamRef,
        content_unit_id: upstream.id,
        message: `prompt input latest backend candidate has no resource_id: ${ref.raw}`,
      }
      : {
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
  if (promptInputResourceId(decision) === undefined) {
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

async function resolveDirectPromptResourceRef(input: {
  ref: MovScriptPromptRef
  role: MovScriptPromptRefRole
  contentUnit: MovScriptWorkspaceIndexedEntity
  contentUnitRef: string
  decisionProvider: MovScriptContentUnitDecisionProvider
  decisionCache: Map<string, Promise<MovScriptPromptDecisionContext | undefined>>
}): Promise<MovScriptResolvedPromptRef | undefined> {
  const { ref, role } = input
  if (ref.kind === 'resource') {
    const resourceId = resourceIdField(ref.id)
    if (resourceId === undefined) {
      const blocker: MovScriptPromptBuildBlocker = {
        code: 'ref_not_found',
        ref: ref.raw,
        resource_ref: ref.id,
        message: `prompt resource ref does not resolve: ${ref.raw}`,
      }
      return { ...ref, role, blocker }
    }
    return {
      ...ref,
      role,
      resolved: {
        entityKind: 'resource',
        id: resourceId,
      },
      resource_id: resourceId,
      replacement: resourceToken(resourceId, ref),
    }
  }
  if (ref.kind !== 'candidate') return undefined
  if (input.contentUnit.id === undefined) {
    const blocker: MovScriptPromptBuildBlocker = {
      code: 'content_unit_id_missing',
      ref: ref.raw,
      content_unit_ref: input.contentUnitRef,
      message: `content unit is missing id for candidate ref: ${ref.raw}`,
    }
    return { ...ref, role, blocker }
  }
  const decision = await decisionFor(
    input.decisionProvider,
    input.decisionCache,
    input.contentUnit.id,
    input.contentUnitRef,
  )
  if (!decision) {
    const blocker: MovScriptPromptBuildBlocker = {
      code: 'decision_context_missing',
      ref: ref.raw,
      content_unit_ref: input.contentUnitRef,
      content_unit_id: input.contentUnit.id,
      message: `prompt candidate ref has no backend decision context: ${ref.raw}`,
    }
    return { ...ref, role, blocker }
  }
  const candidate = Array.isArray(decision.candidates)
    ? decision.candidates.find((item) => sameId(item.id, ref.id))
    : undefined
  if (!candidate) {
    const blocker: MovScriptPromptBuildBlocker = {
      code: 'upstream_candidate_missing',
      ref: ref.raw,
      content_unit_ref: input.contentUnitRef,
      content_unit_id: input.contentUnit.id,
      message: `prompt candidate ref is missing: ${ref.raw}`,
    }
    return { ...ref, role, blocker }
  }
  const resourceId = firstCandidateResourceId(candidate)
  if (resourceId === undefined) {
    const blocker: MovScriptPromptBuildBlocker = {
      code: 'upstream_resource_missing',
      ref: ref.raw,
      content_unit_ref: input.contentUnitRef,
      content_unit_id: input.contentUnit.id,
      message: `prompt candidate ref has no resource_id: ${ref.raw}`,
    }
    return { ...ref, role, blocker }
  }
  return {
    ...ref,
    role,
    resolved: {
      entityKind: 'candidate',
      id: ref.id,
    },
    upstream_content_unit_ref: input.contentUnitRef,
    upstream_content_unit_id: input.contentUnit.id,
    resource_id: resourceId,
    replacement: resourceToken(resourceId, ref),
  }
}

function selectedDecision(decision: MovScriptPromptDecisionContext): Record<string, unknown> | undefined {
  const selection = recordField(decision.selection)
  return selection && Object.keys(selection).length > 0 ? selection : undefined
}

function promptInputResourceId(decision: MovScriptPromptDecisionContext | undefined): number | undefined {
  if (decision && selectedDecision(decision)) return selectedResourceId(decision)
  return firstCandidateResourceId(latestResourceCandidate(decision?.candidates))
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

function latestResourceCandidate(candidates: Record<string, unknown>[] | undefined): Record<string, unknown> | undefined {
  const resourceCandidates = Array.isArray(candidates)
    ? candidates.filter((candidate) => firstCandidateResourceId(candidate) !== undefined)
    : []
  if (resourceCandidates.length === 0) return undefined
  const withTimestamp = resourceCandidates
    .map((candidate, index) => ({
      candidate,
      index,
      timestamp: candidateTimestamp(candidate),
    }))
  return withTimestamp
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp
      return right.index - left.index
    })[0]?.candidate
}

function candidateTimestamp(candidate: Record<string, unknown>): number {
  const raw = stringField(candidate.updated_at ?? candidate.updatedAt ?? candidate.created_at ?? candidate.createdAt)
  if (!raw) return 0
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
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
  if (ref.kind === 'candidate' || ref.kind === 'resource') return undefined
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
  if (ref.kind === 'candidate' || ref.kind === 'resource') return undefined
  if (ref.kind === 'content_unit') return resolvePromptRefEntity(index, ref)
  const kind = ref.kind
  const expectedTypes = contentUnitTypesForPromptRefKind(kind)
  return queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
    .find((entity) => {
      if (!expectedTypes.includes(String(entity.record.content_unit_type ?? ''))) return false
      return primaryContentUnitRefs(entity, kind)
        .some((candidate) => samePromptRefId(candidate.id, ref.id, kind))
    })
}

interface PrimaryContentUnitRef {
  kind: MovScriptContentUnitPromptRefKind
  id: string
}

function primaryContentUnitRefs(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  kind: MovScriptContentUnitPromptRefKind,
): PrimaryContentUnitRef[] {
  return flatPrimaryRefIds(contentUnit.record, kind).map((id) => ({ kind, id }))
}

function flatPrimaryRefIds(record: Record<string, unknown>, kind: MovScriptContentUnitPromptRefKind): string[] {
  return domainPrimaryRefIdsForContentUnitRecord(record, kind)
}

function hasAmbiguousPrimaryRefs(refs: PrimaryContentUnitRef[], kind: MovScriptContentUnitPromptRefKind): boolean {
  const unique: PrimaryContentUnitRef[] = []
  for (const ref of refs) {
    if (unique.some((item) => samePromptRefId(item.id, ref.id, kind))) continue
    unique.push(ref)
  }
  return unique.length > 1
}

function samePromptRefId(left: unknown, right: unknown, kind: MovScriptContentUnitPromptRefKind): boolean {
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
  entityKind: Exclude<MovScriptContentUnitPromptRefKind, 'content_unit'>,
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
  if (value === 'candidate' || value === 'resource') return value
  return isContentUnitPromptRefKind(value) ? value : undefined
}

function primaryRefKindForContentUnitType(contentUnitType: string): MovScriptContentUnitPromptRefKind | undefined {
  return domainPrimaryRefKindForContentUnitType(contentUnitType)
}

function contentUnitTypesForPromptRefKind(kind: MovScriptContentUnitPromptRefKind): string[] {
  return domainContentUnitTypesForPromptRefKind(kind)
}

function contentUnitOutputKind(value: unknown): MovScriptPromptOutputKind {
  return domainOutputKindForContentUnitType('', value)
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

function referenceAssetsForResolvedRefs(refs: MovScriptResolvedPromptRef[]): MovScriptCompiledPromptReferenceAsset[] {
  const seen = new Set<string>()
  const output: MovScriptCompiledPromptReferenceAsset[] = []
  for (const ref of refs) {
    if (ref.resource_id === undefined) continue
    const mediaType = promptRefMediaTypeForReference(ref)
    const role = promptRefRoleForReference(ref, mediaType)
    const key = `${String(ref.resource_id)}:${mediaType}:${role}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push({
      resource_id: ref.resource_id,
      media_type: mediaType,
      role,
      source_ref: ref.raw,
    })
  }
  return output
}

function resourceToken(resourceId: number, ref?: Pick<MovScriptPromptRef, 'role' | 'media_type'>): string {
  const mediaType = ref?.media_type
  const role = ref?.role && ref.role !== 'input' ? ref.role : undefined
  return formatResourceMention(resourceId, {
    ...(mediaType ? { mediaType } : {}),
    ...(role ? { role } : {}),
  })
}

function promptRefRoleForReference(ref: Pick<MovScriptPromptRef, 'role' | 'media_type'>, mediaType: string): MovScriptPromptRefRole {
  if (ref.role && ref.role !== 'input') return ref.role
  if (mediaType === 'video') return 'reference_video'
  if (mediaType === 'audio') return 'reference_audio'
  return 'reference_image'
}

function promptRefMediaTypeForReference(ref: Pick<MovScriptPromptRef, 'role' | 'media_type'>): MovScriptPromptRefMediaType {
  if (ref.media_type) return ref.media_type
  if (ref.role === 'reference_video' || ref.role === 'motion_reference' || ref.role === 'source_video') return 'video'
  if (ref.role === 'reference_audio' || ref.role === 'source_audio') return 'audio'
  return 'image'
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

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
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

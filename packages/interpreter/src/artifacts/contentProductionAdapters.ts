import type {
  AdapterContext,
  AdapterDependencies,
  ContentUnitAdapter,
  ContentUnitDependencyReport,
  ContentUnitOutputKind,
  ContentUnitPromptBlocker,
  ContentUnitPromptRef,
  ContentUnitPromptRefKind,
  ContentUnitResolvedRef,
  ContentUnitRuntimePanel,
  NormalizedContentUnitPrompt,
} from './contentProductionTypes.js'
import {
  contentUnitTargetAdapterFor,
  contentUnitTargetValidationDiagnostics,
  isContentUnitPromptRefKind,
  MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES,
} from '@movscript/domain'
import {
  contentUnitOutputKind,
  entityDir,
  expectedOutputKindForContentUnitType,
  findEntityByRef,
  hasAmbiguousPrimaryRefs,
  idField,
  isRecord,
  parseContentUnitEditPromptRefs,
  parseUnsupportedContentUnitEditPromptRefs,
  primaryContentUnitRefs,
  primaryRefFieldNameForKind,
  projectStyleReferenceResourceIds,
  readContentUnitCandidate,
  readSelectedContentUnit,
  recordField,
  resolveContentUnitForPromptRef,
  resolvePromptRefs,
  stableJsonValue,
  stringField,
  arrayField,
  resourceIdField,
} from './contentProductionHelpers.js'

const CONTENT_UNIT_ADAPTERS: Record<string, ContentUnitAdapter> = Object.fromEntries(
  MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES.map((contentUnitType) => [contentUnitType, specializedAdapter(contentUnitType)]),
)

export function hasSpecializedContentUnitAdapter(contentUnitType: unknown): boolean {
  return typeof contentUnitType === 'string' && CONTENT_UNIT_ADAPTERS[contentUnitType] !== undefined
}

export function contentUnitAdapterFor(contentUnitType: string): ContentUnitAdapter {
  return CONTENT_UNIT_ADAPTERS[contentUnitType] ?? genericAdapter(contentUnitType)
}

function specializedAdapter(contentUnitType: string): ContentUnitAdapter {
  if (contentUnitType === 'expression_unit_ref') return expressionUnitAdapter()
  const targetAdapter = contentUnitTargetAdapterFor(contentUnitType)
  if (!targetAdapter?.primaryRefKind || !targetAdapter.outputKind) return genericAdapter(contentUnitType)
  return refAdapter(targetAdapter.contentUnitType, targetAdapter.primaryRefKind, targetAdapter.outputKind)
}

function genericAdapter(contentUnitType: string): ContentUnitAdapter {
  return {
    type: contentUnitType,
    version: 'generic_prompt@1',
    outputKind: 'metadata',
    validate(context) {
      return contentUnitTargetIssues(context.contentUnit.record)
    },
    derivePrompt(context) {
      return basePrompt(context, {
        adapterVersion: this.version,
        outputKind: contentUnitOutputKind(context.contentUnit.record.output_kind),
        primaryKind: undefined,
        blockers: [],
      })
    },
    collectDependencies(_context, prompt) {
      return dependenciesFromPrompt(prompt)
    },
    deriveRuntimePanel(context, derivation) {
      return runtimePanelFor(context, this.version, derivation.prompt)
    },
  }
}

function refAdapter(
  type: string,
  primaryKind: ContentUnitPromptRefKind,
  outputKind: ContentUnitOutputKind,
): ContentUnitAdapter {
  return {
    type,
    version: `${type}@2`,
    outputKind,
    validate(context) {
      const issues: ContentUnitDependencyReport['issues'] = contentUnitTargetIssues(context.contentUnit.record)
      const expectedOutputKind = expectedOutputKindForContentUnitType(type)
      if (expectedOutputKind && context.contentUnit.record.output_kind !== expectedOutputKind) {
        issues.push({ severity: 'error', message: `${type} output_kind must be ${expectedOutputKind}` })
      }
      const primaryRefs = primaryContentUnitRefs(context.contentUnit, primaryKind)
      const primaryFieldName = primaryRefFieldNameForKind(primaryKind)
      if (primaryRefs.length === 0) {
        issues.push({ severity: 'error', message: `${type} requires ${primaryFieldName}` })
      }
      if (hasAmbiguousPrimaryRefs(primaryRefs, primaryKind)) {
        issues.push({ severity: 'error', message: `${type} accepts only one ${primaryFieldName}` })
      }
      for (const ref of primaryRefs) {
        if (ref.kind !== 'content_unit' && !findEntityByRef(context.index, ref.kind, ref.id)) {
          issues.push({ severity: 'error', message: `${type} ${primaryFieldName} does not resolve: ${ref.id}` })
        }
      }
      return issues
    },
    derivePrompt(context) {
      const prompt = basePrompt(context, {
        adapterVersion: this.version,
        outputKind,
        primaryKind,
        blockers: [],
      })
      const blockers = [
        ...(prompt.blockers ?? []),
        ...promptBlockers(context, prompt.refs, primaryKind),
      ]
      return {
        ...prompt,
        blockers: blockers.length > 0 ? dedupeBlockers(blockers) : undefined,
      }
    },
    collectDependencies(context, prompt) {
      const dependencies = dependenciesFromPrompt(prompt)
      return {
        ...dependencies,
        blockers: prompt.blockers ?? promptBlockers(context, prompt.refs, primaryKind),
      }
    },
    deriveRuntimePanel(context, derivation) {
      return runtimePanelFor(context, this.version, derivation.prompt)
    },
  }
}

function contentUnitTargetIssues(record: Record<string, unknown>): ContentUnitDependencyReport['issues'] {
  return contentUnitTargetValidationDiagnostics(record)
    .map((diagnostic) => ({ severity: diagnostic.severity, message: diagnostic.message }))
}

function expressionUnitAdapter(): ContentUnitAdapter {
  return {
    ...refAdapter('expression_unit_ref', 'expression_unit', 'metadata'),
    version: 'expression_unit_ref@1',
    outputKind: 'metadata',
    derivePrompt(context) {
      const outputKind = contentUnitOutputKind(context.contentUnit.record.output_kind)
      const prompt = basePrompt(context, {
        adapterVersion: this.version,
        outputKind,
        primaryKind: 'expression_unit',
        blockers: [],
      })
      const blockers = [
        ...(prompt.blockers ?? []),
        ...promptBlockers(context, prompt.refs, 'expression_unit'),
      ]
      return {
        ...prompt,
        blockers: blockers.length > 0 ? dedupeBlockers(blockers) : undefined,
      }
    },
  }
}

function basePrompt(
  context: AdapterContext,
  options: {
    adapterVersion: string
    outputKind: ContentUnitOutputKind
    primaryKind: ContentUnitPromptRefKind | undefined
    blockers: ContentUnitPromptBlocker[]
  },
): NormalizedContentUnitPrompt {
  const editPrompt = normalizedEditPrompt(context.contentUnit.record.edit_prompt)
  const refs = parseContentUnitEditPromptRefs(context.contentUnit.record.edit_prompt)
  const generationRefs = contentUnitGenerationPromptRefs(context.contentUnit.record)
  const hasGenerationReferencePool = hasExplicitGenerationReferencePool(context.contentUnit.record)
  const unsupportedRefs = parseUnsupportedContentUnitEditPromptRefs(context.contentUnit.record.edit_prompt)
  const resolved = resolvePromptRefs(context.index, refs, options.primaryKind)
  const resolvedGeneration = resolvePromptRefs(context.index, generationRefs, options.primaryKind)
  const resolvedRefs = resolved.refs.map((ref) => annotateInputSelectionStatus(context, ref))
  const resolvedGenerationRefs = resolvedGeneration.refs.map((ref) => annotateInputSelectionStatus(context, ref))
  const modelIntent = recordField(context.contentUnit.record.model_intent)
  const styleReferenceResourceIds = usesVisualStyleReferences(options.outputKind)
    ? projectStyleReferenceResourceIds(context.index)
    : []
  const semanticInputs = resolvedRefs
    .filter((ref) => ref.role === 'input' && ref.selection?.resource_id !== undefined && ref.selection.stale !== true)
    .map((ref) => ({
      role: `${ref.kind}_ref`,
      kind: inputKindForRef(context, ref),
      ref: ref.raw,
      source_content_unit_ref: ref.selection?.content_unit_ref,
      candidate_id: ref.selection?.candidate_id,
      resource_id: ref.selection?.resource_id,
      provider_asset: ref.selection?.provider_asset,
      required: true,
    }))
  const generationSemanticInputs = resolvedGenerationRefs
    .filter((ref) => ref.role === 'input' && ref.selection?.resource_id !== undefined && ref.selection.stale !== true)
    .map((ref) => ({
      role: `${ref.kind}_ref`,
      kind: inputKindForRef(context, ref),
      ref: ref.raw,
      source_content_unit_ref: ref.selection?.content_unit_ref,
      candidate_id: ref.selection?.candidate_id,
      resource_id: ref.selection?.resource_id,
      provider_asset: ref.selection?.provider_asset,
      required: true,
    }))
  const generationResourceInputs = contentUnitGenerationResourceInputs(context.contentUnit.record)
  const blockers = [
    ...options.blockers,
    ...unsupportedRefs.map((ref) => ({
      code: 'unsupported_prompt_ref_kind' as const,
      ref: ref.raw,
      message: `unsupported prompt ref kind "${ref.kind}": ${ref.raw}. Use system primitive, content_unit, candidate, or resource refs; namespace vocabulary is context, not a selected-resource dependency.`,
    })),
    ...inputBlockers(context, resolvedRefs),
  ]
  const runtimeRequest = {
    capability: stringField(modelIntent?.capability) ?? capabilityForOutputKind(options.outputKind),
    model_intent: modelIntent,
    inputs: [
      ...(hasGenerationReferencePool ? [...generationSemanticInputs, ...generationResourceInputs] : semanticInputs),
      ...styleReferenceResourceIds.map((resourceId) => ({
        role: 'style_reference',
        kind: 'image' as const,
        resource_id: resourceId,
        required: false,
      })),
    ],
    params: recordField(modelIntent?.params),
    metadata: metadataForOutputKind(options.outputKind, modelIntent, styleReferenceResourceIds),
  }

  return pruneUndefined({
    schema: 'movscript.content_unit_prompt.v1',
    content_unit_ref: entityDir(context.contentUnit.path),
    content_unit_id: context.contentUnit.id,
    content_unit_type: String(context.contentUnit.record.content_unit_type ?? ''),
    output_kind: options.outputKind,
    adapter_version: options.adapterVersion,
    edit_prompt: editPrompt,
    model_intent: modelIntent,
    refs: resolvedRefs,
    generation_refs: resolvedGenerationRefs.length > 0 ? resolvedGenerationRefs : undefined,
    runtime_request: pruneUndefined(runtimeRequest),
    blockers: blockers.length > 0 ? blockers : undefined,
    created_at: context.createdAt,
  }) as NormalizedContentUnitPrompt
}

function dependenciesFromPrompt(prompt: NormalizedContentUnitPrompt): AdapterDependencies {
  const entities = prompt.refs.reduce<Record<string, NonNullable<AdapterDependencies['entities'][string]>>>((out, ref) => {
    if (!ref.resolved) return out
    out[ref.kind] = [...(out[ref.kind] ?? []), {
      entityKind: ref.resolved.entityKind as never,
      id: ref.resolved.id,
      path: ref.resolved.path ?? '',
      index: 0,
      record: {},
    }]
    return out
  }, {})
  return {
    entities,
    refs: prompt.refs,
    upstreamSelections: prompt.refs.map((ref) => ref.selection).filter(isDefined),
    blockers: prompt.blockers ?? [],
  }
}

function runtimePanelFor(
  context: AdapterContext,
  adapterVersion: string,
  prompt: NormalizedContentUnitPrompt,
): ContentUnitRuntimePanel {
  const status: ContentUnitRuntimePanel['status'] = prompt.blockers?.length ? 'blocked' : 'ready'
  return {
    schema: 'movscript.content_unit_runtime_panel.v1' as const,
    content_unit_ref: entityDir(context.contentUnit.path),
    content_unit_id: context.contentUnit.id,
    content_unit_type: prompt.content_unit_type,
    adapter_version: adapterVersion,
    output_kind: prompt.output_kind,
    status,
    prompt: prompt.edit_prompt,
    runtime_request: prompt.runtime_request,
    review: prompt.blockers?.length ? { blockers: prompt.blockers.map((blocker) => blocker.message) } : undefined,
  }
}

function promptBlockers(
  context: AdapterContext,
  _refs: ContentUnitResolvedRef[],
  primaryKind: ContentUnitPromptRefKind,
): ContentUnitPromptBlocker[] {
  const blockers: ContentUnitPromptBlocker[] = []
  const primaryRefs = primaryContentUnitRefs(context.contentUnit, primaryKind)
  const primaryFieldName = primaryRefFieldNameForKind(primaryKind)
  if (primaryRefs.length === 0) {
    blockers.push({
      code: 'primary_ref_missing',
      message: `${context.contentUnit.record.content_unit_type} requires ${primaryFieldName}`,
    })
  }
  if (hasAmbiguousPrimaryRefs(primaryRefs, primaryKind)) {
    blockers.push({
      code: 'primary_ref_ambiguous',
      message: `${context.contentUnit.record.content_unit_type} accepts only one ${primaryFieldName}`,
    })
  }
  for (const ref of primaryRefs) {
    if (ref.kind !== 'content_unit' && !findEntityByRef(context.index, ref.kind, ref.id)) {
      blockers.push({
        code: 'ref_not_found',
        ref: ref.id,
        message: `primary ref does not resolve: ${ref.id}`,
      })
    }
  }
  return blockers
}

function inputBlockers(
  context: AdapterContext,
  refs: ContentUnitResolvedRef[],
): ContentUnitPromptBlocker[] {
  const blockers: ContentUnitPromptBlocker[] = []
  for (const ref of refs.filter((item) => item.role === 'input')) {
    if (ref.blocker) {
      blockers.push(ref.blocker)
      continue
    }
    if (!ref.resolved) {
      blockers.push({
        code: 'ref_not_found',
        ref: ref.raw,
        message: `prompt input ref does not resolve: ${ref.raw}`,
      })
      continue
    }
    const upstreamContentUnit = resolveContentUnitForPromptRef(context.index, ref)
    if (!upstreamContentUnit) {
      blockers.push({
        code: 'upstream_content_unit_not_found',
        ref: ref.raw,
        message: `prompt input has no ${ref.kind}_ref content unit: ${ref.raw}`,
      })
      continue
    }
    if (!ref.selection) {
      blockers.push({
        code: 'upstream_selection_missing',
        ref: ref.raw,
        message: `prompt input content unit has no selected candidate: ${ref.raw}`,
      })
      continue
    }
    if (ref.selection.stale === true) {
      blockers.push({
        code: 'upstream_selection_stale',
        ref: ref.raw,
        message: `prompt input selected candidate is stale: ${ref.raw}`,
      })
      continue
    }
    if (ref.selection.resource_id === undefined) {
      blockers.push({
        code: 'upstream_resource_missing',
        ref: ref.raw,
        message: `prompt input selected candidate has no resource_id: ${ref.raw}`,
      })
    }
  }
  return blockers
}

function dedupeBlockers(blockers: ContentUnitPromptBlocker[]): ContentUnitPromptBlocker[] {
  const seen = new Set<string>()
  const output: ContentUnitPromptBlocker[] = []
  for (const blocker of blockers) {
    const key = `${blocker.code}:${blocker.ref ?? ''}:${blocker.message}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(blocker)
  }
  return output
}

function annotateInputSelectionStatus(
  context: AdapterContext,
  ref: ContentUnitResolvedRef,
): ContentUnitResolvedRef {
  if (ref.role !== 'input' || !ref.selection) return ref
  const status = upstreamSelectionStatus(context, ref)
  if (!status) return ref
  return {
    ...ref,
    selection: {
      ...ref.selection,
      stale: status.stale,
    },
    ...(status.blocker ? { blocker: status.blocker } : {}),
  }
}

function upstreamSelectionStatus(
  context: AdapterContext,
  ref: ContentUnitResolvedRef,
): { stale: boolean; blocker?: ContentUnitPromptBlocker } | undefined {
  const upstreamContentUnit = resolveContentUnitForPromptRef(context.index, ref)
  if (!upstreamContentUnit) return undefined
  const upstreamRef = entityDir(upstreamContentUnit.path)
  const currentRef = entityDir(context.contentUnit.path)
  const stack = context.promptStack ?? []
  if (upstreamRef === currentRef || stack.includes(upstreamRef)) {
    return {
      stale: true,
      blocker: {
        code: 'prompt_dependency_cycle',
        ref: ref.raw,
        message: `prompt input forms a dependency cycle: ${ref.raw}`,
      },
    }
  }

  const selection = readSelectedContentUnit(context.index, upstreamRef)
  const candidateId = idField(selection?.candidate_id)
  const candidate = candidateId === undefined ? undefined : readContentUnitCandidate(context.index, upstreamRef, candidateId)
  if (candidateId !== undefined && !candidate) {
    return {
      stale: true,
      blocker: {
        code: 'upstream_candidate_missing',
        ref: ref.raw,
        message: `prompt input selected candidate is missing: ${ref.raw}`,
      },
    }
  }
  const candidatePrompt = normalizedContentUnitPrompt(candidate?.prompt_snapshot)
  if (!candidatePrompt) return { stale: true }

  const contentUnitType = stringField(upstreamContentUnit.record.content_unit_type)
  if (!contentUnitType) return { stale: true }
  const adapter = contentUnitAdapterFor(contentUnitType)
  const currentPrompt = adapter.derivePrompt({
    ...context,
    contentUnit: upstreamContentUnit,
    promptStack: [...stack, currentRef],
  })
  return { stale: !sameCanonicalPrompt(currentPrompt, candidatePrompt) }
}

function sameCanonicalPrompt(left: NormalizedContentUnitPrompt, right: NormalizedContentUnitPrompt): boolean {
  return JSON.stringify(stableJsonValue(canonicalPromptComparisonValue(left)))
    === JSON.stringify(stableJsonValue(canonicalPromptComparisonValue(right)))
}

function canonicalPromptComparisonValue(prompt: NormalizedContentUnitPrompt): unknown {
  const refs = Array.isArray(prompt.refs) ? prompt.refs : []
  const generationRefs = Array.isArray(prompt.generation_refs) ? prompt.generation_refs : []
  const blockers = Array.isArray(prompt.blockers) ? prompt.blockers : []
  const normalizedRef = (ref: ContentUnitResolvedRef) => ({
    kind: ref.kind,
    id: ref.id,
    raw: ref.raw,
    role: ref.role,
    resolved: ref.resolved,
    selection: ref.selection ? {
      content_unit_ref: ref.selection.content_unit_ref,
      candidate_id: ref.selection.candidate_id,
      resource_id: ref.selection.resource_id,
      artifact_ref: ref.selection.artifact_ref,
      provider_asset: ref.selection.provider_asset,
    } : undefined,
  })
  return {
    content_unit_type: prompt.content_unit_type,
    output_kind: prompt.output_kind,
    edit_prompt: prompt.edit_prompt,
    model_intent: prompt.model_intent,
    refs: refs.map(normalizedRef),
    generation_refs: generationRefs.map(normalizedRef),
    runtime_request: prompt.runtime_request,
    blockers: blockers.map((blocker) => ({
      code: blocker.code,
      ref: blocker.ref,
    })),
  }
}

function normalizedContentUnitPrompt(value: unknown): NormalizedContentUnitPrompt | undefined {
  const record = recordField(value)
  if (!record) return undefined
  if (record.schema !== 'movscript.content_unit_prompt.v1' && record.schema !== 'movscript.content_unit_generation_prompt_snapshot.v1') return undefined
  if (!Array.isArray(record.refs)) return undefined
  if (!recordField(record.runtime_request)) return undefined
  return record as unknown as NormalizedContentUnitPrompt
}

function normalizedEditPrompt(value: unknown): NormalizedContentUnitPrompt['edit_prompt'] | undefined {
  const record = recordField(value)
  if (!record) return undefined
  return pruneUndefined({
    text: stringField(record.text),
    negative_text: stringField(record.negative_text),
    notes: stringField(record.notes),
    structured: isRecord(record.structured) ? record.structured : undefined,
  })
}

function capabilityForOutputKind(outputKind: ContentUnitOutputKind): string {
  switch (outputKind) {
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'text':
      return 'text'
    default:
      return 'metadata'
  }
}

function inputKindForRef(context: AdapterContext, ref: ContentUnitResolvedRef): 'image' | 'video' | 'audio' | 'text' | 'metadata' {
  const upstream = resolveContentUnitForPromptRef(context.index, ref)
  return contentUnitOutputKind(upstream?.record.output_kind)
}

function hasExplicitGenerationReferencePool(record: Record<string, unknown>): boolean {
  return arrayField(record.generation_references ?? record.generationReferences).some(isRecord)
    || arrayField(record.reference_assets ?? record.referenceAssets).some(isRecord)
}

function contentUnitGenerationPromptRefs(record: Record<string, unknown>): ContentUnitPromptRef[] {
  return arrayField(record.generation_references ?? record.generationReferences).flatMap((item): ContentUnitPromptRef[] => {
    if (!isRecord(item)) return []
    const kindValue = stringField(item.kind ?? item.ref_kind ?? item.refKind ?? item.type)
    if (!isContentUnitPromptRefKind(kindValue)) return []
    const id = idField(item.ref ?? item.target_ref ?? item.targetRef ?? item.id)
    if (id === undefined) return []
    const raw = stringField(item.raw ?? item.source_ref ?? item.sourceRef) ?? `{{${kindValue}::${String(id)}}}`
    return [{
      kind: kindValue,
      id: String(id),
      raw,
      source: { field: 'generation_references' },
    }]
  })
}

function contentUnitGenerationResourceInputs(record: Record<string, unknown>): NormalizedContentUnitPrompt['runtime_request']['inputs'] {
  const fromGenerationReferences = arrayField(record.generation_references ?? record.generationReferences).flatMap((item) => {
    if (!isRecord(item)) return []
    const kind = stringField(item.kind ?? item.ref_kind ?? item.refKind ?? item.type)
    const resourceId = resourceIdField(item.resource_id ?? item.resourceId)
      ?? (kind === 'resource' ? resourceIdField(item.ref ?? item.target_ref ?? item.targetRef) : undefined)
    if (resourceId === undefined) return []
    const mediaType = generationReferenceMediaType(item.media_type ?? item.mediaType, item.role)
    return [{
      role: stringField(item.role) ?? generationReferenceRoleForMediaType(mediaType),
      kind: mediaType,
      ref: stringField(item.raw ?? item.source_ref ?? item.sourceRef),
      resource_id: resourceId,
      required: true,
    }]
  })
  const fromReferenceAssets = arrayField(record.reference_assets ?? record.referenceAssets).flatMap((item) => {
    if (!isRecord(item)) return []
    const resourceId = resourceIdField(item.resource_id ?? item.resourceId)
    if (resourceId === undefined) return []
    const mediaType = generationReferenceMediaType(item.media_type ?? item.mediaType, item.role)
    return [{
      role: stringField(item.role) ?? generationReferenceRoleForMediaType(mediaType),
      kind: mediaType,
      ref: stringField(item.source_ref ?? item.sourceRef),
      resource_id: resourceId,
      required: true,
    }]
  })
  return [...fromGenerationReferences, ...fromReferenceAssets]
}

function generationReferenceMediaType(value: unknown, role: unknown): 'image' | 'video' | 'audio' | 'text' | 'metadata' {
  const text = `${String(value ?? '')} ${String(role ?? '')}`.toLowerCase()
  if (text.includes('video')) return 'video'
  if (text.includes('audio')) return 'audio'
  if (text.includes('text')) return 'text'
  return 'image'
}

function generationReferenceRoleForMediaType(mediaType: 'image' | 'video' | 'audio' | 'text' | 'metadata'): string {
  if (mediaType === 'video') return 'reference_video'
  if (mediaType === 'audio') return 'reference_audio'
  if (mediaType === 'text') return 'reference_text'
  return 'reference_image'
}

function usesVisualStyleReferences(outputKind: ContentUnitOutputKind): boolean {
  return outputKind === 'image' || outputKind === 'video'
}

function metadataForOutputKind(
  outputKind: ContentUnitOutputKind,
  modelIntent: Record<string, unknown> | undefined,
  styleReferenceResourceIds: number[],
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {}
  const duration = typeof modelIntent?.duration_sec === 'number' && Number.isFinite(modelIntent.duration_sec)
    ? modelIntent.duration_sec
    : undefined
  if (outputKind === 'video' && duration !== undefined) metadata.duration_sec = duration
  if (styleReferenceResourceIds.length > 0) metadata.style_reference_resource_ids = styleReferenceResourceIds
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

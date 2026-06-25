import type {
  AdapterContext,
  AdapterDependencies,
  ContentUnitAdapter,
  ContentUnitDependencyReport,
  ContentUnitOutputKind,
  ContentUnitPromptBlocker,
  ContentUnitPromptRefKind,
  ContentUnitResolvedRef,
  ContentUnitRuntimePanel,
  NormalizedContentUnitPrompt,
} from './contentProductionTypes.js'
import {
  contentUnitOutputKind,
  entityDir,
  expectedOutputKindForContentUnitType,
  findEntityByRef,
  hasAmbiguousPrimaryRefs,
  idField,
  isRecord,
  parseContentUnitEditPromptRefs,
  primaryContentUnitRefs,
  primaryRefFieldNameForKind,
  projectStyleReferenceResourceIds,
  readSelectedContentUnit,
  recordField,
  resolveContentUnitForPromptRef,
  resolvePromptRefs,
  stableJsonValue,
  stringField,
} from './contentProductionHelpers.js'

const CONTENT_UNIT_ADAPTERS: Record<string, ContentUnitAdapter> = {
  production_ref: refAdapter('production_ref', 'production', 'video'),
  segment_ref: refAdapter('segment_ref', 'segment', 'video'),
  asset_ref: refAdapter('asset_ref', 'asset', 'image'),
  keyframe_ref: refAdapter('keyframe_ref', 'keyframe', 'image'),
  storyboard_ref: refAdapter('storyboard_ref', 'storyboard', 'image'),
  scence_moment_ref: refAdapter('scence_moment_ref', 'scene_moment', 'video'),
  scene_moment_ref: refAdapter('scene_moment_ref', 'scene_moment', 'video'),
  expression_unit_ref: expressionUnitAdapter(),
}

export function hasSpecializedContentUnitAdapter(contentUnitType: unknown): boolean {
  return typeof contentUnitType === 'string' && CONTENT_UNIT_ADAPTERS[contentUnitType] !== undefined
}

export function contentUnitAdapterFor(contentUnitType: string): ContentUnitAdapter {
  return CONTENT_UNIT_ADAPTERS[contentUnitType] ?? genericAdapter(contentUnitType)
}

function genericAdapter(contentUnitType: string): ContentUnitAdapter {
  return {
    type: contentUnitType,
    version: 'generic_prompt@1',
    outputKind: 'metadata',
    validate() {
      return []
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
      const issues: ContentUnitDependencyReport['issues'] = []
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
  const resolved = resolvePromptRefs(context.index, refs, options.primaryKind)
  const resolvedRefs = resolved.refs.map((ref) => annotateInputSelectionStatus(context, ref))
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
  const blockers = [...options.blockers, ...inputBlockers(context, resolvedRefs)]
  const runtimeRequest = {
    capability: stringField(modelIntent?.capability) ?? capabilityForOutputKind(options.outputKind),
    model_intent: modelIntent,
    inputs: [
      ...semanticInputs,
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
  const candidate = candidateId === undefined ? undefined : readContentUnitCandidate(context, upstreamRef, candidateId)
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
  const candidatePrompt = recordField(candidate?.prompt_snapshot) as NormalizedContentUnitPrompt | undefined
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

function readContentUnitCandidate(
  context: AdapterContext,
  contentUnitRef: string,
  candidateId: string | number,
): Record<string, unknown> | undefined {
  return context.index.documents.find((document) => {
    if (!document.path.startsWith(`${contentUnitRef}/candidates/`)) return false
    if (!document.path.endsWith('/content_candidate.json')) return false
    if (!recordField(document.data)) return false
    return String((document.data as Record<string, unknown>).id ?? '') === String(candidateId)
  })?.data as Record<string, unknown> | undefined
}

function sameCanonicalPrompt(left: NormalizedContentUnitPrompt, right: NormalizedContentUnitPrompt): boolean {
  return JSON.stringify(stableJsonValue(canonicalPromptComparisonValue(left)))
    === JSON.stringify(stableJsonValue(canonicalPromptComparisonValue(right)))
}

function canonicalPromptComparisonValue(prompt: NormalizedContentUnitPrompt): unknown {
  return {
    content_unit_type: prompt.content_unit_type,
    output_kind: prompt.output_kind,
    edit_prompt: prompt.edit_prompt,
    model_intent: prompt.model_intent,
    refs: prompt.refs.map((ref) => ({
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
    })),
    runtime_request: prompt.runtime_request,
    blockers: (prompt.blockers ?? []).map((blocker) => ({
      code: blocker.code,
      ref: blocker.ref,
    })),
  }
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

import {
  isMovScriptNamespaceCategory,
  isMovScriptNamespaceKind,
  isMovScriptSystemPrimitiveKind,
} from './categories.js'
import type {
  MovScriptContentUnitOutputKind,
  MovScriptContentUnitPromptRefKind,
  MovScriptContentUnitTargetAdapter,
  MovScriptDomainDiagnostic,
  MovScriptDomainEdge,
  MovScriptDomainRef,
  MovScriptNormalizedContentUnitTarget,
  MovScriptTimelineNamespaceScope,
  MovScriptWorkTargetCategory,
} from './types.js'

export const MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES = [
  'production_ref',
  'segment_ref',
  'asset_ref',
  'keyframe_ref',
  'storyboard_ref',
  'audio_cue_ref',
  'scence_moment_ref',
  'scene_moment_ref',
  'expression_unit_ref',
] as const

export type MovScriptSpecializedContentUnitType = typeof MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES[number]

const CONTENT_UNIT_TARGET_ADAPTERS: Record<MovScriptSpecializedContentUnitType, MovScriptContentUnitTargetAdapter> = {
  production_ref: {
    contentUnitType: 'production_ref',
    targetKind: 'production',
    outputKind: 'video',
    primaryRefKind: 'production',
    primaryRefField: 'production_ref',
    namespaceScopeKind: 'production',
  },
  segment_ref: {
    contentUnitType: 'segment_ref',
    targetKind: 'segment',
    outputKind: 'video',
    primaryRefKind: 'segment',
    primaryRefField: 'segment_ref',
    namespaceScopeKind: 'segment',
  },
  asset_ref: primitiveAdapter('asset_ref', 'asset', 'image'),
  keyframe_ref: primitiveAdapter('keyframe_ref', 'keyframe', 'image'),
  storyboard_ref: primitiveAdapter('storyboard_ref', 'storyboard', 'image'),
  audio_cue_ref: primitiveAdapter('audio_cue_ref', 'audio_cue', 'audio'),
  scence_moment_ref: primitiveAdapter('scence_moment_ref', 'scene_moment', 'video', 'scene_moment', 'scene_moment_ref'),
  scene_moment_ref: primitiveAdapter('scene_moment_ref', 'scene_moment', 'video'),
  expression_unit_ref: primitiveAdapter('expression_unit_ref', 'expression_unit', undefined),
}

const PROMPT_REF_KINDS = new Set<string>([
  'production',
  'segment',
  'asset',
  'keyframe',
  'storyboard',
  'audio_cue',
  'scene_moment',
  'expression_unit',
  'content_unit',
])

function primitiveAdapter(
  contentUnitType: string,
  targetKind: MovScriptContentUnitPromptRefKind,
  outputKind: MovScriptContentUnitOutputKind | undefined,
  primaryRefKind: MovScriptContentUnitPromptRefKind = targetKind,
  primaryRefField = `${primaryRefKind}_ref`,
): MovScriptContentUnitTargetAdapter {
  return {
    contentUnitType,
    targetCategory: 'system_primitive',
    targetKind,
    outputKind,
    primaryRefKind,
    primaryRefField,
  }
}

export function hasSpecializedContentUnitType(contentUnitType: unknown): boolean {
  return typeof contentUnitType === 'string' && isMovScriptSpecializedContentUnitType(contentUnitType)
}

export function isMovScriptSpecializedContentUnitType(value: string | undefined): value is MovScriptSpecializedContentUnitType {
  return value !== undefined && (MOVSCRIPT_SPECIALIZED_CONTENT_UNIT_TYPES as readonly string[]).includes(value)
}

export function contentUnitTargetAdapterFor(contentUnitType: string): MovScriptContentUnitTargetAdapter | undefined {
  return isMovScriptSpecializedContentUnitType(contentUnitType) ? CONTENT_UNIT_TARGET_ADAPTERS[contentUnitType] : undefined
}

export function isContentUnitPromptRefKind(value: string | undefined): value is MovScriptContentUnitPromptRefKind {
  return value !== undefined && PROMPT_REF_KINDS.has(value)
}

export function primaryRefKindForContentUnitType(contentUnitType: string): MovScriptContentUnitPromptRefKind | undefined {
  return contentUnitTargetAdapterFor(contentUnitType)?.primaryRefKind
}

export function primaryRefFieldNameForKind(kind: MovScriptContentUnitPromptRefKind): string {
  return kind === 'scene_moment' ? 'scene_moment_ref' : `${kind}_ref`
}

export function contentUnitTypesForPromptRefKind(kind: MovScriptContentUnitPromptRefKind): string[] {
  if (kind === 'production') return ['production_ref']
  if (kind === 'segment') return ['segment_ref']
  if (kind === 'scene_moment') return ['scence_moment_ref', 'scene_moment_ref']
  if (kind === 'expression_unit') return ['expression_unit_ref']
  return [`${kind}_ref`]
}

export function primaryRefIdsForContentUnitRecord(
  record: Record<string, unknown>,
  kind: MovScriptContentUnitPromptRefKind,
): string[] {
  switch (kind) {
    case 'asset':
      return compactStrings(record.asset_ref)
    case 'keyframe':
      return compactStrings(record.keyframe_ref)
    case 'storyboard':
      return compactStrings(record.storyboard_ref)
    case 'audio_cue':
      return compactStrings(record.target_kind === 'audio_cue' ? record.target_ref : undefined, record.audio_cue_ref)
    case 'production':
      return compactStrings(
        record.production_ref,
        record.target_kind === 'production' ? record.target_ref : undefined,
      )
    case 'segment':
      return compactStrings(
        record.segment_ref,
        record.target_kind === 'segment' ? record.target_ref : undefined,
      )
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

export function outputKindForContentUnitType(
  contentUnitType: string,
  explicitOutputKind: unknown,
): MovScriptContentUnitOutputKind {
  const explicit = contentUnitOutputKind(explicitOutputKind)
  if (explicit !== 'metadata') return explicit
  return contentUnitTargetAdapterFor(contentUnitType)?.outputKind ?? 'metadata'
}

export function expectedOutputKindForContentUnitType(contentUnitType: string): MovScriptContentUnitOutputKind | undefined {
  return contentUnitTargetAdapterFor(contentUnitType)?.outputKind
}

export function normalizeContentUnitTarget(record: Record<string, unknown>): MovScriptNormalizedContentUnitTarget {
  const contentUnitType = stringField(record.content_unit_type ?? record.contentUnitType) ?? ''
  const adapter = contentUnitType ? contentUnitTargetAdapterFor(contentUnitType) : undefined
  const explicitTargetCategory = stringField(record.target_category ?? record.targetCategory)
  const explicitTargetKind = stringField(record.target_kind ?? record.targetKind)
  const explicitTargetRef = idString(record.target_ref ?? record.targetRef)
  const diagnostics: MovScriptDomainDiagnostic[] = []
  const outputKind = outputKindForContentUnitType(contentUnitType, record.output_kind ?? record.outputKind)
  const primaryRefKind = adapter?.primaryRefKind
  const primaryRefField = adapter?.primaryRefField ?? (primaryRefKind ? primaryRefFieldNameForKind(primaryRefKind) : undefined)
  const primaryRefs = primaryRefKind ? primaryRefIdsForContentUnitRecord(record, primaryRefKind) : []

  if (contentUnitType === 'timeline_assembly_ref') {
    return removedTimelineAssemblyContentUnitTarget(contentUnitType, outputKind)
  }

  if (!adapter) {
    if (explicitTargetCategory === 'timeline_assembly' || explicitTargetKind === 'timeline_assembly') {
      return {
        contentUnitType,
        outputKind,
        primaryRefs,
        diagnostics: [timelineAssemblyTargetRemovedDiagnostic(explicitTargetKind === 'timeline_assembly' ? 'target_kind' : 'target_category')],
      }
    }
    const targetCategory = explicitWorkTargetCategory(explicitTargetCategory)
      ?? (explicitTargetKind ? workTargetCategoryForKind(explicitTargetKind) : undefined)
    if (explicitTargetCategory && isMovScriptNamespaceCategory(explicitTargetCategory)) {
      diagnostics.push(namespaceTargetDiagnostic(explicitTargetCategory, 'target_category'))
    }
    if (explicitTargetKind && isMovScriptNamespaceKind(explicitTargetKind)) {
      diagnostics.push(namespaceTargetDiagnostic(explicitTargetKind, 'target_kind'))
    }
    return {
      contentUnitType,
      outputKind,
      ...(targetCategory && explicitTargetKind ? {
        target: {
          targetCategory,
          targetKind: explicitTargetKind,
          ...(explicitTargetRef ? { targetRef: explicitTargetRef } : {}),
        },
      } : {}),
      primaryRefs,
      diagnostics,
    }
  }

  if (adapter.namespaceScopeKind) {
    if (explicitTargetCategory && isMovScriptNamespaceCategory(explicitTargetCategory)) {
      diagnostics.push(namespaceTargetDiagnostic(explicitTargetCategory, 'target_category'))
    }
    const scopeRef = firstUnique(primaryRefs)
      ?? (explicitTargetKind === adapter.namespaceScopeKind ? explicitTargetRef : undefined)
    if (!scopeRef) {
      diagnostics.push({
        severity: 'error',
        code: 'content_unit_scope_ref_missing',
        message: `${contentUnitType} requires ${adapter.primaryRefField}`,
        field: adapter.primaryRefField,
      })
    }
    if (explicitTargetCategory === 'timeline_assembly' || explicitTargetKind === 'timeline_assembly') {
      diagnostics.push(timelineAssemblyTargetRemovedDiagnostic(explicitTargetKind === 'timeline_assembly' ? 'target_kind' : 'target_category'))
    }
    if (explicitTargetKind && explicitTargetKind !== adapter.namespaceScopeKind) {
      diagnostics.push({
        severity: 'error',
        code: 'content_unit_target_kind_mismatch',
        message: `${contentUnitType} cannot target ${explicitTargetKind}`,
        field: 'target_kind',
      })
    }
    return {
      contentUnitType,
      outputKind,
      primaryRefKind,
      primaryRefField,
      primaryRefs,
      ...(scopeRef ? {
        scope: {
          category: 'timeline_namespace',
          kind: adapter.namespaceScopeKind,
          ref: scopeRef,
          field: adapter.primaryRefField,
        },
      } : {}),
      namespaceAlias: {
        contentUnitType: contentUnitType as 'production_ref' | 'segment_ref',
        namespaceKind: adapter.namespaceScopeKind,
      },
      diagnostics,
    }
  }

  if (explicitTargetCategory && isMovScriptNamespaceCategory(explicitTargetCategory)) {
    diagnostics.push(namespaceTargetDiagnostic(explicitTargetCategory, 'target_category'))
  }
  if (explicitTargetKind && isMovScriptNamespaceKind(explicitTargetKind)) {
    diagnostics.push(namespaceTargetDiagnostic(explicitTargetKind, 'target_kind'))
  }
  if (explicitTargetKind && explicitTargetKind !== adapter.targetKind) {
    diagnostics.push({
      severity: 'error',
      code: 'content_unit_target_kind_mismatch',
      message: `${contentUnitType} must target ${adapter.targetKind}, not ${explicitTargetKind}`,
      field: 'target_kind',
    })
  }
  const targetRef = explicitTargetKind === adapter.targetKind && explicitTargetRef
    ? explicitTargetRef
    : firstUnique(primaryRefs)
  if (!targetRef) {
    diagnostics.push({
      severity: 'error',
      code: 'content_unit_target_ref_missing',
      message: `${contentUnitType} requires ${primaryRefField ?? 'target_ref'}`,
      field: primaryRefField,
    })
  }
  return {
    contentUnitType,
    outputKind,
    ...(adapter.targetCategory ? {
      target: {
        targetCategory: adapter.targetCategory,
        targetKind: adapter.targetKind,
        ...(targetRef ? { targetRef } : {}),
      },
    } : {}),
    primaryRefKind,
    primaryRefField,
    primaryRefs,
    diagnostics,
  }
}

function removedTimelineAssemblyContentUnitTarget(
  contentUnitType: string,
  outputKind: MovScriptContentUnitOutputKind,
): MovScriptNormalizedContentUnitTarget {
  return {
    contentUnitType,
    outputKind,
    primaryRefs: [],
    diagnostics: [{
      severity: 'error',
      code: 'content_unit_type_removed',
      message: 'timeline_assembly_ref is removed; create or open a production editing workspace for playable production output.',
      field: 'content_unit_type',
    }],
  }
}

export function contentUnitTargetValidationDiagnostics(record: Record<string, unknown>): MovScriptDomainDiagnostic[] {
  const contentUnitType = stringField(record.content_unit_type ?? record.contentUnitType)
  return normalizeContentUnitTarget(record).diagnostics.filter((diagnostic) =>
    isContentUnitTargetValidationDiagnostic(diagnostic, contentUnitType),
  )
}

export function isContentUnitTargetValidationDiagnostic(
  diagnostic: MovScriptDomainDiagnostic,
  contentUnitType: string | undefined,
): boolean {
  if (diagnostic.code === 'content_unit_namespace_target') return true
  if (diagnostic.code === 'content_unit_target_kind_mismatch') return true
  if (diagnostic.code === 'content_unit_type_removed') return true
  if (diagnostic.code === 'content_unit_timeline_assembly_target_removed') return true
  return false
}

export function normalizeContentUnitTargetEdges(input: {
  source: MovScriptDomainRef
  record: Record<string, unknown>
  scopeTarget?: (scope: MovScriptTimelineNamespaceScope) => MovScriptDomainRef | undefined
}): MovScriptDomainEdge[] {
  const normalized = normalizeContentUnitTarget(input.record)
  const edges: MovScriptDomainEdge[] = []
  if (normalized.target?.targetRef) {
    edges.push({
      source: input.source,
      target: {
        category: normalized.target.targetCategory,
        kind: normalized.target.targetKind,
        id: normalized.target.targetRef,
      },
      relation: 'target',
      origin: 'explicit_ref',
      field: contentUnitTargetEdgeField(input.record, normalized.primaryRefField, normalized.scope?.field, normalized.target.targetRef),
    })
  }
  if (normalized.scope) {
    edges.push({
      source: input.source,
      target: input.scopeTarget?.(normalized.scope) ?? {
        category: 'timeline_namespace',
        kind: normalized.scope.kind,
        id: normalized.scope.ref,
      },
      relation: 'scope',
      origin: 'explicit_ref',
      field: normalized.scope.field,
    })
  }
  return edges
}

function workTargetCategoryForKind(kind: string): MovScriptWorkTargetCategory | undefined {
  if (kind === 'content_unit') return 'content_unit'
  if (isMovScriptSystemPrimitiveKind(kind)) return 'system_primitive'
  return undefined
}

function explicitWorkTargetCategory(category: string | undefined): MovScriptWorkTargetCategory | undefined {
  if (category === 'content_unit' || category === 'system_primitive') return category
  return undefined
}

function namespaceTargetDiagnostic(kind: string, field: string): MovScriptDomainDiagnostic {
  return {
    severity: 'error',
    code: 'content_unit_namespace_target',
    message: `namespace ${kind} cannot be a content unit target; use a system primitive, content_unit, or production editing workspace output`,
    field,
  }
}

function timelineAssemblyTargetRemovedDiagnostic(field: string): MovScriptDomainDiagnostic {
  return {
    severity: 'error',
    code: 'content_unit_timeline_assembly_target_removed',
    message: 'timeline_assembly targets are removed from content units; use production editing workspaces for playable production output.',
    field,
  }
}

function contentUnitTargetEdgeField(
  record: Record<string, unknown>,
  primaryRefField: string | undefined,
  scopeField: string | undefined,
  targetRef: string,
): string {
  const explicitTargetRef = stringField(record.target_ref ?? record.targetRef)
  if (explicitTargetRef === targetRef) return 'target_ref'
  return primaryRefField ?? scopeField ?? 'target_ref'
}

function contentUnitOutputKind(value: unknown): MovScriptContentUnitOutputKind {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'metadata') return value
  return 'metadata'
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    const id = idString(value)
    return id === undefined ? [] : [id]
  })
}

function idString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstUnique(values: string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    return value
  }
  return undefined
}

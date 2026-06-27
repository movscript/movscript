import {
  classifyMovScriptEntityKind,
  isMovScriptNamespaceCategory,
  projectMovScriptDomainNodeKind,
} from './categories.js'
import type {
  MovScriptDomainDiagnostic,
  MovScriptSourceEntityLike,
} from './types.js'

export const MOVSCRIPT_NAMESPACE_FORBIDDEN_CONTENT_UNIT_FIELDS = [
  'content_unit_ref',
  'contentUnitRef',
  'content_unit_refs',
  'contentUnitRefs',
  'main_content_unit_id',
  'mainContentUnitId',
] as const

export const MOVSCRIPT_NAMESPACE_FORBIDDEN_PRODUCTION_STATE_FIELDS = [
  'candidate',
  'candidates',
  'candidate_ref',
  'candidateRef',
  'candidate_refs',
  'candidateRefs',
  'selection',
  'selections',
  'selected_candidate_id',
  'selectedCandidateId',
  'selected_candidate_ref',
  'selectedCandidateRef',
  'selected_resource_id',
  'selectedResourceId',
  'selected_resource_ref',
  'selectedResourceRef',
  'resource_id',
  'resourceId',
] as const

export function assertNamespaceCannotOwnContentUnitRef(input: MovScriptSourceEntityLike): MovScriptDomainDiagnostic[] {
  const record = input.record ?? {}
  const namespaceKind = namespaceKindForSourceEntity(input, record)
  if (!namespaceKind) return []

  const diagnostics: MovScriptDomainDiagnostic[] = []
  for (const field of MOVSCRIPT_NAMESPACE_FORBIDDEN_CONTENT_UNIT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue
    diagnostics.push({
      severity: 'error',
      code: 'namespace_content_unit_ref_forbidden',
      message: `namespace ${namespaceKind} must not own content unit ref field ${field}; create a content_unit targeting a system primitive or timeline assembly instead`,
      field,
      ...(input.path ? { path: input.path } : {}),
    })
  }
  return diagnostics
}

export function assertNamespaceCannotOwnProductionState(input: MovScriptSourceEntityLike): MovScriptDomainDiagnostic[] {
  const record = input.record ?? {}
  const namespaceKind = namespaceKindForSourceEntity(input, record)
  if (!namespaceKind) return []

  const diagnostics: MovScriptDomainDiagnostic[] = []
  for (const field of MOVSCRIPT_NAMESPACE_FORBIDDEN_PRODUCTION_STATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue
    diagnostics.push({
      severity: 'error',
      code: 'namespace_production_state_forbidden',
      message: `namespace ${namespaceKind} must not own production state field ${field}; create/select candidates through a content_unit targeting a system primitive or timeline assembly instead`,
      field,
      ...(input.path ? { path: input.path } : {}),
    })
  }
  return diagnostics
}

function namespaceKindForSourceEntity(
  input: MovScriptSourceEntityLike,
  record: Record<string, unknown>,
): string | undefined {
  const entityKind = input.entityKind ?? stringField(record.kind)
  const category = input.category ?? (entityKind ? classifyMovScriptEntityKind(entityKind) : undefined)
  if (!isMovScriptNamespaceCategory(category)) return undefined
  return entityKind
    ? projectMovScriptDomainNodeKind(entityKind, record)
    : category
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

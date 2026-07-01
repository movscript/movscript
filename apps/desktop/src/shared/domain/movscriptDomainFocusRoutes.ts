import {
  normalizeDomainFocus,
  type MovScriptDomainFocusInput,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'

export function movScriptDomainFocusFromSearch(
  search: string,
  fallback: MovScriptDomainFocusInput = {},
): MovScriptNormalizedFocus | undefined {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return meaningfulDomainFocus(normalizeDomainFocus({
    ...fallback,
    projectId: params.get('projectId') ?? params.get('project_id') ?? fallback.projectId ?? fallback.project_id,
    productionId: params.get('productionId') ?? params.get('production_id') ?? fallback.productionId ?? fallback.production_id,
    productionPath: params.get('productionPath') ?? params.get('production_path') ?? fallback.productionPath ?? fallback.production_path,
    scopeKind: params.get('scopeKind') ?? params.get('scope_kind') ?? params.get('namespaceKind') ?? params.get('namespace_kind') ?? fallback.scopeKind ?? fallback.scope_kind,
    scopeRef: params.get('scopeRef') ?? params.get('scope_ref') ?? params.get('namespaceRef') ?? params.get('namespace_ref') ?? params.get('namespacePath') ?? params.get('namespace_path') ?? fallback.scopeRef ?? fallback.scope_ref,
    targetCategory: params.get('targetCategory') ?? params.get('target_category') ?? params.get('domainTargetCategory') ?? params.get('domain_target_category') ?? fallback.targetCategory ?? fallback.target_category,
    targetKind: params.get('targetKind') ?? params.get('target_kind') ?? params.get('domainTargetKind') ?? params.get('domain_target_kind') ?? fallback.targetKind ?? fallback.target_kind,
    targetRef: params.get('targetRef') ?? params.get('target_ref') ?? params.get('domainTargetRef') ?? params.get('domain_target_ref') ?? fallback.targetRef ?? fallback.target_ref,
    entityKind: params.get('entityKind') ?? params.get('entity_kind') ?? fallback.entityKind ?? fallback.entity_kind,
    entityId: params.get('entityId') ?? params.get('entity_id') ?? fallback.entityId ?? fallback.entity_id,
    path: params.get('path') ?? fallback.path,
  }))
}

export function movScriptDomainFocusFromRecord(
  record: Record<string, unknown> | undefined,
  fallback: MovScriptDomainFocusInput = {},
): MovScriptNormalizedFocus | undefined {
  const entityKind = stringValue(record?.entityKind ?? record?.entity_kind ?? record?.entityType ?? record?.entity_type)
  const entityId = idValue(record?.entityId ?? record?.entity_id)
  const legacyTimelineScopeKind = entityKind === 'production' || entityKind === 'segment' ? entityKind : undefined
  const targetKind = stringValue(record?.targetKind ?? record?.target_kind ?? record?.domainTargetKind ?? record?.domain_target_kind)
      ?? (entityKind === 'content_unit' ? entityKind : undefined)
  const targetRef = idValue(record?.targetRef ?? record?.target_ref ?? record?.domainTargetRef ?? record?.domain_target_ref)
    ?? (targetKind === 'content_unit' ? entityId : undefined)
  const focus = normalizeDomainFocus({
    ...fallback,
    projectId: idValue(record?.projectId ?? record?.project_id) ?? fallback.projectId ?? fallback.project_id,
    productionId: idValue(record?.productionId ?? record?.production_id) ?? (entityKind === 'production' ? entityId : undefined) ?? fallback.productionId ?? fallback.production_id,
    productionPath: stringValue(record?.productionPath ?? record?.production_path) ?? fallback.productionPath ?? fallback.production_path,
    scopeKind: stringValue(record?.scopeKind ?? record?.scope_kind ?? record?.namespaceKind ?? record?.namespace_kind) ?? legacyTimelineScopeKind ?? fallback.scopeKind ?? fallback.scope_kind,
    scopeRef: idValue(record?.scopeRef ?? record?.scope_ref ?? record?.namespaceRef ?? record?.namespace_ref ?? record?.namespacePath ?? record?.namespace_path) ?? (legacyTimelineScopeKind ? entityId : undefined) ?? fallback.scopeRef ?? fallback.scope_ref,
    targetCategory: stringValue(record?.targetCategory ?? record?.target_category ?? record?.domainTargetCategory ?? record?.domain_target_category) ?? fallback.targetCategory ?? fallback.target_category,
    targetKind: targetKind ?? fallback.targetKind ?? fallback.target_kind,
    targetRef: targetRef ?? fallback.targetRef ?? fallback.target_ref,
    entityKind: entityKind ?? fallback.entityKind ?? fallback.entity_kind,
    entityId: entityId ?? fallback.entityId ?? fallback.entity_id,
    path: stringValue(record?.path) ?? fallback.path,
  })
  return meaningfulDomainFocus(focus)
}

export function movScriptRouteParamsForDomainFocus(
  focus: MovScriptNormalizedFocus | undefined,
  options: { includeTarget?: boolean } = {},
): Record<string, string | number | undefined> {
  if (!focus) return {}
  const targetRef = focus.target?.targetRef
  const includeTarget = options.includeTarget ?? true
  return {
    ...(focus.scope ? {
      scopeKind: focus.scope.kind,
      scopeRef: focus.scope.ref,
    } : {}),
    ...(focus.scope?.kind === 'production' ? { productionId: focus.scope.ref } : {}),
    ...(includeTarget && focus.target ? {
      targetCategory: focus.target.targetCategory,
      targetKind: focus.target.targetKind,
      ...(targetRef !== undefined ? { targetRef } : {}),
    } : {}),
    ...(includeTarget && focus.target?.targetKind === 'content_unit' && targetRef !== undefined ? {
      content_unit_id: targetRef,
    } : {}),
  }
}

export function legacyProductionIdFromDomainFocus(
  focus: MovScriptNormalizedFocus | undefined,
): string | number | undefined {
  return focus?.scope?.kind === 'production' ? idRouteValue(focus.scope.ref) : undefined
}

function meaningfulDomainFocus(focus: MovScriptNormalizedFocus): MovScriptNormalizedFocus | undefined {
  return focus.projectId || focus.scope || focus.target || focus.entity || focus.diagnostics.length ? focus : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function idRouteValue(value: string): string | number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === value ? parsed : value
}

import {
  classifyMovScriptEntityKind,
  isMovScriptNamespaceCategory,
  isMovScriptNamespaceKind,
  isMovScriptSystemPrimitiveKind,
} from './categories.js'
import type {
  MovScriptDomainDiagnostic,
  MovScriptNormalizedFocus,
  MovScriptWorkTargetCategory,
} from './types.js'

export interface MovScriptDomainFocusInput {
  projectId?: string | number
  project_id?: string | number
  productionId?: string | number
  production_id?: string | number
  productionPath?: string
  production_path?: string
  scopeKind?: string
  scope_kind?: string
  scopeRef?: string | number
  scope_ref?: string | number
  namespaceKind?: string
  namespace_kind?: string
  namespaceRef?: string | number
  namespace_ref?: string | number
  namespacePath?: string
  namespace_path?: string
  targetCategory?: string
  target_category?: string
  domainTargetCategory?: string
  domain_target_category?: string
  domainTargetKind?: string
  domain_target_kind?: string
  domainTargetRef?: string | number
  domain_target_ref?: string | number
  targetKind?: string
  target_kind?: string
  targetRef?: string | number
  target_ref?: string | number
  entityKind?: string
  entity_kind?: string
  entityId?: string | number
  entity_id?: string | number
  path?: string
}

export function normalizeDomainFocus(input: MovScriptDomainFocusInput): MovScriptNormalizedFocus {
  const diagnostics: MovScriptDomainDiagnostic[] = []
  const projectId = idString(input.projectId ?? input.project_id)
  const productionId = idString(input.productionId ?? input.production_id)
  const targetCategory = stringField(input.targetCategory ?? input.target_category ?? input.domainTargetCategory ?? input.domain_target_category)
  const rawTargetKind = stringField(input.targetKind ?? input.target_kind ?? input.domainTargetKind ?? input.domain_target_kind)
  const targetKind = rawTargetKind
  const targetRef = idString(input.targetRef ?? input.target_ref ?? input.domainTargetRef ?? input.domain_target_ref)
  const entityKind = stringField(input.entityKind ?? input.entity_kind)
  const entityId = idString(input.entityId ?? input.entity_id)
  const productionPath = stringField(input.productionPath ?? input.production_path)
  const explicitScopeKind = stringField(input.scopeKind ?? input.scope_kind ?? input.namespaceKind ?? input.namespace_kind)
  const explicitScopeRef = idString(input.scopeRef ?? input.scope_ref ?? input.namespaceRef ?? input.namespace_ref ?? input.namespacePath ?? input.namespace_path)
  const removedTimelineAssemblyRef = idString((input as Record<string, unknown>).timelineAssemblyRef ?? (input as Record<string, unknown>).timeline_assembly_ref)
  const scopeKind = explicitScopeKind ?? (productionId ? 'production' : undefined)
  const scopeRef = explicitScopeRef ?? productionPath ?? productionId
  const scopeField = explicitScopeRef
    ? 'scopeRef'
    : productionPath
        ? 'productionPath'
        : productionId
          ? 'productionId'
          : undefined

  if (targetCategory && isMovScriptNamespaceCategory(targetCategory)) {
    diagnostics.push({
      severity: 'error',
      code: 'focus_namespace_target',
      message: `namespace category ${targetCategory} cannot be normalized as a work target`,
      field: 'targetCategory',
    })
  }
  if (targetCategory === 'timeline_assembly' || rawTargetKind === 'timeline_assembly' || removedTimelineAssemblyRef) {
    diagnostics.push({
      severity: 'error',
      code: 'focus_timeline_assembly_target_removed',
      message: 'timeline_assembly focus targets are removed; open a production editing workspace instead.',
      field: removedTimelineAssemblyRef ? 'timelineAssemblyRef' : rawTargetKind === 'timeline_assembly' ? 'targetKind' : 'targetCategory',
    })
  }
  if (targetKind && isMovScriptNamespaceKind(targetKind)) {
    diagnostics.push({
      severity: 'error',
      code: 'focus_namespace_target',
      message: `namespace ${targetKind} cannot be normalized as a work target`,
      field: 'targetKind',
    })
  }

  const explicitTargetCategory = workTargetCategoryForCategory(targetCategory)
    ?? (targetKind ? workTargetCategoryForKind(targetKind) : undefined)
  const explicitTarget = explicitTargetCategory && targetKind
    ? {
        targetCategory: explicitTargetCategory,
        targetKind,
        ...(targetRef ? { targetRef } : {}),
      }
    : undefined

  const timelineScope = scopeKind && scopeRef
    ? {
        category: 'timeline_namespace' as const,
        kind: scopeKind,
        ref: scopeRef,
        ...(scopeField ? { field: scopeField } : {}),
      }
    : undefined

  return {
    ...(projectId ? { projectId } : {}),
    ...(explicitTarget ? { target: explicitTarget } : {}),
    ...(timelineScope ? { scope: timelineScope } : {}),
    ...(entityKind ? {
      entity: {
        kind: entityKind,
        ...(classifyMovScriptEntityKind(entityKind) ? { category: classifyMovScriptEntityKind(entityKind) } : {}),
        ...(entityId !== undefined ? { id: entityId } : {}),
        ...(input.path ? { path: input.path } : {}),
      },
    } : {}),
    diagnostics,
  }
}

function workTargetCategoryForKind(kind: string): MovScriptWorkTargetCategory | undefined {
  if (kind === 'content_unit') return 'content_unit'
  if (isMovScriptSystemPrimitiveKind(kind)) return 'system_primitive'
  return undefined
}

function workTargetCategoryForCategory(category: string | undefined): MovScriptWorkTargetCategory | undefined {
  if (category === 'content_unit' || category === 'system_primitive') return category
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

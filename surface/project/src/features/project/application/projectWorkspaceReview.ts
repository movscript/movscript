import {
  selectLatestSurfaceWorkspaceArtifact,
  type MovScriptWorkspaceKind,
  type SurfaceWorkspaceArtifactRef,
} from '@movscript/shared'
import { normalizeDomainFocus, type MovScriptNormalizedFocus } from '@movscript/domain'
import {
  getProjectEntryDefinition,
  mergeProjectEntryReviewSearchParams,
  type ProjectEntryId,
} from '../domain/projectEntryRegistry'

export interface ProjectEntryWorkspaceReviewSearchInput {
  projectEntryId: ProjectEntryId
  workspaceKind: MovScriptWorkspaceKind
  artifacts?: SurfaceWorkspaceArtifactRef[]
  fallbackWorkspaceId?: string
  entityType?: string
  entityId?: string | number
}

export interface ProjectEntryArtifactWorkspaceParam {
  workspaceKind: MovScriptWorkspaceKind
  queryParam: string
  fallbackWorkspaceId?: string
}

export interface ProjectEntryArtifactReviewSearchInput {
  projectEntryId: ProjectEntryId
  artifacts?: SurfaceWorkspaceArtifactRef[]
  primary?: Omit<ProjectEntryWorkspaceReviewSearchInput, 'projectEntryId' | 'artifacts'>
  relatedWorkspaceParams?: ProjectEntryArtifactWorkspaceParam[]
  entityType?: string
  entityId?: string | number
}

export function resolveProjectEntryWorkspaceReviewSearchParams(
  current: URLSearchParams,
  input: ProjectEntryWorkspaceReviewSearchInput,
) {
  const definition = getProjectEntryDefinition(input.projectEntryId)
  const artifact = selectLatestSurfaceWorkspaceArtifact(input.artifacts, input.workspaceKind)
  const workspaceId = artifact?.workspaceId || input.fallbackWorkspaceId
  if (!workspaceId) return null

  const entity = pickReviewEntityFromArtifact(definition.reviewQuery.entityParams ?? {}, artifact)
    ?? (input.entityType && input.entityId !== undefined
      ? { entityType: input.entityType, entityId: input.entityId }
      : null)

  const searchParams = mergeProjectEntryReviewSearchParams(current, definition, {
    workspaceId,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
  })
  if (!searchParams) return null
  return { artifact, workspaceId, searchParams: mergeWorkspaceArtifactFocusSearchParams(searchParams, artifact) }
}

export function mergeProjectEntryArtifactReviewSearchParams(
  current: URLSearchParams,
  input: ProjectEntryArtifactReviewSearchInput,
): URLSearchParams {
  const definition = getProjectEntryDefinition(input.projectEntryId)
  const primary = input.primary
    ? resolveProjectEntryWorkspaceReviewSearchParams(current, {
        projectEntryId: input.projectEntryId,
        artifacts: input.artifacts,
        entityType: input.entityType ?? input.primary.entityType,
        entityId: input.entityId ?? input.primary.entityId,
        ...input.primary,
      })
    : null
  const next = primary?.searchParams ?? new URLSearchParams(current)
  if (definition.reviewQuery.viewParam && definition.reviewQuery.viewValue) {
    next.set(definition.reviewQuery.viewParam, definition.reviewQuery.viewValue)
  }
  for (const related of input.relatedWorkspaceParams ?? []) {
    const artifact = selectLatestSurfaceWorkspaceArtifact(input.artifacts, related.workspaceKind)
    const workspaceId = artifact?.workspaceId || related.fallbackWorkspaceId
    if (workspaceId) next.set(related.queryParam, workspaceId)
  }
  if (input.entityType && input.entityId !== undefined) {
    const queryParam = definition.reviewQuery.entityParams?.[input.entityType]
    if (queryParam) next.set(queryParam, String(input.entityId))
  }
  return mergeWorkspaceRecordFocusSearchParams(
    mergeWorkspaceArtifactFocusSearchParams(next, primary?.artifact),
    input.primary
      ? {
          entityType: input.entityType ?? input.primary.entityType,
          entityId: input.entityId ?? input.primary.entityId,
        }
      : undefined,
  )
}

function pickReviewEntityFromArtifact(
  entityParams: Record<string, string>,
  artifact?: SurfaceWorkspaceArtifactRef,
) {
  const source = pickEntity(entityParams, artifact?.source)
  if (source) return source
  return pickEntity(entityParams, artifact?.target)
}

function pickEntity(entityParams: Record<string, string>, value?: Record<string, unknown>) {
  const entityType = typeof value?.entityType === 'string' ? value.entityType : undefined
  if (!entityType || !entityParams[entityType]) return null
  const entityId = value?.entityId
  if (typeof entityId === 'number' && Number.isFinite(entityId)) return { entityType, entityId }
  if (typeof entityId === 'string' && entityId.trim()) return { entityType, entityId }
  return null
}

function mergeWorkspaceArtifactFocusSearchParams(
  params: URLSearchParams,
  artifact: SurfaceWorkspaceArtifactRef | undefined,
): URLSearchParams {
  return mergeFocusSearchParams(params, workspaceArtifactFocus(artifact))
}

function mergeWorkspaceRecordFocusSearchParams(
  params: URLSearchParams,
  record: Record<string, unknown> | undefined,
): URLSearchParams {
  return mergeFocusSearchParams(params, focusFromRecord(record))
}

function mergeFocusSearchParams(
  params: URLSearchParams,
  focus: MovScriptNormalizedFocus | undefined,
): URLSearchParams {
  if (!focus?.scope && !focus?.target) return params
  const next = new URLSearchParams(params)
  if (focus.scope?.kind !== 'production') {
    next.delete('productionId')
    next.delete('production_id')
  }
  if (focus.scope?.kind && focus.scope.ref) {
    next.set('scopeKind', focus.scope.kind)
    next.set('scopeRef', focus.scope.ref)
    if (focus.scope.kind === 'production') next.set('productionId', focus.scope.ref)
  }
  if (focus.target?.targetCategory) next.set('targetCategory', focus.target.targetCategory)
  if (focus.target?.targetKind) next.set('targetKind', focus.target.targetKind)
  if (focus.target?.targetRef) next.set('targetRef', focus.target.targetRef)
  return next
}

function workspaceArtifactFocus(artifact: SurfaceWorkspaceArtifactRef | undefined): MovScriptNormalizedFocus | undefined {
  return focusFromRecord(artifact?.target, artifact?.projectId)
    ?? focusFromRecord(artifact?.source, artifact?.projectId)
}

function focusFromRecord(record: Record<string, unknown> | undefined, projectId?: number): MovScriptNormalizedFocus | undefined {
  if (!record) return undefined
  const entityType = stringValue(record.entityType ?? record.entity_type ?? record.entityKind ?? record.entity_kind)
  const entityId = idValue(record.entityId ?? record.entity_id)
  const legacyScopeKind = entityType === 'production' || entityType === 'segment' ? entityType : undefined
  const targetKind = stringValue(record.targetKind ?? record.target_kind ?? record.domainTargetKind ?? record.domain_target_kind)
      ?? (entityType === 'content_unit' ? entityType : undefined)
  const targetRef = idValue(record.targetRef ?? record.target_ref ?? record.domainTargetRef ?? record.domain_target_ref)
    ?? (targetKind === 'content_unit' ? entityId : undefined)
  const focus = normalizeDomainFocus({
    projectId: idValue(record.projectId ?? record.project_id) ?? projectId,
    productionId: idValue(record.productionId ?? record.production_id) ?? (entityType === 'production' ? entityId : undefined),
    scopeKind: stringValue(record.scopeKind ?? record.scope_kind ?? record.namespaceKind ?? record.namespace_kind) ?? legacyScopeKind,
    scopeRef: idValue(record.scopeRef ?? record.scope_ref ?? record.namespaceRef ?? record.namespace_ref ?? record.namespacePath ?? record.namespace_path) ?? (legacyScopeKind ? entityId : undefined),
    targetCategory: stringValue(record.targetCategory ?? record.target_category ?? record.domainTargetCategory ?? record.domain_target_category),
    targetKind,
    targetRef,
    entityKind: entityType,
    entityId,
    path: stringValue(record.path),
  })
  return focus.scope || focus.target || focus.entity || focus.diagnostics.length ? focus : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

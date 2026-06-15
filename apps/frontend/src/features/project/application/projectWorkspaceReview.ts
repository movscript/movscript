import { selectLatestWorkspaceArtifact, type AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { MovScriptWorkspaceKind } from '@/shared/infrastructure/providerSessionClient'
import {
  getProjectEntryDefinition,
  mergeProjectEntryReviewSearchParams,
  type ProjectEntryId,
} from '@/features/project/domain/projectEntryRegistry'

export interface ProjectEntryWorkspaceReviewSearchInput {
  projectEntryId: ProjectEntryId
  workspaceKind: MovScriptWorkspaceKind
  artifacts?: AgentTaskArtifactRef[]
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
  artifacts?: AgentTaskArtifactRef[]
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
  const artifact = selectLatestWorkspaceArtifact(input.artifacts, input.workspaceKind)
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
  return { artifact, workspaceId, searchParams }
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
    const artifact = selectLatestWorkspaceArtifact(input.artifacts, related.workspaceKind)
    const workspaceId = artifact?.workspaceId || related.fallbackWorkspaceId
    if (workspaceId) next.set(related.queryParam, workspaceId)
  }
  if (input.entityType && input.entityId !== undefined) {
    const queryParam = definition.reviewQuery.entityParams?.[input.entityType]
    if (queryParam) next.set(queryParam, String(input.entityId))
  }
  return next
}

function pickReviewEntityFromArtifact(
  entityParams: Record<string, string>,
  artifact?: AgentTaskArtifactRef,
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

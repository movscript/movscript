import { selectLatestWorkspaceArtifact, type AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { AgentWorkspaceKind } from '@/shared/infrastructure/localAgentClient'
import {
  getProjectWorkbenchDefinition,
  mergeProjectWorkbenchReviewSearchParams,
  type ProjectWorkbenchId,
} from '@/features/project-workbenches/domain/projectWorkbenchRegistry'

export interface ProjectWorkbenchWorkspaceReviewSearchInput {
  workbenchId: ProjectWorkbenchId
  workspaceKind: AgentWorkspaceKind
  artifacts?: AgentTaskArtifactRef[]
  fallbackWorkspaceId?: string
  entityType?: string
  entityId?: string | number
}

export interface ProjectWorkbenchArtifactWorkspaceParam {
  workspaceKind: AgentWorkspaceKind
  queryParam: string
  fallbackWorkspaceId?: string
}

export interface ProjectWorkbenchArtifactReviewSearchInput {
  workbenchId: ProjectWorkbenchId
  artifacts?: AgentTaskArtifactRef[]
  primary?: Omit<ProjectWorkbenchWorkspaceReviewSearchInput, 'workbenchId' | 'artifacts'>
  relatedWorkspaceParams?: ProjectWorkbenchArtifactWorkspaceParam[]
  entityType?: string
  entityId?: string | number
}

export function resolveProjectWorkbenchWorkspaceReviewSearchParams(
  current: URLSearchParams,
  input: ProjectWorkbenchWorkspaceReviewSearchInput,
) {
  const definition = getProjectWorkbenchDefinition(input.workbenchId)
  const artifact = selectLatestWorkspaceArtifact(input.artifacts, input.workspaceKind)
  const workspaceId = artifact?.workspaceId || input.fallbackWorkspaceId
  if (!workspaceId) return null

  const entity = pickReviewEntityFromArtifact(definition.reviewQuery.entityParams ?? {}, artifact)
    ?? (input.entityType && input.entityId !== undefined
      ? { entityType: input.entityType, entityId: input.entityId }
      : null)

  const searchParams = mergeProjectWorkbenchReviewSearchParams(current, definition, {
    workspaceId,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
  })
  if (!searchParams) return null
  return { artifact, workspaceId, searchParams }
}

export function mergeProjectWorkbenchArtifactReviewSearchParams(
  current: URLSearchParams,
  input: ProjectWorkbenchArtifactReviewSearchInput,
): URLSearchParams {
  const definition = getProjectWorkbenchDefinition(input.workbenchId)
  const primary = input.primary
    ? resolveProjectWorkbenchWorkspaceReviewSearchParams(current, {
        workbenchId: input.workbenchId,
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

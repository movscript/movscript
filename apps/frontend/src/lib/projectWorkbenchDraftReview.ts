import { selectLatestDraftArtifact, type AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import type { AgentDraftKind } from '@/lib/localAgentClient'
import {
  getProjectWorkbenchDefinition,
  mergeProjectWorkbenchReviewSearchParams,
  type ProjectWorkbenchId,
} from '@/pages/project/projectSurfaces'

export interface ProjectWorkbenchDraftReviewSearchInput {
  workbenchId: ProjectWorkbenchId
  proposalKind: AgentDraftKind
  artifacts?: AgentTaskArtifactRef[]
  fallbackDraftId?: string
  entityType?: string
  entityId?: string | number
}

export interface ProjectWorkbenchArtifactDraftParam {
  proposalKind: AgentDraftKind
  queryParam: string
  fallbackDraftId?: string
}

export interface ProjectWorkbenchArtifactReviewSearchInput {
  workbenchId: ProjectWorkbenchId
  artifacts?: AgentTaskArtifactRef[]
  primary?: Omit<ProjectWorkbenchDraftReviewSearchInput, 'workbenchId' | 'artifacts'>
  relatedDraftParams?: ProjectWorkbenchArtifactDraftParam[]
  entityType?: string
  entityId?: string | number
}

export function resolveProjectWorkbenchDraftReviewSearchParams(
  current: URLSearchParams,
  input: ProjectWorkbenchDraftReviewSearchInput,
) {
  const definition = getProjectWorkbenchDefinition(input.workbenchId)
  const artifact = selectLatestDraftArtifact(input.artifacts, input.proposalKind)
  const draftId = artifact?.draftId || input.fallbackDraftId
  if (!draftId) return null

  const entity = pickReviewEntityFromArtifact(definition.reviewQuery.entityParams ?? {}, artifact)
    ?? (input.entityType && input.entityId !== undefined
      ? { entityType: input.entityType, entityId: input.entityId }
      : null)

  const searchParams = mergeProjectWorkbenchReviewSearchParams(current, definition, {
    draftId,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
  })
  if (!searchParams) return null
  return { artifact, draftId, searchParams }
}

export function mergeProjectWorkbenchArtifactReviewSearchParams(
  current: URLSearchParams,
  input: ProjectWorkbenchArtifactReviewSearchInput,
): URLSearchParams {
  const definition = getProjectWorkbenchDefinition(input.workbenchId)
  const primary = input.primary
    ? resolveProjectWorkbenchDraftReviewSearchParams(current, {
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
  for (const related of input.relatedDraftParams ?? []) {
    const artifact = selectLatestDraftArtifact(input.artifacts, related.proposalKind)
    const draftId = artifact?.draftId || related.fallbackDraftId
    if (draftId) next.set(related.queryParam, draftId)
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

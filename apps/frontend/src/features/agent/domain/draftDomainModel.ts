import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { isRecord } from '@/shared/domain/jsonValue'
import type { AgentDraft, AgentDraftKind } from '@/shared/infrastructure/localAgentClient'
import { buildProjectWorkbenchReviewPath, getProjectWorkbenchDefinitionForProposalKind, type ProjectWorkbenchDefinition } from '@/features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

export { DRAFT_DOMAIN_MODELS, getDraftDomainModel } from '@/shared/domain/draftDomainModel'
export type { DraftDomainModel, DraftSeedMode } from '@/shared/domain/draftDomainModel'

const productionRelatedKinds: AgentDraftKind[] = [
  'production_proposal',
]

const contentUnitRelatedKinds: AgentDraftKind[] = [
  'content_unit_proposal',
]

export function buildDraftReviewPath(draft: AgentDraft): string | null {
  const source = isRecord(draft.source) ? draft.source : undefined
  const target = isRecord(draft.target) ? draft.target : undefined
  const sourceEntityType = stringValue(source?.entityType)
  const targetEntityType = stringValue(target?.entityType)
  const sourceEntityId = numberValue(source?.entityId)
  const targetEntityId = numberValue(target?.entityId)

  const workbenchReviewPath = buildWorkbenchProposalReviewPath({
    kind: draft.kind,
    draftId: draft.id,
    sourceEntityType,
    sourceEntityId,
    targetEntityType,
    targetEntityId,
  })
  if (workbenchReviewPath) return workbenchReviewPath

  if (sourceEntityType === 'asset_slot' || targetEntityType === 'asset_slot') {
    const assetSlotId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.preProduction, { draftId: draft.id, asset_slot_id: assetSlotId })
  }

  if (sourceEntityType === 'project' || targetEntityType === 'project') {
    return withRouteParams(ROUTES.project.standards, { draftId: draft.id })
  }

  if (targetEntityType === 'content_unit' || sourceEntityType === 'content_unit') {
    const contentUnitId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.productionOrchestration, { draftId: draft.id, content_unit_id: contentUnitId })
  }

  const productionId = sourceEntityId ?? targetEntityId
  if (
    productionId !== undefined
    && (
      draft.kind === 'production_proposal'
      || sourceEntityType === 'production'
      || targetEntityType === 'production'
      || productionRelatedKinds.includes(draft.kind)
      || contentUnitRelatedKinds.includes(draft.kind)
    )
  ) {
    return withRouteParams(ROUTES.project.productionOrchestration, { productionId, draftId: draft.id })
  }

  return null
}

function buildWorkbenchProposalReviewPath(input: {
  kind: AgentDraftKind
  draftId: string
  sourceEntityType?: string
  sourceEntityId?: number
  targetEntityType?: string
  targetEntityId?: number
}) {
  const definition = getProjectWorkbenchDefinitionForProposalKind(input.kind)
  if (!definition) return null
  const entity = pickWorkbenchReviewEntity(definition, input)
  return buildProjectWorkbenchReviewPath(definition, {
    draftId: input.draftId,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
  })
}

function pickWorkbenchReviewEntity(
  definition: ProjectWorkbenchDefinition,
  input: {
    sourceEntityType?: string
    sourceEntityId?: number
    targetEntityType?: string
    targetEntityId?: number
  },
) {
  const entityParams = definition.reviewQuery.entityParams ?? {}
  if (input.sourceEntityType && input.sourceEntityId !== undefined && entityParams[input.sourceEntityType]) {
    return { entityType: input.sourceEntityType, entityId: input.sourceEntityId }
  }
  if (input.targetEntityType && input.targetEntityId !== undefined && entityParams[input.targetEntityType]) {
    return { entityType: input.targetEntityType, entityId: input.targetEntityId }
  }
  return null
}

export function buildDraftArtifactReviewPath(artifact: AgentTaskArtifactRef): string | null {
  if (!artifact.draftKind) return null
  return buildDraftReviewPath({
    id: artifact.draftId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    kind: artifact.draftKind,
    title: artifact.title ?? artifact.draftId,
    content: '',
    status: 'draft',
    ...(artifact.source ? { source: artifact.source } : {}),
    ...(artifact.target ? { target: artifact.target } : {}),
    ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
    createdAt: artifact.updatedAt ?? '',
    updatedAt: artifact.updatedAt ?? '',
  })
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

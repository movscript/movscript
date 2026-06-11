import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { isRecord } from '@/shared/domain/jsonValue'
import type { WorkspaceArtifact, MovScriptWorkspaceKind } from '@/shared/infrastructure/providerSessionClient'
import { buildProjectWorkbenchReviewPath, getProjectWorkbenchDefinitionForWorkspaceKind, type ProjectWorkbenchDefinition } from '@/features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

export { WORKSPACE_DOMAIN_MODELS, getWorkspaceDomainModel } from '@/shared/domain/workspaceDomainModel'
export type { WorkspaceDomainModel } from '@/shared/domain/workspaceDomainModel'

const productionRelatedKinds: MovScriptWorkspaceKind[] = [
  'production_workspace',
]

const contentUnitRelatedKinds: MovScriptWorkspaceKind[] = [
  'content_unit_workspace',
]

export function buildWorkspaceReviewPath(workspace: WorkspaceArtifact): string | null {
  const source = isRecord(workspace.source) ? workspace.source : undefined
  const target = isRecord(workspace.target) ? workspace.target : undefined
  const sourceEntityType = stringValue(source?.entityType)
  const targetEntityType = stringValue(target?.entityType)
  const sourceEntityId = numberValue(source?.entityId)
  const targetEntityId = numberValue(target?.entityId)

  const workbenchReviewPath = buildWorkbenchWorkspaceReviewPath({
    kind: workspace.kind,
    workspaceId: workspace.id,
    sourceEntityType,
    sourceEntityId,
    targetEntityType,
    targetEntityId,
  })
  if (workbenchReviewPath) return workbenchReviewPath

  if (workspace.kind === 'project_standards_workspace') {
    return withRouteParams(ROUTES.project.standards, { workspaceId: workspace.id })
  }

  if (workspace.kind === 'setting_workspace' || sourceEntityType === 'setting' || targetEntityType === 'setting') {
    return withRouteParams(ROUTES.project.scripts, {
      workspaceId: workspace.id,
      reference_id: sourceEntityId ?? targetEntityId,
    })
  }

  if (workspace.kind === 'asset_workspace' && sourceEntityType !== 'asset_slot' && targetEntityType !== 'asset_slot') {
    return withRouteParams(ROUTES.project.sourceWorkspace, { workspaceId: workspace.id })
  }

  if (sourceEntityType === 'asset_slot' || targetEntityType === 'asset_slot') {
    const assetSlotId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.sourceWorkspace, { workspaceId: workspace.id, asset_slot_id: assetSlotId })
  }

  if (sourceEntityType === 'project' || targetEntityType === 'project') {
    return withRouteParams(ROUTES.project.standards, { workspaceId: workspace.id })
  }

  if (targetEntityType === 'content_unit' || sourceEntityType === 'content_unit') {
    const contentUnitId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.sourceWorkspace, { workspaceId: workspace.id, content_unit_id: contentUnitId })
  }

  if (targetEntityType === 'scene_moment' || sourceEntityType === 'scene_moment') {
    const sceneMomentId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.sourceWorkspace, { workspaceId: workspace.id, scene_moment_id: sceneMomentId })
  }

  const productionId = sourceEntityId ?? targetEntityId
  if (
    productionId !== undefined
    && (
      workspace.kind === 'production_workspace'
      || sourceEntityType === 'production'
      || targetEntityType === 'production'
      || productionRelatedKinds.includes(workspace.kind)
      || contentUnitRelatedKinds.includes(workspace.kind)
    )
  ) {
    return withRouteParams(ROUTES.project.scripts, { workspaceId: workspace.id, productionId })
  }

  return null
}

function buildWorkbenchWorkspaceReviewPath(input: {
  kind: MovScriptWorkspaceKind
  workspaceId: string
  sourceEntityType?: string
  sourceEntityId?: number
  targetEntityType?: string
  targetEntityId?: number
}) {
  const definition = getProjectWorkbenchDefinitionForWorkspaceKind(input.kind)
  if (!definition) return null
  if (
    definition.id === 'content_orchestration'
    && (input.sourceEntityType === 'production' || input.targetEntityType === 'production')
  ) {
    return null
  }
  const entity = pickWorkbenchReviewEntity(definition, input)
  return buildProjectWorkbenchReviewPath(definition, {
    workspaceId: input.workspaceId,
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

export function buildWorkspaceArtifactReviewPath(artifact: AgentTaskArtifactRef): string | null {
  if (!artifact.workspaceKind) return null
  return buildWorkspaceReviewPath({
    id: artifact.workspaceId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    kind: artifact.workspaceKind,
    title: artifact.title ?? artifact.workspaceId,
    content: '',
    status: 'workspace',
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

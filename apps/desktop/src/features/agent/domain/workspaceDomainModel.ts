import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { isRecord } from '@/shared/domain/jsonValue'
import type { MovScriptWorkspaceKind, WorkspaceArtifact } from '@/shared/contracts/workspaceArtifact'
import { buildProjectEntryReviewPath, getProjectEntryDefinition } from '@movscript/project-surface/data'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import {
  legacyProductionIdFromDomainFocus,
  movScriptDomainFocusFromRecord,
  movScriptRouteParamsForDomainFocus,
} from '@/shared/domain/movscriptDomainFocusRoutes'

export { WORKSPACE_DOMAIN_MODELS, getWorkspaceDomainModel } from '@/shared/domain/workspaceDomainModel'
export type { WorkspaceDomainModel } from '@/shared/domain/workspaceDomainModel'

const contentUnitRelatedKinds: MovScriptWorkspaceKind[] = [
  'content_unit_workspace',
]

export function buildWorkspaceReviewPath(workspace: WorkspaceArtifact): string | null {
  const source = isRecord(workspace.source) ? workspace.source : undefined
  const target = isRecord(workspace.target) ? workspace.target : undefined
  const sourceEntityType = stringValue(source?.entityType)
  const targetEntityType = stringValue(target?.entityType)
  const sourceEntityId = idValue(source?.entityId)
  const targetEntityId = idValue(target?.entityId)

  const projectEntryReviewPath = buildProjectEntryWorkspaceReviewPath({
    kind: workspace.kind,
    workspaceId: workspace.id,
    sourceEntityType,
    sourceEntityId,
    targetEntityType,
    targetEntityId,
  })
  if (projectEntryReviewPath) return projectEntryReviewPath

  if (workspace.kind === 'project_standards_workspace') {
    return withRouteParams(ROUTES.project.standards, { workspaceId: workspace.id })
  }

  if (workspace.kind === 'setting_workspace' || sourceEntityType === 'setting' || targetEntityType === 'setting') {
    return withRouteParams(ROUTES.project.settingPreview, {
      workspaceId: workspace.id,
      setting_id: sourceEntityType === 'setting' ? sourceEntityId : targetEntityType === 'setting' ? targetEntityId : undefined,
    })
  }

  if (
    workspace.kind === 'asset_workspace'
    || sourceEntityType === 'asset_slot'
    || targetEntityType === 'asset_slot'
    || sourceEntityType === 'asset'
    || targetEntityType === 'asset'
  ) {
    const assetSlotId = sourceEntityType === 'asset_slot' ? sourceEntityId : targetEntityType === 'asset_slot' ? targetEntityId : undefined
    const assetId = sourceEntityType === 'asset' ? sourceEntityId : targetEntityType === 'asset' ? targetEntityId : undefined
    return withRouteParams(ROUTES.project.settingPreview, {
      workspaceId: workspace.id,
      asset_slot_id: assetSlotId,
      asset_id: assetId,
    })
  }

  if (sourceEntityType === 'project' || targetEntityType === 'project') {
    return withRouteParams(ROUTES.project.standards, { workspaceId: workspace.id })
  }

  if (targetEntityType === 'content_unit' || sourceEntityType === 'content_unit') {
    const contentUnitId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.contentPreview, { workspaceId: workspace.id, content_unit_id: contentUnitId })
  }

  if (targetEntityType === 'scene_moment' || sourceEntityType === 'scene_moment') {
    const sceneMomentId = sourceEntityId ?? targetEntityId
    return withRouteParams(ROUTES.project.contentPreview, { workspaceId: workspace.id, scene_moment_id: sceneMomentId })
  }

  const targetFocus = movScriptDomainFocusFromRecord(target, workspace.projectId !== undefined ? { projectId: workspace.projectId } : {})
    ?? movScriptDomainFocusFromRecord(source, workspace.projectId !== undefined ? { projectId: workspace.projectId } : {})

  if (workspace.kind === 'content_unit_workspace' && targetFocus?.target?.targetKind === 'timeline_assembly') {
    return withRouteParams(ROUTES.project.contentPreview, {
      workspaceId: workspace.id,
      ...movScriptRouteParamsForDomainFocus(targetFocus),
    })
  }

  if (workspace.kind === 'production_workspace') {
    return withRouteParams(ROUTES.project.scripts, {
      workspaceId: workspace.id,
      ...movScriptRouteParamsForDomainFocus(targetFocus, { includeTarget: false }),
    })
  }

  const productionId = sourceEntityId ?? targetEntityId
  const focusProductionId = legacyProductionIdFromDomainFocus(targetFocus)
  if (
    (productionId !== undefined || focusProductionId !== undefined)
    && (
      sourceEntityType === 'production'
      || targetEntityType === 'production'
      || contentUnitRelatedKinds.includes(workspace.kind)
    )
  ) {
    return withRouteParams(ROUTES.project.scripts, { workspaceId: workspace.id, productionId: focusProductionId ?? productionId })
  }

  return null
}

function buildProjectEntryWorkspaceReviewPath(input: {
  kind: MovScriptWorkspaceKind
  workspaceId: string
  sourceEntityType?: string
  sourceEntityId?: string
  targetEntityType?: string
  targetEntityId?: string
}) {
  if (input.kind !== 'content_unit_workspace') return null
  if (
    input.sourceEntityType === 'production'
    || input.targetEntityType === 'production'
    || input.sourceEntityType === 'segment'
    || input.targetEntityType === 'segment'
  ) {
    return null
  }
  const definition = getProjectEntryDefinition('content_preview')
  const entity = pickProjectEntryReviewEntity(definition.reviewQuery.entityParams ?? {}, input)
  return buildProjectEntryReviewPath(definition, {
    workspaceId: input.workspaceId,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
  })
}

function pickProjectEntryReviewEntity(
  entityParams: Record<string, string>,
  input: {
    sourceEntityType?: string
    sourceEntityId?: string
    targetEntityType?: string
    targetEntityId?: string
  },
) {
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

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

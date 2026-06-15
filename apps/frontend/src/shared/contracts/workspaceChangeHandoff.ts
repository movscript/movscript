import type { MovScriptWorkspaceKind } from './movscriptWorkspace'

export const WORKSPACE_CHANGE_HANDOFF_SCHEMA = 'movscript.workspace-change-handoff.v1'
export const WORKSPACE_CHANGE_HANDOFF_EVENT = 'movscript:workspace-change-submitted'
export const WORKSPACE_REVIEW_ROUTE = '/workspace/review'

export interface WorkspaceChangeHandoffIntent {
  schema: typeof WORKSPACE_CHANGE_HANDOFF_SCHEMA
  status: 'change_submitted'
  source: 'mcp_workspace_apply' | 'frontend'
  createdAt: string
  workspaceKind?: MovScriptWorkspaceKind | string
  workspaceId?: string
  target?: Record<string, unknown>
  entityFile?: Record<string, unknown>
  businessReviewPath?: string
}

export interface WorkspaceChangeHandoffNavigation {
  path: string
  businessReviewPath?: string
}

export function buildWorkspaceChangeHandoffNavigation(input: {
  reviewPath?: string
  workspaceKind?: string
  workspaceId?: string
  target?: Record<string, unknown>
  entityFile?: Record<string, unknown>
}): WorkspaceChangeHandoffNavigation {
  const params = new URLSearchParams()
  if (input.reviewPath) params.set('path', input.reviewPath)
  if (input.workspaceKind) params.set('kind', input.workspaceKind)
  if (input.workspaceId) params.set('workspaceId', input.workspaceId)

  const businessReviewPath = buildWorkspaceBusinessReviewPath({
    workspaceKind: input.workspaceKind,
    workspaceId: input.workspaceId,
    target: input.target,
  })
  if (businessReviewPath) params.set('businessReviewPath', businessReviewPath)

  const search = params.toString()
  return {
    path: search ? `${WORKSPACE_REVIEW_ROUTE}?${search}` : WORKSPACE_REVIEW_ROUTE,
    ...(businessReviewPath ? { businessReviewPath } : {}),
  }
}

export function workspaceChangeHandoffPathFromEventDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (!isRecord(detail)) return null
  const directPath = stringValue(detail.path) ?? stringValue(detail.reviewRoute)
  if (directPath) return directPath
  return buildWorkspaceChangeHandoffNavigation({
    reviewPath: stringValue(detail.reviewPath),
    workspaceKind: stringValue(detail.workspaceKind) ?? stringValue(detail.kind),
    workspaceId: stringValue(detail.workspaceId),
    target: isRecord(detail.target) ? detail.target : undefined,
    entityFile: isRecord(detail.entityFile) ? detail.entityFile : undefined,
  }).path
}

export function buildWorkspaceBusinessReviewPath(input: {
  workspaceKind?: string
  workspaceId?: string
  target?: Record<string, unknown>
}): string | undefined {
  if (!input.workspaceKind || !input.workspaceId) return undefined
  const target = input.target ?? {}
  const entityType = stringValue(target.entityType)
  const entityId = target.entityId
  const projectId = target.projectId ?? (entityType === 'project' ? entityId : undefined)

  if (input.workspaceKind === 'project_standards_workspace') {
    return withRouteParams('/project/standards', {
      workspaceId: input.workspaceId,
      projectId,
    })
  }
  if (input.workspaceKind === 'setting_workspace') {
    return withRouteParams('/project/scripts/workbench', {
      workspaceId: input.workspaceId,
      reference_id: entityType === 'setting' ? entityId : undefined,
    })
  }
  if (input.workspaceKind === 'asset_workspace') {
    return withRouteParams('/project/content', {
      workspaceId: input.workspaceId,
      asset_slot_id: entityType === 'asset_slot' ? entityId : undefined,
    })
  }
  if (input.workspaceKind === 'production_workspace') {
    const productionId = target.productionId ?? (entityType === 'production' ? entityId : undefined)
    if (productionId === undefined) return undefined
    return withRouteParams('/project/scripts/workbench', {
      view: 'review',
      workspaceId: input.workspaceId,
      productionId,
    })
  }
  if (input.workspaceKind === 'content_unit_workspace') {
    const sceneMomentId = target.sceneMomentId ?? target.scene_moment_id ?? (entityType === 'scene_moment' ? entityId : undefined)
    const contentUnitId = target.contentUnitId ?? target.content_unit_id ?? (entityType === 'content_unit' ? entityId : undefined)
    return withRouteParams('/project/content', {
      view: 'review',
      workspaceId: input.workspaceId,
      scene_moment_id: sceneMomentId,
      content_unit_id: contentUnitId,
    })
  }
  return undefined
}

function withRouteParams(pathname: string, params: Record<string, unknown>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import { routePathWithParams } from '@movscript/shared/surface-routes'
import type { MovScriptWorkspaceKind } from './movscriptWorkspace'
import {
  legacyProductionIdFromDomainFocus,
  movScriptDomainFocusFromRecord,
  movScriptRouteParamsForDomainFocus,
} from '../domain/movscriptDomainFocusRoutes'

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
    return withRouteParams('/project/settings/preview', {
      workspaceId: input.workspaceId,
      setting_id: entityType === 'setting' ? entityId : undefined,
    })
  }
  if (input.workspaceKind === 'asset_workspace') {
    return withRouteParams('/project/settings/preview', {
      workspaceId: input.workspaceId,
      asset_slot_id: entityType === 'asset_slot' ? entityId : undefined,
      asset_id: entityType === 'asset' ? entityId : undefined,
    })
  }
  if (input.workspaceKind === 'production_workspace') {
    const focus = movScriptDomainFocusFromRecord(target)
    const productionId = legacyProductionIdFromDomainFocus(focus) ?? target.productionId ?? (entityType === 'production' ? entityId : undefined)
    return withRouteParams('/project/scripts/workbench', {
      view: 'review',
      workspaceId: input.workspaceId,
      ...movScriptRouteParamsForDomainFocus(focus, { includeTarget: false }),
      ...(productionId !== undefined ? { productionId } : {}),
    })
  }
  if (input.workspaceKind === 'content_unit_workspace') {
    const sceneMomentId = target.sceneMomentId ?? target.scene_moment_id ?? (entityType === 'scene_moment' ? entityId : undefined)
    const contentUnitId = target.contentUnitId ?? target.content_unit_id ?? (entityType === 'content_unit' ? entityId : undefined)
    const legacyScopeRef = scalarValue(entityId)
    const focus = movScriptDomainFocusFromRecord(
      target,
      (entityType === 'production' || entityType === 'segment') && legacyScopeRef !== undefined
        ? { scopeKind: entityType, scopeRef: legacyScopeRef }
        : {},
    )
    return withRouteParams('/project/content/preview', {
      view: 'review',
      workspaceId: input.workspaceId,
      ...movScriptRouteParamsForDomainFocus(focus),
      scene_moment_id: sceneMomentId,
      content_unit_id: contentUnitId,
    })
  }
  return undefined
}

function withRouteParams(pathname: string, params: Record<string, unknown>) {
  return routePathWithParams(pathname, compactRouteParams(params))
}

function compactRouteParams(params: Record<string, unknown>) {
  const routeParams: Record<string, string | number | boolean | null | undefined> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || !String(value).trim()) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      routeParams[key] = value
    } else {
      routeParams[key] = String(value)
    }
  }
  return routeParams
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function scalarValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

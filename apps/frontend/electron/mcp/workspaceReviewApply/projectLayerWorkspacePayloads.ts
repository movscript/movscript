import { stringValue } from '../generation'
import { isRecord } from '../valueUtils'
import type { AgentWorkspaceKind } from '../../../src/shared/contracts/agentWorkspace'
import type { WorkspaceReviewApplyRequest } from './types'
import {
  inferProjectLayerWorkspaceWorkspaceKind,
  projectLayerWorkspaceRouteSegment,
} from './projectLayerWorkspaceKind'
import { normalizeProjectStylePatch } from './projectLayerWorkspaceStyle'
import {
  isProjectLayerWorkspaceTarget,
  resolveWorkspaceProjectId,
} from './workspaceTargets'

export { isProjectLayerWorkspaceTarget } from './workspaceTargets'

export function buildProjectLayerWorkspaceRequest(review: Record<string, unknown>): WorkspaceReviewApplyRequest {
  const projectId = resolveWorkspaceProjectId(review, { allowProjectEntityFallback: isProjectLayerWorkspaceTarget(review) })
  const payload = normalizeProjectLayerWorkspacePayloadForKind(review.proposedValue, stringValue(review.workspaceKind) as AgentWorkspaceKind)
  const routeSegment = projectLayerWorkspaceRouteSegment(inferProjectLayerWorkspaceWorkspaceKind(payload, stringValue(review.workspaceKind) as AgentWorkspaceKind))
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/${routeSegment}/apply`,
    payload,
  }
}

function normalizeProjectLayerWorkspacePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (isRecord(parsed)) return parsed
    } catch {
      // handled below
    }
    throw new Error('project-layer workspace workspace content must be a JSON object')
  }
  if (!isRecord(value)) {
    throw new Error('project-layer workspace workspace content must be a JSON object')
  }
  return value
}

function normalizeProjectLayerWorkspacePayloadForKind(value: unknown, kind: AgentWorkspaceKind): Record<string, unknown> {
  const payload = normalizeProjectLayerWorkspacePayload(value)
  const effectiveKind = inferProjectLayerWorkspaceWorkspaceKind(payload, kind)
  const workspace = isRecord(payload.workspace) ? payload.workspace : {}
  if (effectiveKind === 'setting_workspace' || effectiveKind === 'asset_workspace') {
    const creativeReferences = effectiveKind === 'setting_workspace' ? normalizeProjectLayerWorkspaceSnapshotNodes(workspace.creative_references) : []
    const assetSlots = effectiveKind === 'asset_workspace' ? normalizeProjectLayerWorkspaceSnapshotNodes(workspace.asset_slots) : []
    return {
      ...payload,
      scope: effectiveKind,
      mode: 'snapshot',
      workspace: {
        ...workspace,
        creative_references: creativeReferences,
        asset_slots: assetSlots,
      },
    }
  }
  if (effectiveKind !== 'project_standards_workspace') return payload
  if (workspace.creative_references !== undefined || workspace.asset_slots !== undefined) {
    throw new Error('project_standards_workspace only supports workspace.project_style; use setting_workspace or asset_workspace for project-layer lists')
  }
  return {
    ...payload,
    scope: 'project_standards_workspace',
    mode: 'snapshot',
    workspace: {
      ...workspace,
      project_style: normalizeProjectStylePatch(workspace.project_style),
    },
  }
}

function normalizeProjectLayerWorkspaceSnapshotNodes(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (isRecord(item) && item.fields !== undefined) {
      throw new Error(`project-layer workspace snapshot node ${index} uses deprecated fields wrapper; put editable values directly on the node`)
    }
    return item
  })
}

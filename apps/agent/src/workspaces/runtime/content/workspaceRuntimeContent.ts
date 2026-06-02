import type { JSONValue } from '../../../shared/protocol/types.js'
import { isJSONRecord, isRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import type { AgentWorkspace, AgentWorkspaceSource } from '../../store/workspaceStore.js'

export function assetWorkspaceContainsAssetSlots(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isRecord(parsed)) return false
    const workspace = isRecord(parsed.workspace) ? parsed.workspace : undefined
    return Array.isArray(workspace?.asset_slots) && workspace.asset_slots.length > 0
  } catch {
    return false
  }
}

export function canonicalizeProjectStandardsWorkspaceWorkspaceContent(workspace: AgentWorkspace, backendApply: { response?: unknown }): string | undefined {
  if (workspace.kind !== 'setting_workspace' && workspace.kind !== 'asset_workspace' && workspace.kind !== 'project_standards_workspace') return undefined
  const response = isRecord(backendApply.response) ? backendApply.response : undefined
  const canonicalSnapshot = isJSONRecord(response?.canonical_snapshot) ? response.canonical_snapshot : undefined
  if (!canonicalSnapshot) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(workspace.content)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  const currentWorkspace = isRecord(parsed.workspace) ? parsed.workspace : {}
  const nextWorkspace: Record<string, unknown> = { ...currentWorkspace }
  if (workspace.kind === 'setting_workspace') {
    nextWorkspace.creative_references = Array.isArray(canonicalSnapshot.creative_references) ? canonicalSnapshot.creative_references : []
    delete nextWorkspace.asset_slots
  } else if (workspace.kind === 'asset_workspace') {
    nextWorkspace.asset_slots = Array.isArray(canonicalSnapshot.asset_slots) ? canonicalSnapshot.asset_slots : []
    delete nextWorkspace.creative_references
  } else {
    nextWorkspace.project_style = isRecord(currentWorkspace.project_style) ? currentWorkspace.project_style : {}
    delete nextWorkspace.creative_references
    delete nextWorkspace.asset_slots
  }
  return JSON.stringify({
    ...parsed,
    mode: 'snapshot',
    workspace: nextWorkspace,
  }, null, 2)
}

export function normalizeRuntimeWorkspaceSource(value: unknown): AgentWorkspaceSource | undefined {
  if (!isJSONRecord(value)) return undefined
  const source: AgentWorkspaceSource = {
    ...(typeof value.entityType === 'string' ? { entityType: value.entityType } : {}),
    ...(isValidAgentReferenceId(value.entityId) ? { entityId: value.entityId } : {}),
    ...(typeof value.pipelineNodeId === 'number' || typeof value.pipelineNodeId === 'string' ? { pipelineNodeId: value.pipelineNodeId } : {}),
    ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    ...(typeof value.threadId === 'string' ? { threadId: value.threadId } : {}),
    ...(typeof value.userId === 'number' || typeof value.userId === 'string' ? { userId: value.userId } : {}),
    ...(typeof value.pageKey === 'string' ? { pageKey: value.pageKey } : {}),
    ...(typeof value.pageType === 'string' ? { pageType: value.pageType } : {}),
    ...(typeof value.pageRoute === 'string' ? { pageRoute: value.pageRoute } : {}),
    ...(typeof value.pageEntityType === 'string' ? { pageEntityType: value.pageEntityType } : {}),
    ...(isValidAgentReferenceId(value.pageEntityId) ? { pageEntityId: value.pageEntityId } : {}),
  }
  return Object.keys(source).length > 0 ? source : undefined
}

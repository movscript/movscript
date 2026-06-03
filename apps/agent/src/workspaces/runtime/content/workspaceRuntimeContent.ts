import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import type { AgentWorkspaceSource } from '../../store/workspaceStore.js'

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

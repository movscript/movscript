import type { JSONValue } from '../types.js'
import type { BackendApplyResult } from './backendApplyClient.js'
import type { AgentDraft, AgentDraftSource } from './draftStore.js'

export function assetProposalContainsAssetSlots(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isRecord(parsed)) return false
    const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
    return Array.isArray(proposal?.asset_slots) && proposal.asset_slots.length > 0
  } catch {
    return false
  }
}

export function canonicalizeProjectProposalDraftContent(draft: AgentDraft, backendApply: BackendApplyResult): string | undefined {
  if (draft.kind !== 'setting_proposal' && draft.kind !== 'asset_proposal' && draft.kind !== 'project_proposal') return undefined
  const response = isRecord(backendApply.response) ? backendApply.response : undefined
  const canonicalSnapshot = isRecord(response?.canonical_snapshot) ? response.canonical_snapshot : undefined
  if (!canonicalSnapshot) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  const currentProposal = isRecord(parsed.proposal) ? parsed.proposal : {}
  const nextProposal: Record<string, unknown> = { ...currentProposal }
  if (draft.kind === 'setting_proposal') {
    nextProposal.creative_references = Array.isArray(canonicalSnapshot.creative_references) ? canonicalSnapshot.creative_references : []
    nextProposal.asset_slots = []
  } else if (draft.kind === 'asset_proposal') {
    nextProposal.creative_references = []
    nextProposal.asset_slots = Array.isArray(canonicalSnapshot.asset_slots) ? canonicalSnapshot.asset_slots : []
  } else {
    nextProposal.project_style = isRecord(currentProposal.project_style) ? currentProposal.project_style : {}
    nextProposal.creative_references = []
    nextProposal.asset_slots = []
  }
  return JSON.stringify({
    ...parsed,
    mode: 'snapshot',
    snapshot_base: canonicalSnapshot as JSONValue,
    proposal: nextProposal,
  }, null, 2)
}

export function normalizeRuntimeDraftSource(value: unknown): AgentDraftSource | undefined {
  if (!isJSONRecord(value)) return undefined
  const source: AgentDraftSource = {
    ...(typeof value.entityType === 'string' ? { entityType: value.entityType } : {}),
    ...(typeof value.entityId === 'number' || typeof value.entityId === 'string' ? { entityId: value.entityId } : {}),
    ...(typeof value.pipelineNodeId === 'number' || typeof value.pipelineNodeId === 'string' ? { pipelineNodeId: value.pipelineNodeId } : {}),
    ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    ...(typeof value.threadId === 'string' ? { threadId: value.threadId } : {}),
    ...(typeof value.userId === 'number' || typeof value.userId === 'string' ? { userId: value.userId } : {}),
    ...(typeof value.pageKey === 'string' ? { pageKey: value.pageKey } : {}),
    ...(typeof value.pageType === 'string' ? { pageType: value.pageType } : {}),
    ...(typeof value.pageRoute === 'string' ? { pageRoute: value.pageRoute } : {}),
    ...(typeof value.pageEntityType === 'string' ? { pageEntityType: value.pageEntityType } : {}),
    ...(typeof value.pageEntityId === 'number' || typeof value.pageEntityId === 'string' ? { pageEntityId: value.pageEntityId } : {}),
  }
  return Object.keys(source).length > 0 ? source : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}

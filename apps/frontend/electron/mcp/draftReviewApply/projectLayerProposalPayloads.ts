import { stringValue } from '../generation'
import { isRecord } from '../valueUtils'
import type { AgentDraftKind } from '../../../src/shared/contracts/agentDraft'
import type { DraftReviewApplyRequest } from './types'
import {
  inferProjectLayerProposalDraftKind,
  projectLayerProposalRouteSegment,
} from './projectLayerProposalKind'
import { normalizeProjectStylePatch } from './projectLayerProposalStyle'
import {
  isProjectLayerProposalTarget,
  resolveProposalProjectId,
} from './proposalTargets'

export { isProjectLayerProposalTarget } from './proposalTargets'

export function buildProjectLayerProposalRequest(review: Record<string, unknown>): DraftReviewApplyRequest {
  const projectId = resolveProposalProjectId(review, { allowProjectEntityFallback: isProjectLayerProposalTarget(review) })
  const payload = normalizeProjectLayerProposalPayloadForKind(review.proposedValue, stringValue(review.draftKind) as AgentDraftKind)
  const routeSegment = projectLayerProposalRouteSegment(inferProjectLayerProposalDraftKind(payload, stringValue(review.draftKind) as AgentDraftKind))
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/${routeSegment}/apply`,
    payload,
  }
}

function normalizeProjectLayerProposalPayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (isRecord(parsed)) return parsed
    } catch {
      // handled below
    }
    throw new Error('project-layer proposal draft content must be a JSON object')
  }
  if (!isRecord(value)) {
    throw new Error('project-layer proposal draft content must be a JSON object')
  }
  return value
}

function normalizeProjectLayerProposalPayloadForKind(value: unknown, kind: AgentDraftKind): Record<string, unknown> {
  const payload = normalizeProjectLayerProposalPayload(value)
  const effectiveKind = inferProjectLayerProposalDraftKind(payload, kind)
  const proposal = isRecord(payload.proposal) ? payload.proposal : {}
  if (effectiveKind === 'setting_proposal' || effectiveKind === 'asset_proposal') {
    const creativeReferences = effectiveKind === 'setting_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.creative_references) : []
    const assetSlots = effectiveKind === 'asset_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.asset_slots) : []
    return {
      ...payload,
      scope: effectiveKind,
      mode: 'snapshot',
      proposal: {
        ...proposal,
        creative_references: creativeReferences,
        asset_slots: assetSlots,
      },
    }
  }
  if (effectiveKind !== 'project_standards_proposal') return payload
  if (proposal.creative_references !== undefined || proposal.asset_slots !== undefined) {
    throw new Error('project_standards_proposal only supports proposal.project_style; use setting_proposal or asset_proposal for project-layer lists')
  }
  return {
    ...payload,
    scope: 'project_standards_proposal',
    mode: 'snapshot',
    proposal: {
      ...proposal,
      project_style: normalizeProjectStylePatch(proposal.project_style),
    },
  }
}

function normalizeProjectLayerProposalSnapshotNodes(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (isRecord(item) && item.fields !== undefined) {
      throw new Error(`project-layer proposal snapshot node ${index} uses deprecated fields wrapper; put editable values directly on the node`)
    }
    return item
  })
}

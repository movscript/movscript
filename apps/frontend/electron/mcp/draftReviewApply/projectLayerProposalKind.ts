import type { AgentDraftKind } from '../../../src/shared/contracts/agentDraft'

export function inferProjectLayerProposalDraftKind(payload: Record<string, unknown>, kind: AgentDraftKind): AgentDraftKind {
  if (kind === 'setting_proposal' || kind === 'asset_proposal' || kind === 'project_standards_proposal') return kind
  const schema = typeof payload.schema === 'string' ? payload.schema : ''
  if (schema === 'movscript.setting_proposal.v1') return 'setting_proposal'
  if (schema === 'movscript.asset_proposal.v1') return 'asset_proposal'
  if (schema === 'movscript.project_standards_proposal.v1') return 'project_standards_proposal'
  const scope = typeof payload.scope === 'string' ? payload.scope : ''
  if (scope === 'setting_proposal' || scope === 'asset_proposal' || scope === 'project_standards_proposal') return scope
  return kind
}

export function projectLayerProposalRouteSegment(kind: AgentDraftKind): string {
  switch (kind) {
  case 'setting_proposal':
    return 'setting-proposals'
  case 'asset_proposal':
    return 'asset-proposals'
  case 'project_standards_proposal':
    return 'project-standards-proposals'
  default:
    throw new Error(`unsupported project-layer proposal kind: ${kind}`)
  }
}

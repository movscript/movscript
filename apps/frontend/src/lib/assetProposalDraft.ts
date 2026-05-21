import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_SCOPES } from '@movscript/draft-schemas'

export const ASSET_PROPOSAL_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.assetProposal
export const ASSET_PROPOSAL_SCOPE = DRAFT_SCOPES.assetProposal

export type AssetProposalOutputKind = 'image' | 'video' | 'audio' | 'text' | 'file'

export interface AssetProposalReferenceResource {
  resource_id: number
  role: 'locked' | 'candidate' | 'slot_resource' | 'context' | 'style' | 'negative'
  reason?: string
}

export interface AssetProposalCandidatePlan {
  client_id?: string
  output_kind: AssetProposalOutputKind
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  duration?: number
  model_capability?: 'image' | 'image_edit' | 'video' | 'video_i2v'
  input_resource_ids: number[]
  rationale?: string
  acceptance_criteria: string[]
  risks?: string[]
}

export interface AssetProposalDraftContent {
  schema: typeof ASSET_PROPOSAL_DRAFT_SCHEMA
  scope: typeof ASSET_PROPOSAL_SCOPE
  mode: 'snapshot'
  projectId?: number
  assetSlotId: number
  summary: string
  slot: {
    id: number
    name: string
    kind: string
    description?: string
    prompt_hint?: string
    owner_label?: string
  }
  context: {
    reference_resources: AssetProposalReferenceResource[]
    notes: string[]
  }
  proposal: {
    creative_references: []
    asset_slots: []
    candidate_plans: AssetProposalCandidatePlan[]
  }
  next_actions: string[]
  createdAt: string
}

export function buildEmptyAssetProposalDraftContent(input: {
  projectId?: number
  assetSlotId: number
  slotName: string
  slotKind: string
  description?: string
  promptHint?: string
  ownerLabel?: string
  referenceResourceIds?: number[]
  createdAt?: string
}): AssetProposalDraftContent {
  return {
    schema: ASSET_PROPOSAL_DRAFT_SCHEMA,
    scope: ASSET_PROPOSAL_SCOPE,
    mode: 'snapshot',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    assetSlotId: input.assetSlotId,
    summary: '',
    slot: {
      id: input.assetSlotId,
      name: input.slotName,
      kind: input.slotKind,
      ...(input.description ? { description: input.description } : {}),
      ...(input.promptHint ? { prompt_hint: input.promptHint } : {}),
      ...(input.ownerLabel ? { owner_label: input.ownerLabel } : {}),
    },
    context: {
      reference_resources: (input.referenceResourceIds ?? []).map((resourceId) => ({
        resource_id: resourceId,
        role: 'context' as const,
      })),
      notes: [],
    },
    proposal: {
      creative_references: [],
      asset_slots: [],
      candidate_plans: [],
    },
    next_actions: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

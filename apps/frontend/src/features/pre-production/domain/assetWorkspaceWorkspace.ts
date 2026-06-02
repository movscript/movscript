import { WORKSPACE_CONTENT_SCHEMA_IDS, WORKSPACE_SCOPES } from '@movscript/workspaces'

export const ASSET_WORKSPACE_WORKSPACE_SCHEMA = WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace
export const ASSET_WORKSPACE_SCOPE = WORKSPACE_SCOPES.assetWorkspace

export type AssetWorkspaceOutputKind = 'image' | 'video' | 'audio' | 'text' | 'file'

export interface AssetWorkspaceReferenceResource {
  resource_id: number
  role: 'locked' | 'candidate' | 'slot_resource' | 'context' | 'style' | 'negative'
  reason?: string
}

export interface AssetWorkspaceCandidateTaskGraph {
  client_id?: string
  output_kind: AssetWorkspaceOutputKind
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  duration?: number
  model_capability?: 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v' | 'audio_tts' | 'audio_transcribe' | 'subtitle_align' | 'render_video'
  input_resource_ids: number[]
  rationale?: string
  acceptance_criteria: string[]
  risks?: string[]
}

export interface AssetWorkspaceWorkspaceContent {
  schema: typeof ASSET_WORKSPACE_WORKSPACE_SCHEMA
  scope: typeof ASSET_WORKSPACE_SCOPE
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
    reference_resources: AssetWorkspaceReferenceResource[]
    notes: string[]
  }
  workspace: {
    creative_references: []
    asset_slots: []
    candidate_plans: AssetWorkspaceCandidateTaskGraph[]
  }
  next_actions: string[]
  createdAt: string
}

export function buildEmptyAssetWorkspaceWorkspaceContent(input: {
  projectId?: number
  assetSlotId: number
  slotName: string
  slotKind: string
  description?: string
  promptHint?: string
  ownerLabel?: string
  referenceResourceIds?: number[]
  createdAt?: string
}): AssetWorkspaceWorkspaceContent {
  return {
    schema: ASSET_WORKSPACE_WORKSPACE_SCHEMA,
    scope: ASSET_WORKSPACE_SCOPE,
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
    workspace: {
      creative_references: [],
      asset_slots: [],
      candidate_plans: [],
    },
    next_actions: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

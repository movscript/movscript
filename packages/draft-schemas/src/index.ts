export const DRAFT_SCHEMA_REGISTRY = {
  projectProposal: {
    id: 'movscript.project_proposal.v1',
    kind: 'project_proposal',
    category: 'project',
    title: 'Project Proposal',
  },
  productionProposal: {
    id: 'movscript.production_proposal_draft.v2',
    kind: 'production_proposal',
    category: 'production',
    title: 'Production Proposal',
  },
  contentUnitProposal: {
    id: 'movscript.content_unit_proposal.v1',
    kind: 'content_unit_proposal',
    category: 'content_unit',
    title: 'Content Unit Proposal',
  },
  assetProposal: {
    id: 'movscript.asset_proposal.v1',
    kind: 'asset_proposal',
    category: 'asset',
    title: 'Asset Proposal',
  },
  contentUnitMediaProposal: {
    id: 'movscript.content_unit_media_proposal.v1',
    kind: 'content_unit_media_proposal',
    category: 'content_unit_media',
    title: 'Content Unit Media Proposal',
  },
  scriptSplit: {
    id: 'movscript.script_split_proposal.v1',
    kind: 'script_split',
    category: 'script',
    title: 'Script Split Proposal',
  },
} as const

export const DRAFT_CONTENT_SCHEMA_IDS = {
  projectProposal: DRAFT_SCHEMA_REGISTRY.projectProposal.id,
  productionProposal: DRAFT_SCHEMA_REGISTRY.productionProposal.id,
  contentUnitProposal: DRAFT_SCHEMA_REGISTRY.contentUnitProposal.id,
  assetProposal: DRAFT_SCHEMA_REGISTRY.assetProposal.id,
  contentUnitMediaProposal: DRAFT_SCHEMA_REGISTRY.contentUnitMediaProposal.id,
  scriptSplit: DRAFT_SCHEMA_REGISTRY.scriptSplit.id,
} as const

export const DRAFT_SCHEMA_IDS = Object.values(DRAFT_SCHEMA_REGISTRY).map((item) => item.id) as ReadonlyArray<string>

export type DraftSchemaKey = keyof typeof DRAFT_SCHEMA_REGISTRY
export type DraftSchemaCategory = typeof DRAFT_SCHEMA_REGISTRY[DraftSchemaKey]['category']

export const DRAFT_SCOPES = {
  projectProposal: 'project_proposal',
  productionProposal: 'production_proposal',
  contentUnitProposal: 'content_unit_proposal',
  assetProposal: 'asset_proposal',
  contentUnitMediaProposal: 'content_unit_media_proposal',
  scriptSplit: 'script_split',
} as const

export const DRAFT_KIND_VALUES = [
  'script_split',
  'script',
  'asset_slot',
  'storyboard_line',
  'content_unit',
  'prompt',
  'note',
  'pipeline',
  'segment',
  'scene_moment',
  'asset_proposal',
  'project_proposal',
  'production_proposal',
  'content_unit_proposal',
  'content_unit_media_proposal',
] as const

export type DraftKindValue = typeof DRAFT_KIND_VALUES[number]

export function getDraftSchemaEntry(schemaId: string) {
  return Object.values(DRAFT_SCHEMA_REGISTRY).find((item) => item.id === schemaId) ?? null
}

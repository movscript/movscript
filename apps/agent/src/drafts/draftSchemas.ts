export const DRAFT_CONTENT_SCHEMA_IDS = {
  scriptSplit: 'movscript.script_split_analysis.v1',
  projectProposal: 'movscript.project_proposal.v1',
  productionProposal: 'movscript.production_proposal_draft.v2',
  assetProposal: 'movscript.asset_proposal.v1',
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
] as const

export type DraftKindValue = typeof DRAFT_KIND_VALUES[number]


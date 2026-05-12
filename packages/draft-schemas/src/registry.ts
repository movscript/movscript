import type { DraftKind, DraftSchemaDefinition } from './types.js'

function objectSchema(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required,
    properties,
  }
}

const actionSchema = { enum: ['create', 'update', 'reuse'] }
const clientIdSchema = { type: 'string', minLength: 1 }

export const projectProposalSchema = {
  id: 'movscript.project_proposal.v1',
  kind: 'project_proposal',
  category: 'project',
  scope: 'project',
  title: 'Project Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['proposal'], {
    proposal: objectSchema([], {
      creative_references: {
        type: 'array',
        items: objectSchema(['action', 'fields'], {
          action: actionSchema,
          id: { type: 'number' },
          client_id: clientIdSchema,
          merge_candidates: { type: 'array' },
          fields: objectSchema(['name'], {
            name: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          }),
        }),
      },
      asset_slots: {
        type: 'array',
        items: objectSchema(['action', 'owner', 'fields'], {
          action: actionSchema,
          id: { type: 'number' },
          client_id: clientIdSchema,
          owner: objectSchema(['type'], {
            type: { const: 'creative_reference' },
            id: { type: 'number' },
            client_id: clientIdSchema,
          }),
          fields: objectSchema(['name', 'kind'], {
            name: { type: 'string' },
            kind: { enum: ['image', 'video', 'audio', 'text'] },
            description: { type: 'string' },
          }),
        }),
      },
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.project_proposal.v1',
    '',
    'Content shape:',
    '{ proposal: { creative_references?: Array<{ action, id?, client_id?, fields }>, asset_slots?: Array<{ action, owner, fields }> }, impact_notes?, summary? }',
    '',
    'Rules:',
    '- reuse/update nodes must include an existing id; create nodes must include client_id.',
    '- Each asset_slot must be owned by one creative_reference via id or client_id.',
    '- Vague style words need concrete visible traits or must be recorded in impact_notes.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      proposal: {
        creative_references: [{
          action: 'create',
          client_id: 'ref-hero',
          fields: { name: 'Main character', description: 'A reserved young engineer.' },
        }],
        asset_slots: [{
          action: 'create',
          client_id: 'asset-portrait',
          owner: { type: 'creative_reference', client_id: 'ref-hero' },
          fields: { name: 'Character portrait', kind: 'image' },
        }],
      },
      summary: 'Adds one character reference and one owned portrait slot.',
    },
  }],
} satisfies DraftSchemaDefinition

export const productionProposalSchema = {
  id: 'movscript.production_proposal.v1',
  kind: 'production_proposal',
  category: 'production',
  scope: 'production',
  title: 'Production Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['productionId', 'proposalScope', 'proposal'], {
    productionId: { type: 'number' },
    proposalScope: { const: 'production' },
    proposal: objectSchema(['segments'], {
      segments: {
        type: 'array',
        items: objectSchema(['action', 'title', 'scene_moments'], {
          action: actionSchema,
          id: { type: 'number' },
          client_id: clientIdSchema,
          title: { type: 'string' },
          scene_moments: { type: 'array' },
        }),
      },
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.production_proposal.v1',
    '',
    'Content shape:',
    '{ productionId: number, proposalScope: "production", proposal: { segments: Array<{ action, id?, client_id?, title, scene_moments: Array<object> }> }, impact_notes?, summary? }',
    '',
    'Rules:',
    '- productionId is required and must match the selected production.',
    '- reuse/update nodes must include existing ids.',
    '- Reference project-level creative references and asset slots; do not create final project entities.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      productionId: 1,
      proposalScope: 'production',
      proposal: {
        segments: [{
          action: 'create',
          client_id: 'seg-1',
          title: 'Opening tension',
          scene_moments: [],
        }],
      },
    },
  }],
} satisfies DraftSchemaDefinition

export const contentUnitProposalSchema = {
  id: 'movscript.content_unit_proposal.v1',
  kind: 'content_unit_proposal',
  category: 'content_unit',
  scope: 'content_unit',
  title: 'Content Unit Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['units'], {
    units: {
      type: 'array',
      items: objectSchema(['title', 'kind', 'description'], {
        title: { type: 'string' },
        kind: { enum: ['shot', 'visual_segment', 'caption_card', 'narration', 'transition', 'music_beat', 'product_showcase'] },
        description: { type: 'string' },
        prompt: { type: 'string' },
        duration_sec: { type: 'number' },
      }),
    },
  }),
  promptSummary: [
    '# movscript.content_unit_proposal.v1',
    'Content shape: { units: Array<{ title, kind, description, prompt?, duration_sec? }> }',
    'Rules: propose 3-6 focused content units; avoid duplicates and vague adjectives without production detail.',
  ].join('\n'),
  examples: [{ name: 'basic', content: { units: [{ title: 'Reveal shot', kind: 'shot', description: 'A close reveal of the object.' }] } }],
} satisfies DraftSchemaDefinition

export const contentUnitMediaProposalSchema = {
  id: 'movscript.content_unit_media_proposal.v1',
  kind: 'content_unit_media_proposal',
  category: 'content_unit_media',
  scope: 'content_unit',
  title: 'Content Unit Media Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['media_plans'], {
    media_plans: {
      type: 'array',
      items: objectSchema(['kind', 'prompt'], {
        kind: { enum: ['image', 'video'] },
        prompt: { type: 'string' },
        references: { type: 'array' },
        acceptance_criteria: { type: 'array', items: { type: 'string' } },
      }),
    },
  }),
  promptSummary: [
    '# movscript.content_unit_media_proposal.v1',
    'Content shape: { media_plans: Array<{ kind: "image"|"video", prompt, references?, acceptance_criteria? }> }',
    'Rules: plan reviewable keyframe or video outputs for one content unit; do not create generation jobs.',
  ].join('\n'),
  examples: [{ name: 'basic', content: { media_plans: [{ kind: 'image', prompt: 'Clean product keyframe.', acceptance_criteria: ['Product is readable.'] }] } }],
} satisfies DraftSchemaDefinition

export const assetProposalSchema = {
  id: 'movscript.asset_proposal.v1',
  kind: 'asset_proposal',
  category: 'asset',
  scope: 'asset',
  title: 'Asset Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['asset_slot', 'candidate_plan'], {
    asset_slot: objectSchema(['id'], { id: { type: ['number', 'string'] }, name: { type: 'string' } }),
    candidate_plan: {
      type: 'array',
      items: objectSchema(['kind', 'prompt'], {
        kind: { enum: ['image', 'video', 'audio', 'text'] },
        prompt: { type: 'string' },
        references: { type: 'array' },
        risks: { type: 'array', items: { type: 'string' } },
      }),
    },
  }),
  promptSummary: [
    '# movscript.asset_proposal.v1',
    'Content shape: { asset_slot: { id, name? }, candidate_plan: Array<{ kind, prompt, references?, risks? }>, acceptance_criteria? }',
    'Rules: prepare candidate generation; do not submit generation jobs from this workflow.',
  ].join('\n'),
  examples: [{ name: 'basic', content: { asset_slot: { id: 1, name: 'Hero portrait' }, candidate_plan: [{ kind: 'image', prompt: 'Portrait with neutral background.' }] } }],
} satisfies DraftSchemaDefinition

export const scriptSplitProposalSchema = {
  id: 'movscript.script_split_proposal.v1',
  kind: 'script_split_proposal',
  category: 'script',
  scope: 'project',
  title: 'Script Split Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'source_title', 'episode_drafts'], {
    schema: { const: 'movscript.script_split_proposal.v1' },
    source_title: { type: 'string' },
    source_summary: { type: 'string' },
    global_settings: { type: 'object' },
    episode_drafts: {
      type: 'array',
      items: objectSchema(['order', 'title', 'start_line', 'end_line', 'action'], {
        order: { type: 'number' },
        title: { type: 'string' },
        summary: { type: 'string' },
        start_line: { type: 'number' },
        end_line: { type: 'number' },
        action: { enum: ['create', 'update'] },
        production_action: { enum: ['create', 'update', 'skip'] },
      }),
    },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  }),
  promptSummary: [
    '# movscript.script_split_proposal.v1',
    'Content shape: { schema, source_title, source_summary?, global_settings?, episode_drafts: Array<{ order, title, summary?, start_line, end_line, action, production_action? }>, warnings?, confidence? }',
    'Rules: use line numbers only; never copy raw script body text into the draft.',
  ].join('\n'),
  examples: [{ name: 'basic', content: { schema: 'movscript.script_split_proposal.v1', source_title: 'Pilot', episode_drafts: [{ order: 1, title: 'Episode 1', start_line: 1, end_line: 20, action: 'create', production_action: 'create' }] } }],
} satisfies DraftSchemaDefinition

export const DRAFT_SCHEMA_REGISTRY = {
  [projectProposalSchema.id]: projectProposalSchema,
  [productionProposalSchema.id]: productionProposalSchema,
  [contentUnitProposalSchema.id]: contentUnitProposalSchema,
  [contentUnitMediaProposalSchema.id]: contentUnitMediaProposalSchema,
  [assetProposalSchema.id]: assetProposalSchema,
  [scriptSplitProposalSchema.id]: scriptSplitProposalSchema,
} as const satisfies Record<string, DraftSchemaDefinition>

export const DRAFT_CONTENT_SCHEMA_IDS = {
  projectProposal: projectProposalSchema.id,
  productionProposal: productionProposalSchema.id,
  contentUnitProposal: contentUnitProposalSchema.id,
  assetProposal: assetProposalSchema.id,
  contentUnitMediaProposal: contentUnitMediaProposalSchema.id,
  scriptSplit: scriptSplitProposalSchema.id,
} as const

export const DRAFT_SCHEMA_IDS = Object.keys(DRAFT_SCHEMA_REGISTRY)
export type DraftSchemaKey = keyof typeof DRAFT_SCHEMA_REGISTRY

export const DRAFT_SCOPES = {
  projectProposal: projectProposalSchema.kind,
  productionProposal: productionProposalSchema.kind,
  contentUnitProposal: contentUnitProposalSchema.kind,
  assetProposal: assetProposalSchema.kind,
  contentUnitMediaProposal: contentUnitMediaProposalSchema.kind,
  scriptSplit: scriptSplitProposalSchema.kind,
} as const

export const DRAFT_KIND_VALUES = [
  'script_split_proposal',
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
] as const satisfies readonly DraftKind[]

export type DraftKindValue = typeof DRAFT_KIND_VALUES[number]

export function getDraftSchemaEntry(schemaId: string): DraftSchemaDefinition | null {
  return DRAFT_SCHEMA_REGISTRY[schemaId] ?? null
}

export function listSchemasByKind(kind: DraftKind): DraftSchemaDefinition[] {
  return Object.values(DRAFT_SCHEMA_REGISTRY)
    .filter((schema) => schema.kind === kind)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

export function getActiveSchemaForKind(kind: DraftKind): DraftSchemaDefinition {
  const active = listSchemasByKind(kind).filter((schema) => schema.status === 'active')
  if (active.length === 0) throw new Error(`No active draft schema for kind: ${kind}`)
  return active[0]
}

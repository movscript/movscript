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
const proposalModeSchema = { enum: ['patch', 'snapshot'] }
const projectProposalCreativeReferencesSchema = {
  type: 'array',
  items: objectSchema(['fields'], {
    id: { type: 'number' },
    client_id: clientIdSchema,
    merge_candidates: { type: 'array' },
    fields: objectSchema(['name'], {
      name: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    }),
  }),
}
const projectProposalAssetSlotsSchema = {
  type: 'array',
  items: objectSchema(['fields'], {
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
}

export const projectProposalSchema = {
  id: 'movscript.project_proposal.v1',
  kind: 'project_proposal',
  category: 'project',
  scope: 'project',
  title: 'Project Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['proposal'], {
    mode: proposalModeSchema,
    snapshot_base: { type: 'object' },
    proposal: objectSchema([], {
      creative_references: projectProposalCreativeReferencesSchema,
      asset_slots: projectProposalAssetSlotsSchema,
      project_style: {
        type: 'object',
        additionalProperties: true,
        properties: {
          aspect_ratio: { type: 'string' },
          shot_size_system: { type: 'array', items: { type: 'string' } },
          camera_language: { type: 'string' },
          visual_style: { type: 'string' },
          lighting_style: { type: 'string' },
          color_palette: { type: 'string' },
          pacing_rules: { type: 'string' },
          negative_rules: { type: 'array', items: { type: 'string' } },
        },
      },
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.project_proposal.v1',
    '',
    'Content shape:',
    '{ mode?: "patch"|"snapshot", proposal: { project_style: { aspect_ratio?, shot_size_system?, camera_language?, visual_style?, lighting_style?, color_palette?, pacing_rules?, negative_rules? }, creative_references?: [], asset_slots?: [] }, snapshot_base?, impact_notes?, summary? }',
    '',
    'Rules:',
    '- Project proposal owns project-wide production standards: shot sizes, aspect ratio, camera language, style, lighting, color, pacing, and negative rules.',
    '- Do not use project proposal as the default place for setting lists or asset slot lists. Use setting_proposal and asset_proposal for those.',
    '- Legacy payloads may still include creative_references or asset_slots for compatibility, but new drafts should keep them empty unless explicitly migrating old data.',
    '- Vague style words need concrete visible traits or must be recorded in impact_notes.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      proposal: {
        creative_references: [],
        asset_slots: [],
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: ['wide', 'medium', 'close-up', 'insert'],
          visual_style: 'Clean vertical drama realism with readable product and prop details.',
          negative_rules: ['No unreadable dark scenes', 'No arbitrary character face changes'],
        },
      },
      summary: 'Defines project-wide production standards.',
    },
  }],
} satisfies DraftSchemaDefinition

export const settingProposalSchema = {
  id: 'movscript.setting_proposal.v1',
  kind: 'setting_proposal',
  category: 'project',
  scope: 'project',
  title: 'Setting Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['proposal'], {
    mode: proposalModeSchema,
    snapshot_base: { type: 'object' },
    proposal: objectSchema([], {
      creative_references: projectProposalCreativeReferencesSchema,
      asset_slots: {
        type: 'array',
        maxItems: 0,
        description: 'Setting proposals never edit asset slots.',
      },
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.setting_proposal.v1',
    '',
    'Content shape:',
    '{ mode?: "patch"|"snapshot", proposal: { creative_references?: Array<{ id?, client_id?, fields }>, asset_slots?: [] }, snapshot_base?, impact_notes?, summary? }',
    '',
    'Rules:',
    '- Setting proposals only create, update, merge, or retire creative_references.',
    '- Do not include asset_slots, candidate image plans, prompts, generation jobs, or generated resources.',
    '- Existing rows are identified by id; new rows use client_id.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      proposal: {
        creative_references: [{
          client_id: 'ref-hero',
          fields: { name: 'Main character', description: 'A reserved young engineer.' },
        }],
        asset_slots: [],
      },
      summary: 'Adds one character reference.',
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
          scene_moments: {
            type: 'array',
            items: objectSchema(['action', 'title'], {
              action: actionSchema,
              id: { type: 'number' },
              client_id: clientIdSchema,
              title: { type: 'string' },
              time_text: { type: 'string' },
              location_text: { type: 'string' },
              action_text: { type: 'string' },
              mood: { type: 'string' },
              description: { type: 'string' },
              order: { type: 'number' },
              status: { type: 'string' },
              creative_references: {
                type: 'array',
                items: objectSchema(['action', 'id'], {
                  action: { const: 'reuse' },
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  name: { type: 'string' },
                  role: { type: 'string' },
                }),
              },
              asset_slots: {
                type: 'array',
                items: objectSchema(['action', 'name', 'kind'], {
                  action: actionSchema,
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  name: { type: 'string' },
                  kind: { enum: ['image', 'video', 'audio', 'text'] },
                  description: { type: 'string' },
                  priority: { type: 'string' },
                }),
              },
            }),
          },
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
    '{ productionId: number, proposalScope: "production", proposal: { segments: Array<{ action, id?, client_id?, title, scene_moments: Array<{ action, id?, client_id?, title, time_text?, location_text?, action_text?, mood?, creative_references?: Array<{ action: "reuse", id, role? }>, asset_slots?: Array<{ action, id?, client_id?, name, kind, description? }> }> }> }, impact_notes?, summary? }',
    '',
    'Rules:',
    '- productionId is required and must match the selected production.',
    '- reuse/update nodes must include existing ids.',
    '- Each scene_moment should include at least one creative_references reuse node or one asset_slots node unless the gap is intentionally explained in impact_notes.',
    '- Use creative_references with action "reuse" and existing project-level ids; do not create project-level creative references here.',
    '- Use asset_slots for production-local material slots owned by the scene moment; do not create final media resources.',
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
          scene_moments: [{
            action: 'create',
            client_id: 'moment-1',
            title: 'Opening beat',
            creative_references: [{ action: 'reuse', id: 1, role: 'character' }],
            asset_slots: [{ action: 'create', client_id: 'slot-1', name: 'Opening room reference', kind: 'image' }],
          }],
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
  scope: 'project',
  title: 'Asset Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['proposal'], {
    mode: proposalModeSchema,
    snapshot_base: { type: 'object' },
    projectId: { type: 'number' },
    assetSlotId: { type: ['number', 'string'] },
    slot: objectSchema([], { id: { type: ['number', 'string'] }, name: { type: 'string' }, kind: { type: 'string' } }),
    context: { type: 'object' },
    proposal: objectSchema([], {
      creative_references: {
        type: 'array',
        maxItems: 0,
        description: 'Asset proposals never edit settings.',
      },
      asset_slots: projectProposalAssetSlotsSchema,
      candidate_plans: {
        type: 'array',
        items: objectSchema(['output_kind', 'prompt'], {
          client_id: clientIdSchema,
          output_kind: { enum: ['image', 'video', 'audio', 'text', 'file'] },
          prompt: { type: 'string' },
          negative_prompt: { type: 'string' },
          aspect_ratio: { type: 'string' },
          duration: { type: 'number' },
          model_capability: { enum: ['image', 'image_edit', 'video', 'video_i2v'] },
          input_resource_ids: { type: 'array', items: { type: 'number' } },
          references: { type: 'array' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
        }),
      },
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
    next_actions: { type: 'array', items: { type: 'string' } },
  }),
  promptSummary: [
    '# movscript.asset_proposal.v1',
    '',
    'Content shape:',
    '{ mode?: "patch"|"snapshot", proposal: { creative_references?: [], asset_slots?: Array<{ id?, client_id?, owner?, fields }>, candidate_plans?: Array<{ output_kind, prompt, input_resource_ids?, acceptance_criteria?, risks? }> }, assetSlotId?, slot?, context?, snapshot_base?, impact_notes?, summary?, next_actions? }',
    '',
    'Rules:',
    '- Asset proposal is the single draft kind for project asset slots and per-slot candidate planning.',
    '- Use proposal.asset_slots to create, update, reassign, waive, or retire asset slot requirements.',
    '- Use proposal.candidate_plans only after an asset slot exists or is explicitly selected.',
    '- Do not include creative reference edits, generation jobs, or generated resource bindings.',
  ].join('\n'),
  examples: [{
    name: 'asset-slot-requirement',
    content: {
      proposal: {
        creative_references: [],
        asset_slots: [{
          client_id: 'asset-portrait',
          owner: { type: 'creative_reference', id: 1 },
          fields: { name: 'Character portrait', kind: 'image' },
        }],
        candidate_plans: [],
      },
      summary: 'Adds one owned portrait requirement.',
    },
  }, {
    name: 'candidate-plan',
    content: {
      assetSlotId: 1,
      slot: { id: 1, name: 'Hero portrait', kind: 'image' },
      proposal: {
        creative_references: [],
        asset_slots: [],
        candidate_plans: [{ output_kind: 'image', prompt: 'Portrait with neutral background.', input_resource_ids: [], acceptance_criteria: ['Face remains consistent.'] }],
      },
    },
  }],
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
  [settingProposalSchema.id]: settingProposalSchema,
  [projectProposalSchema.id]: projectProposalSchema,
  [productionProposalSchema.id]: productionProposalSchema,
  [contentUnitProposalSchema.id]: contentUnitProposalSchema,
  [contentUnitMediaProposalSchema.id]: contentUnitMediaProposalSchema,
  [assetProposalSchema.id]: assetProposalSchema,
  [scriptSplitProposalSchema.id]: scriptSplitProposalSchema,
} as const satisfies Record<string, DraftSchemaDefinition>

export const DRAFT_CONTENT_SCHEMA_IDS = {
  settingProposal: settingProposalSchema.id,
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
  settingProposal: settingProposalSchema.kind,
  projectProposal: projectProposalSchema.kind,
  productionProposal: productionProposalSchema.kind,
  contentUnitProposal: contentUnitProposalSchema.kind,
  assetProposal: assetProposalSchema.kind,
  contentUnitMediaProposal: contentUnitMediaProposalSchema.kind,
  scriptSplit: scriptSplitProposalSchema.kind,
} as const

export const DRAFT_KIND_VALUES = [
  'setting_proposal',
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

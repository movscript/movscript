import type { DraftKind, DraftSchemaDefinition } from './types.js'

function objectSchema(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required,
    properties,
  }
}

const clientIdSchema = { type: 'string', minLength: 1 }
const proposalModeSchema = { const: 'snapshot' }
const assetSlotOwnerTypeSchema = {
  enum: ['creative_reference', 'creative_reference_state', 'segment', 'scene_moment', 'content_unit', 'keyframe'],
}
const projectLayerProposalCreativeReferencesSchema = {
  type: 'array',
  items: objectSchema(['name'], {
    id: { type: 'number' },
    client_id: clientIdSchema,
    merge_candidates: { type: 'array' },
    source_script_id: { type: 'number' },
    source_analysis_id: { type: 'number' },
    kind: { type: 'string' },
    name: { type: 'string' },
    alias: { type: 'string' },
    description: { type: 'string' },
    content: { type: 'string' },
    importance: { type: 'string' },
    status: { type: 'string' },
    profile_json: { type: 'string' },
    tags_json: { type: 'string' },
  }),
}
const projectLayerProposalAssetSlotsSchema = {
  type: 'array',
  items: objectSchema(['name', 'kind'], {
    id: { type: 'number' },
    client_id: clientIdSchema,
    owner: objectSchema(['type'], {
      type: assetSlotOwnerTypeSchema,
      id: { type: 'number' },
      client_id: clientIdSchema,
    }),
    production_id: { type: 'number' },
    creative_reference_id: { type: 'number' },
    creative_reference_state_id: { type: 'number' },
    owner_type: assetSlotOwnerTypeSchema,
    owner_id: { type: 'number' },
    name: { type: 'string' },
    kind: { enum: ['image', 'video', 'audio', 'text'] },
    description: { type: 'string' },
    slot_key: { type: 'string' },
    prompt_hint: { type: 'string' },
    priority: { type: 'string' },
    status: { type: 'string' },
    resource_id: { type: 'number' },
    locked_asset_slot_id: { type: 'number' },
    metadata_json: { type: 'string' },
  }),
}

const projectPromptRuleSchema = objectSchema(['key', 'label', 'value'], {
  id: { type: 'string' },
  key: { type: 'string', minLength: 1 },
  label: { type: 'string', minLength: 1 },
  category: { type: 'string' },
  value: { type: 'string', minLength: 1 },
  prompt_role: { enum: ['context', 'style', 'constraint', 'negative', 'quality_gate'] },
  enabled: { type: 'boolean' },
  required: { type: 'boolean' },
  order: { type: 'number' },
})

export const projectStandardsProposalSchema = {
  id: 'movscript.project_standards_proposal.v1',
  kind: 'project_standards_proposal',
  category: 'project',
  scope: 'project',
  title: 'Project Standards Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'proposal'], {
    schema: { const: 'movscript.project_standards_proposal.v1' },
    scope: { const: 'project_standards_proposal' },
    mode: proposalModeSchema,
    snapshot_base: { type: 'object' },
    proposal: objectSchema([], {
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
          custom_rules: { type: 'array', items: projectPromptRuleSchema },
        },
      },
    }),
    impact_notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.project_standards_proposal.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.project_standards_proposal.v1", scope: "project_standards_proposal", mode: "snapshot", proposal: { project_style: { aspect_ratio?, shot_size_system?, camera_language?, visual_style?, lighting_style?, color_palette?, pacing_rules?, negative_rules?, custom_rules?: Array<{ id?, key, label, category?, value, prompt_role?, enabled?, required?, order? }> } }, snapshot_base?, impact_notes?: string[], summary? }',
    '',
    'Rules:',
    '- Project standards proposal owns project-wide production standards: shot sizes, aspect ratio, camera language, style, lighting, color, pacing, and negative rules.',
    '- Keep the fixed project_style fields for required baseline standards; use custom_rules for additional project-wide prompt rules from any angle.',
    '- custom_rules entries are key/value prompt rules. key must be stable, value must be concrete, and prompt_role must be one of context, style, constraint, negative, quality_gate.',
    '- Project standards proposal must not include setting lists or asset slot lists. Use setting_proposal and asset_proposal for those.',
    '- Vague style words need concrete visible traits or must be recorded in impact_notes.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.project_standards_proposal.v1',
      scope: 'project_standards_proposal',
      mode: 'snapshot',
      proposal: {
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: ['wide', 'medium', 'close-up', 'insert'],
          visual_style: 'Clean vertical drama realism with readable product and prop details.',
          negative_rules: ['No unreadable dark scenes', 'No arbitrary character face changes'],
          custom_rules: [{
            key: 'character_consistency',
            label: 'Character consistency',
            category: 'Character',
            value: 'Keep the lead character age, hairstyle, wardrobe silhouette, and face identity consistent across all generated shots.',
            prompt_role: 'constraint',
            enabled: true,
            required: false,
            order: 10,
          }],
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
  jsonSchema: objectSchema(['schema', 'scope', 'proposal'], {
    schema: { const: 'movscript.setting_proposal.v1' },
    scope: { const: 'setting_proposal' },
    mode: proposalModeSchema,
    snapshot_base: { type: 'object' },
    proposal: objectSchema([], {
      creative_references: projectLayerProposalCreativeReferencesSchema,
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
    '{ schema: "movscript.setting_proposal.v1", scope: "setting_proposal", mode: "snapshot", proposal: { creative_references?: Array<{ id?, client_id?, name, kind?, description?, status?, merge_candidates? }>, asset_slots?: [] }, snapshot_base?, impact_notes?: string, summary? }',
    '',
    'Rules:',
    '- Setting proposals only create, update, merge, or retire creative_references.',
    '- Do not include asset_slots, candidate image plans, prompts, generation jobs, or generated resources.',
    '- Draft content is an editable backend snapshot. Existing rows keep backend id; new rows use client_id only until apply returns a canonical snapshot with backend ids.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.setting_proposal.v1',
      scope: 'setting_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [{
          client_id: 'ref-hero',
          name: 'Main character',
          description: 'A reserved young engineer.',
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
  jsonSchema: objectSchema(['schema', 'mode', 'productionId', 'proposalScope', 'proposal'], {
    schema: { const: 'movscript.production_proposal.v1' },
    mode: { const: 'snapshot' },
    snapshot_base: { type: 'object' },
    productionId: { type: 'number' },
    proposalScope: { const: 'production' },
    proposal: objectSchema(['segments'], {
      segments: {
        type: 'array',
        items: objectSchema(['title', 'scene_moments'], {
          id: { type: 'number' },
          client_id: clientIdSchema,
          kind: { type: 'string' },
          summary: { type: 'string' },
          order: { type: 'number' },
          status: { type: 'string' },
          script_block_id: { type: 'number' },
          title: { type: 'string' },
          scene_moments: {
            type: 'array',
            items: objectSchema(['title'], {
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
              script_block_id: { type: 'number' },
              content_units: {
                type: 'array',
                items: objectSchema(['title', 'kind'], {
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  title: { type: 'string' },
                  kind: { type: 'string' },
                  description: { type: 'string' },
                  shot_size: { type: 'string' },
                  camera_angle: { type: 'string' },
                  duration_sec: { type: 'number' },
                  order: { type: 'number' },
                  status: { type: 'string' },
                  script_block_id: { type: 'number' },
                  keyframes: {
                    type: 'array',
                    items: objectSchema(['title'], {
                      id: { type: 'number' },
                      client_id: clientIdSchema,
                      title: { type: 'string' },
                      description: { type: 'string' },
                      prompt: { type: 'string' },
                      order: { type: 'number' },
                      status: { type: 'string' },
                    }),
                  },
                }),
              },
              keyframes: {
                type: 'array',
                items: objectSchema(['title'], {
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  title: { type: 'string' },
                  description: { type: 'string' },
                  prompt: { type: 'string' },
                  order: { type: 'number' },
                  status: { type: 'string' },
                }),
              },
              creative_references: {
                type: 'array',
                items: objectSchema(['id'], {
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  name: { type: 'string' },
                  role: { type: 'string' },
                }),
              },
              asset_slots: {
                type: 'array',
                items: objectSchema(['name', 'kind'], {
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
    '{ schema: "movscript.production_proposal.v1", mode: "snapshot", productionId: number, proposalScope: "production", proposal: { segments: Array<{ id?, client_id?, title, kind?, summary?, order?, status?, script_block_id?, scene_moments: Array<{ id?, client_id?, title, time_text?, location_text?, action_text?, mood?, description?, order?, status?, script_block_id?, content_units?: Array<{ id?, client_id?, title, kind, description?, keyframes? }>, keyframes?: Array<{ id?, client_id?, title, description?, prompt? }>, creative_references?: Array<{ id, role? }>, asset_slots?: Array<{ id?, client_id?, name, kind, description?, priority? }> }> }> }, snapshot_base?, impact_notes?: string, summary? }',
    '',
    'Rules:',
    '- productionId is required and must match the selected production.',
    '- This schema is snapshot-only. Do not use action fields.',
    '- Start from the backend seed snapshot, edit that tree, keep existing ids on retained nodes, omit nodes that should be removed, and add new nodes without ids.',
    '- Existing segments, scene_moments, content_units, keyframes, or production asset_slots omitted from the snapshot are treated as removals by backend apply.',
    '- Each scene_moment should include at least one creative_references reuse node or one asset_slots node unless the gap is intentionally explained in impact_notes.',
    '- Use creative_references with existing project-level ids; do not create project-level creative references here.',
    '- Use asset_slots for production-local material slots owned by the scene moment; do not create final media resources.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.production_proposal.v1',
      mode: 'snapshot',
      productionId: 1,
      proposalScope: 'production',
      proposal: {
        segments: [{
          client_id: 'seg-1',
          title: 'Opening tension',
          scene_moments: [{
            client_id: 'moment-1',
            title: 'Opening beat',
            creative_references: [{ id: 1, role: 'character' }],
            asset_slots: [{ client_id: 'slot-1', name: 'Opening room reference', kind: 'image' }],
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
  jsonSchema: objectSchema(['schema', 'scope', 'productionId', 'proposal'], {
    schema: { const: 'movscript.content_unit_proposal.v1' },
    scope: { const: 'content_unit_proposal' },
    productionId: { type: 'number' },
    segmentId: { type: 'number' },
    sceneMomentId: { type: 'number' },
    proposal: objectSchema(['units'], {
      units: {
        type: 'array',
        items: objectSchema(['title', 'kind', 'description'], {
          title: { type: 'string' },
          kind: { enum: ['shot', 'visual_segment', 'caption_card', 'narration', 'transition', 'music_beat', 'product_showcase'] },
          description: { type: 'string' },
          prompt: { type: 'string' },
          duration_sec: { type: 'number' },
          story_purpose: { type: 'string' },
          emotional_intent: { type: 'string' },
          shot: objectSchema([], {
            shot_size: { type: 'string' },
            camera_angle: { type: 'string' },
            camera_movement: { type: 'string' },
            lens: { type: 'string' },
            focus: { type: 'string' },
            composition: { type: 'string' },
          }),
          performance: { type: 'string' },
          lighting: { type: 'string' },
          blocking: { type: 'string' },
          sound: { type: 'string' },
          transition: { type: 'string' },
        }),
      },
    }),
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.content_unit_proposal.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.content_unit_proposal.v1", scope: "content_unit_proposal", productionId: number, segmentId?, sceneMomentId?, proposal: { units: Array<{ title, kind, description, prompt?, duration_sec?, story_purpose?, emotional_intent?, shot?: { shot_size?, camera_angle?, camera_movement?, lens?, focus?, composition? }, performance?, lighting?, blocking?, sound?, transition? }> }, summary? }',
    '',
    'Rules:',
    '- This is a snapshot proposal: proposal.units is the complete proposed content-unit snapshot for the selected scene moment.',
    '- Do not include operation fields; proposal.units must be the complete target snapshot, and review computes differences separately.',
    '- Propose 3-6 focused content units for the selected scene moment or explicit production/segment anchor.',
    '- Use kind to define the content unit role. For kind="shot", use the nested shot object only for camera/framing parameters; do not model Shot as a separate proposal entity.',
    '- For visual content units, include concrete camera parameters, actor performance details, lighting, blocking, sound, transition, and duration when useful.',
    '- Avoid duplicates and vague adjectives without visible production detail.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.content_unit_proposal.v1',
      scope: 'content_unit_proposal',
      productionId: 1,
      proposal: {
        units: [{
          title: 'Reveal shot',
          kind: 'shot',
          description: 'A close reveal of the object.',
          shot: { shot_size: 'close-up', camera_angle: 'eye-level', camera_movement: 'slow push-in' },
          lighting: 'Soft key from screen left with low fill.',
        }],
      },
    },
  }],
} satisfies DraftSchemaDefinition

export const assetProposalSchema = {
  id: 'movscript.asset_proposal.v1',
  kind: 'asset_proposal',
  category: 'asset',
  scope: 'project',
  title: 'Asset Proposal',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'proposal'], {
    schema: { const: 'movscript.asset_proposal.v1' },
    scope: { const: 'asset_proposal' },
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
      asset_slots: projectLayerProposalAssetSlotsSchema,
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
    '{ schema: "movscript.asset_proposal.v1", scope: "asset_proposal", mode: "snapshot", proposal: { creative_references?: [], asset_slots?: Array<{ id?, client_id?, owner?: { type, id? }, name, kind, description?, priority?, status? }>, candidate_plans?: Array<{ output_kind, prompt, input_resource_ids?, acceptance_criteria?, risks? }> }, assetSlotId?, slot?, context?, snapshot_base?, impact_notes?: string, summary?, next_actions? }',
    '',
    'Rules:',
    '- Asset proposal is the single draft kind for project asset slots and per-slot candidate planning.',
    '- Use proposal.asset_slots to create, update, reassign, waive, or retire asset slot requirements.',
    '- Asset slot entries are editable backend snapshot rows. Put name/kind/description/priority directly on asset_slots[] entries.',
    '- Put ownership in owner, for example { type: "scene_moment", id: 7 } or { type: "creative_reference", id: 1 }. owner.client_id is only valid inside a same-request bundle where that local reference is also created.',
    '- Asset proposals must not create isolated assets. For character, location, prop, world-rule, or style-reference material, cite an existing creative_reference backend id through owner, candidate plan references, or context. If the needed setting does not exist, create/update a setting_proposal first and make the asset proposal depend on that setting.',
    '- Use proposal.candidate_plans only after an asset slot exists or is explicitly selected.',
    '- Do not include creative reference edits, generation jobs, or generated resource bindings.',
  ].join('\n'),
  examples: [{
    name: 'asset-slot-requirement',
    content: {
      schema: 'movscript.asset_proposal.v1',
      scope: 'asset_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [],
        asset_slots: [{
          client_id: 'asset-portrait',
          owner: { type: 'creative_reference', id: 1 },
          name: 'Character portrait',
          kind: 'image',
        }],
        candidate_plans: [],
      },
      summary: 'Adds one owned portrait requirement.',
    },
  }, {
    name: 'candidate-plan',
    content: {
      schema: 'movscript.asset_proposal.v1',
      scope: 'asset_proposal',
      mode: 'snapshot',
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
  [projectStandardsProposalSchema.id]: projectStandardsProposalSchema,
  [productionProposalSchema.id]: productionProposalSchema,
  [contentUnitProposalSchema.id]: contentUnitProposalSchema,
  [assetProposalSchema.id]: assetProposalSchema,
  [scriptSplitProposalSchema.id]: scriptSplitProposalSchema,
} as const satisfies Record<string, DraftSchemaDefinition>

export const DRAFT_CONTENT_SCHEMA_IDS = {
  settingProposal: settingProposalSchema.id,
  projectStandardsProposal: projectStandardsProposalSchema.id,
  productionProposal: productionProposalSchema.id,
  contentUnitProposal: contentUnitProposalSchema.id,
  assetProposal: assetProposalSchema.id,
  scriptSplit: scriptSplitProposalSchema.id,
} as const

export const DRAFT_SCHEMA_IDS = Object.keys(DRAFT_SCHEMA_REGISTRY)
export type DraftSchemaKey = keyof typeof DRAFT_SCHEMA_REGISTRY

export const DRAFT_SCOPES = {
  settingProposal: settingProposalSchema.kind,
  projectStandardsProposal: projectStandardsProposalSchema.kind,
  productionProposal: productionProposalSchema.kind,
  contentUnitProposal: contentUnitProposalSchema.kind,
  assetProposal: assetProposalSchema.kind,
  scriptSplit: scriptSplitProposalSchema.kind,
} as const

export const DRAFT_KIND_VALUES = [
  'setting_proposal',
  'script_split_proposal',
  'script',
  'asset_slot',
  'content_unit',
  'prompt',
  'note',
  'pipeline',
  'segment',
  'scene_moment',
  'asset_proposal',
  'project_standards_proposal',
  'production_proposal',
  'content_unit_proposal',
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

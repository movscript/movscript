import type { WorkspaceKind, WorkspaceSchemaDefinition } from './types.js'

function objectSchema(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required,
    properties,
  }
}

const clientIdSchema = { type: 'string', minLength: 1 }
const workspaceModeSchema = { const: 'snapshot' }
const nullableNumberSchema = { type: ['number', 'null'] }
const assetSlotOwnerTypeSchema = {
  enum: ['creative_reference', 'creative_reference_state', 'segment', 'scene_moment', 'content_unit', 'keyframe'],
}
const projectLayerWorkspaceCreativeReferencesSchema = {
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
const projectLayerWorkspaceAssetSlotsSchema = {
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

export const projectStandardsWorkspaceSchema = {
  id: 'movscript.project_standards_workspace.v1',
  kind: 'project_standards_workspace',
  category: 'project',
  scope: 'project',
  title: 'Project Standards Workspace',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'workspace'], {
    schema: { const: 'movscript.project_standards_workspace.v1' },
    scope: { const: 'project_standards_workspace' },
    mode: workspaceModeSchema,
    workspace: objectSchema([], {
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
    '# movscript.project_standards_workspace.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.project_standards_workspace.v1", scope: "project_standards_workspace", mode: "snapshot", workspace: { project_style: { aspect_ratio?, shot_size_system?: string[], camera_language?, visual_style?, lighting_style?, color_palette?, pacing_rules?, negative_rules?: string[], custom_rules?: Array<{ id?, key, label, category?, value, prompt_role?, enabled?, required?, order? }> } }, impact_notes?: string[], summary? }',
    '',
    'Rules:',
    '- Project standards workspace owns project-wide production standards: shot sizes, aspect ratio, camera language, style, lighting, color, pacing, and negative rules.',
    '- shot_size_system and negative_rules must be arrays of strings. Do not use object arrays for shot_size_system; put detailed shot descriptions into each string item.',
    '- Keep the fixed project_style fields for required baseline standards; use custom_rules for additional project-wide prompt rules from any angle.',
    '- custom_rules entries are key/value prompt rules. key must be stable, value must be concrete, and prompt_role must be one of context, style, constraint, negative, quality_gate.',
    '- Style reference images are allowed through custom_rules instead of a separate field: create an enabled rule with prompt_role="style" and a value that names the backend resource ids, such as "Style reference images: resource#12, resource#34; use these only for visual style, texture, palette, line quality, and lighting continuity." Do not embed image bytes in project_style.',
    '- When later generating image or video assets, resource ids from style-reference custom_rules should be passed to generation tools as reference_resource_ids when the tool supports references.',
    '- Project standards workspace must not include setting lists or asset slot lists. Use setting_workspace and asset_workspace for those.',
    '- Vague style words need concrete visible traits or must be recorded in impact_notes.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.project_standards_workspace.v1',
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      workspace: {
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
          }, {
            key: 'style_reference_images',
            label: 'Style reference images',
            category: 'Visual style',
            value: 'Style reference images: resource#12, resource#34. Use them only for visual style, texture, palette, line quality, and lighting continuity.',
            prompt_role: 'style',
            enabled: true,
            required: false,
            order: 20,
          }],
        },
      },
      summary: 'Defines project-wide production standards.',
    },
  }],
} satisfies WorkspaceSchemaDefinition

export const settingWorkspaceSchema = {
  id: 'movscript.setting_workspace.v1',
  kind: 'setting_workspace',
  category: 'project',
  scope: 'project',
  title: 'Setting Workspace',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'workspace'], {
    schema: { const: 'movscript.setting_workspace.v1' },
    scope: { const: 'setting_workspace' },
    mode: workspaceModeSchema,
    workspace: objectSchema([], {
      creative_references: projectLayerWorkspaceCreativeReferencesSchema,
    }),
    impact_notes: { type: 'string' },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.setting_workspace.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.setting_workspace.v1", scope: "setting_workspace", mode: "snapshot", workspace: { creative_references?: Array<{ id?, client_id?, name, kind?, description?, status?, merge_candidates? }> }, impact_notes?: string, summary? }',
    '',
    'Rules:',
    '- Setting workspaces only create, update, merge, or retire creative_references.',
    '- Do not include material requirements, candidate image plans, prompts, generation jobs, or generated resources.',
    '- Workspace content is an editable backend snapshot in workspace.creative_references. Existing rows keep backend id; new rows use client_id only until apply returns a canonical snapshot with backend ids.',
    '- workspace_create hydrates current creative references into workspace.creative_references when creating the workspace. After creation, edit workspace.creative_references directly; existing backend ids omitted from the workspace snapshot are intentional delete/retire candidates.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.setting_workspace.v1',
      scope: 'setting_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [{
          client_id: 'ref-hero',
          name: 'Main character',
          description: 'A reserved young engineer.',
        }],
      },
      summary: 'Adds one character reference.',
    },
  }],
} satisfies WorkspaceSchemaDefinition

export const productionWorkspaceSchema = {
  id: 'movscript.production_workspace.v1',
  kind: 'production_workspace',
  category: 'production',
  scope: 'production',
  title: 'Production Workspace',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'mode', 'productionId', 'workspaceScope', 'workspace'], {
    schema: { const: 'movscript.production_workspace.v1' },
    scope: { const: 'production_workspace' },
    mode: { const: 'snapshot' },
    productionId: { type: 'number' },
    workspaceScope: { const: 'production' },
    workspace: objectSchema(['segments'], {
      segments: {
        type: 'array',
        items: objectSchema(['title', 'scene_moments'], {
          id: { type: 'number' },
          client_id: clientIdSchema,
          kind: { type: 'string' },
          summary: { type: 'string' },
          order: { type: 'number' },
          status: { type: 'string' },
          script_block_id: nullableNumberSchema,
          title: { type: 'string' },
          scene_moments: {
            type: 'array',
            items: objectSchema(['title'], {
              id: { type: 'number' },
              client_id: clientIdSchema,
              scene_code: { type: 'string' },
              title: { type: 'string' },
              time_text: { type: 'string' },
              location_text: { type: 'string' },
              action_text: { type: 'string' },
              mood: { type: 'string' },
              description: { type: 'string' },
              order: { type: 'number' },
              status: { type: 'string' },
              script_block_id: nullableNumberSchema,
              creative_references: {
                type: 'array',
                items: objectSchema(['id'], {
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  name: { type: 'string' },
                  role: { type: 'string' },
                }),
              },
              writing_expressions: {
                type: 'array',
                items: objectSchema(['kind', 'text'], {
                  id: { type: 'number' },
                  client_id: clientIdSchema,
                  kind: { enum: ['dialogue', 'action', 'narration', 'subtitle', 'visual'] },
                  speaker: { type: 'string' },
                  text: { type: 'string' },
                  note: { type: 'string' },
                  intent: { type: 'string' },
                  order: { type: 'number' },
                  script_block_id: nullableNumberSchema,
                }),
              },
            }),
          },
        }),
      },
    }),
    impact_notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.production_workspace.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.production_workspace.v1", scope: "production_workspace", mode: "snapshot", productionId: number, workspaceScope: "production", workspace: { segments: Array<{ id?, client_id?, title, kind?, summary?, order?, status?, script_block_id?: number|null, scene_moments: Array<{ id?, client_id?, scene_code?, title, time_text?, location_text?, action_text?, mood?, description?, order?, status?, script_block_id?: number|null, creative_references?: Array<{ id, role? }>, writing_expressions?: Array<{ id?, client_id?, kind: "dialogue"|"action"|"narration"|"subtitle"|"visual", speaker?, text, note?, intent?, order?, script_block_id?: number|null }> }> }> }, impact_notes?: string[], summary? }',
    '',
    'Rules:',
    '- productionId is required and must match the selected production.',
    '- This schema is snapshot-only. Do not use action fields.',
    '- Start from the backend seed snapshot, edit that tree, keep existing ids on retained nodes, omit nodes that should be removed, and add new nodes without ids.',
    '- Existing segments, scene_moments, creative reference usages, or writing_expressions omitted from the snapshot are treated as removals by backend apply.',
    '- Preserve existing scene_code when present; leave it blank on new nodes unless you have a user-specified production identifier, because the backend assigns stable forward-only identifiers.',
    '- Each scene_moment should include at least one creative_references reuse node unless the gap is intentionally explained in impact_notes.',
    '- Use creative_references with existing project-level ids; do not create project-level creative references here.',
    '- Use writing_expressions for dialogue, action, narration, subtitle, and visual expression lines inside the scene moment.',
    '- Do not create content_units, keyframes, asset_slots, final media resources, or media generation jobs here; hand those gaps to content_unit_workspace or asset_workspace.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.production_workspace.v1',
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 1,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          client_id: 'seg-1',
          title: 'Opening tension',
          scene_moments: [{
            client_id: 'moment-1',
            title: 'Opening beat',
            creative_references: [{ id: 1, role: 'character' }],
            writing_expressions: [{ client_id: 'expr-1', kind: 'action', speaker: 'Scene', text: 'The protagonist waits at the old doorway.' }],
          }],
        }],
      },
      impact_notes: [],
    },
  }],
} satisfies WorkspaceSchemaDefinition

export const contentUnitWorkspaceSchema = {
  id: 'movscript.content_unit_workspace.v1',
  kind: 'content_unit_workspace',
  category: 'content_unit',
  scope: 'content_unit',
  title: 'Content Unit Workspace',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'productionId', 'workspace'], {
    schema: { const: 'movscript.content_unit_workspace.v1' },
    scope: { const: 'content_unit_workspace' },
    productionId: { type: 'number' },
    segmentId: { type: 'number' },
    sceneMomentId: { type: 'number' },
    workspace: objectSchema(['units'], {
      units: {
        type: 'array',
        items: objectSchema(['title', 'kind', 'description'], {
          unit_code: { type: 'string' },
          title: { type: 'string' },
          kind: { enum: ['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'] },
          description: { type: 'string' },
          prompt: { type: 'string' },
          duration_sec: { type: 'number' },
          story_purpose: { type: 'string' },
          emotional_intent: { type: 'string' },
          timing: objectSchema([], {
            local_start_sec: { type: 'number' },
            rhythm_role: { type: 'string' },
            transition_in: { type: 'string' },
            transition_out: { type: 'string' },
          }),
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
          visual_plan: objectSchema([], {
            space: { type: 'string' },
            blocking: { type: 'string' },
            camera_path: { type: 'string' },
            beats: { type: 'array', items: { type: 'string' } },
            props: { type: 'array', items: { type: 'string' } },
            lighting: { type: 'string' },
            risks: { type: 'array', items: { type: 'string' } },
          }),
          storyboard_brief: objectSchema([], {
            purpose: { type: 'string' },
            subject: { type: 'string' },
            composition: { type: 'string' },
            action_moment: { type: 'string' },
            emotion: { type: 'string' },
            keyframe_suggestions: { type: 'array', items: { type: 'string' } },
          }),
          sound: { type: 'string' },
          transition: { type: 'string' },
        }),
      },
    }),
    summary: { type: 'string' },
  }),
  promptSummary: [
    '# movscript.content_unit_workspace.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.content_unit_workspace.v1", scope: "content_unit_workspace", productionId: number, segmentId?, sceneMomentId?, workspace: { units: Array<{ unit_code?, title, kind: "shot"|"voiceover"|"dialogue_audio"|"sound"|"music_beat"|"subtitle"|"caption_card"|"transition", description, prompt?, duration_sec?, story_purpose?, emotional_intent?, timing?: { local_start_sec?, rhythm_role?, transition_in?, transition_out? }, shot?: { shot_size?, camera_angle?, camera_movement?, lens?, focus?, composition? }, performance?, lighting?, blocking?, visual_plan?: { space?, blocking?, camera_path?, beats?: string[], props?: string[], lighting?, risks?: string[] }, storyboard_brief?: { purpose?, subject?, composition?, action_moment?, emotion?, keyframe_suggestions?: string[] }, sound?, transition? }> }, summary? }',
    '',
    'Rules:',
    '- This is a snapshot workspace: workspace.units is the complete proposed content-unit snapshot for the selected scene moment.',
    '- Content unit workspaces may include local timing intent, but they do not own production preview_timeline or preview_timeline_items.',
    '- Do not include operation fields; workspace.units must be the complete target snapshot, and review computes differences separately.',
    '- Propose 3-6 focused content units for the selected scene moment or explicit production/segment anchor.',
    '- Preserve existing unit_code when present; leave unit_code blank on new units unless the user explicitly specified a production identifier.',
    '- Use kind only for the production timeline output lane: shot, voiceover, dialogue_audio, sound, music_beat, subtitle, caption_card, or transition.',
    '- For kind="shot", use the nested shot object only for camera/framing parameters; do not model Shot as a separate workspace entity.',
    '- For shot units, include concrete camera parameters, actor performance details, lighting, blocking, sound, transition, and duration when useful.',
    '- For selected visual production units, use visual_plan for spatial/camera/blocking detail and storyboard_brief for image purpose/composition/action/keyframe suggestions; these are planning metadata, not generated media.',
    '- Avoid duplicates and vague adjectives without visible production detail.',
  ].join('\n'),
  examples: [{
    name: 'basic',
    content: {
      schema: 'movscript.content_unit_workspace.v1',
      scope: 'content_unit_workspace',
      productionId: 1,
      workspace: {
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
} satisfies WorkspaceSchemaDefinition

export const assetWorkspaceSchema = {
  id: 'movscript.asset_workspace.v1',
  kind: 'asset_workspace',
  category: 'asset',
  scope: 'project',
  title: 'Asset Workspace',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'scope', 'workspace'], {
    schema: { const: 'movscript.asset_workspace.v1' },
    scope: { const: 'asset_workspace' },
    mode: workspaceModeSchema,
    projectId: { type: 'number' },
    assetSlotId: { type: ['number', 'string'] },
    slot: objectSchema([], { id: { type: ['number', 'string'] }, name: { type: 'string' }, kind: { type: 'string' } }),
    context: { type: 'object' },
    workspace: objectSchema([], {
      creative_references: {
        type: 'array',
        maxItems: 0,
        description: 'Asset workspaces never edit settings.',
      },
      asset_slots: projectLayerWorkspaceAssetSlotsSchema,
      candidate_plans: {
        type: 'array',
        items: objectSchema(['output_kind', 'prompt'], {
          client_id: clientIdSchema,
          output_kind: { enum: ['image', 'video', 'audio', 'text', 'file'] },
          prompt: { type: 'string' },
          negative_prompt: { type: 'string' },
          aspect_ratio: { type: 'string' },
          duration: { type: 'number' },
          model_capability: { enum: ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v', 'audio_tts', 'audio_transcribe', 'subtitle_align', 'render_video'] },
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
    '# movscript.asset_workspace.v1',
    '',
    'Content shape:',
    '{ schema: "movscript.asset_workspace.v1", scope: "asset_workspace", mode: "snapshot", workspace: { creative_references?: [], asset_slots?: Array<{ id?, client_id?, owner?: { type, id? }, name, kind, description?, slot_key?, prompt_hint?, priority?, status? }>, candidate_plans?: Array<{ output_kind, prompt, input_resource_ids?, acceptance_criteria?, risks? }> }, assetSlotId?, slot?, context?, impact_notes?: string, summary?, next_actions? }',
    '',
    'Rules:',
    '- Asset workspace is the single workspace kind for project asset slots and per-slot candidate planning.',
    '- Use workspace.asset_slots to create, update, reassign, waive, or retire asset slot requirements.',
    '- Asset slot entries are editable backend snapshot rows. Put name/kind/description/priority directly on asset_slots[] entries.',
    '- workspace.asset_slots is the complete desired snapshot. workspace_create hydrates current asset slots into workspace.asset_slots when creating the workspace; after creation, edit workspace.asset_slots directly.',
    '- Existing backend asset slot ids omitted from workspace.asset_slots are intentional delete/retire candidates.',
    '- Do not generate, renumber, replace, or reorder existing asset slot ids. Only brand-new asset slots that were not present in the workspace/base snapshot may omit id or receive a new id according to system rules.',
    '- Put ownership in owner, for example { type: "scene_moment", id: 7 } or { type: "creative_reference", id: 1 }. owner.client_id is only valid inside a same-request bundle where that local reference is also created.',
    '- Asset workspaces must not create isolated assets. For character, location, prop, world-rule, or style-reference material, cite an existing creative_reference backend id through owner, candidate plan references, or context. If the needed setting does not exist, create/update a setting_workspace first and make the asset workspace depend on that setting.',
    '- Core characters, main scenes, core props, and style references must get canonical/base asset slots before derived looks, states, keyframes, or video references are planned as usable generation targets.',
    '- Derived asset candidates must cite the accepted/locked canonical resource or be marked as blocked/waiting_for_base_asset in risks, acceptance_criteria, or next_actions.',
    '- When asset_workspace receives scene/location/space creative_references from setting_workspace or backend settings, extract a required top-down floor-plan asset slot for each scene setting. The slot should be kind="image", owner.type="creative_reference", owner.id=<scene reference id>, and use a stable slot_key such as "top_down_floor_plan".',
    '- The scene top-down floor-plan asset slot is for later director blocking annotations: prompt_hint should ask for a readable 2D top-down plan with space boundaries, zones, entries/exits, initial character positions, key props, occluders, light/dark areas, and no-go zones. It should not describe a single shot camera move.',
    '- Use workspace.candidate_plans only after an asset slot exists or is explicitly selected.',
    '- Do not include creative reference edits, generation jobs, or generated resource bindings.',
  ].join('\n'),
  examples: [{
    name: 'asset-slot-requirement',
    content: {
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [],
        asset_slots: [{
          client_id: 'asset-scene-top-down',
          owner: { type: 'creative_reference', id: 1 },
          name: 'Opening room top-down floor plan',
          kind: 'image',
          slot_key: 'top_down_floor_plan',
          prompt_hint: 'Readable 2D top-down plan for director blocking: room boundary, zones, entries/exits, initial character positions, key props, occluders, light/dark areas, and no-go zones.',
        }],
        candidate_plans: [],
      },
      summary: 'Adds one scene top-down floor-plan requirement.',
    },
  }, {
    name: 'candidate-plan',
    content: {
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      assetSlotId: 1,
      slot: { id: 1, name: 'Hero portrait', kind: 'image' },
      workspace: {
        creative_references: [],
        asset_slots: [],
        candidate_plans: [{
          output_kind: 'image',
          prompt: 'Create a clean 2D top-down floor plan for the selected scene setting. Show space boundaries, zones, entries/exits, character starting marks, key props, occluders, light/dark areas, and no-go zones for later director blocking annotations.',
          input_resource_ids: [],
          acceptance_criteria: ['Readable as a top-down director blocking plan.', 'Includes positions for characters, props, entries, occluders, and light zones.'],
        }],
      },
    },
  }],
} satisfies WorkspaceSchemaDefinition

export const WORKSPACE_SCHEMA_REGISTRY = {
  [settingWorkspaceSchema.id]: settingWorkspaceSchema,
  [projectStandardsWorkspaceSchema.id]: projectStandardsWorkspaceSchema,
  [productionWorkspaceSchema.id]: productionWorkspaceSchema,
  [contentUnitWorkspaceSchema.id]: contentUnitWorkspaceSchema,
  [assetWorkspaceSchema.id]: assetWorkspaceSchema,
} as const satisfies Record<string, WorkspaceSchemaDefinition>

export const WORKSPACE_CONTENT_SCHEMA_IDS = {
  settingWorkspace: settingWorkspaceSchema.id,
  projectStandardsWorkspace: projectStandardsWorkspaceSchema.id,
  productionWorkspace: productionWorkspaceSchema.id,
  contentUnitWorkspace: contentUnitWorkspaceSchema.id,
  assetWorkspace: assetWorkspaceSchema.id,
} as const

export const WORKSPACE_SCHEMA_IDS = Object.keys(WORKSPACE_SCHEMA_REGISTRY)
export type WorkspaceSchemaKey = keyof typeof WORKSPACE_SCHEMA_REGISTRY

export const WORKSPACE_SCOPES = {
  settingWorkspace: settingWorkspaceSchema.kind,
  projectStandardsWorkspace: projectStandardsWorkspaceSchema.kind,
  productionWorkspace: productionWorkspaceSchema.kind,
  contentUnitWorkspace: contentUnitWorkspaceSchema.kind,
  assetWorkspace: assetWorkspaceSchema.kind,
} as const

export const WORKSPACE_KIND_VALUES = [
  'setting_workspace',
  'project_standards_workspace',
  'production_workspace',
  'content_unit_workspace',
  'asset_workspace',
] as const satisfies readonly WorkspaceKind[]

export type WorkspaceKindValue = typeof WORKSPACE_KIND_VALUES[number]

export function getWorkspaceSchemaEntry(schemaId: string): WorkspaceSchemaDefinition | null {
  return WORKSPACE_SCHEMA_REGISTRY[schemaId] ?? null
}

export function listSchemasByKind(kind: WorkspaceKind): WorkspaceSchemaDefinition[] {
  return Object.values(WORKSPACE_SCHEMA_REGISTRY)
    .filter((schema) => schema.kind === kind)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

export function getActiveSchemaForKind(kind: WorkspaceKind): WorkspaceSchemaDefinition {
  const active = listSchemasByKind(kind).filter((schema) => schema.status === 'active')
  if (active.length === 0) throw new Error(`No active workspace schema for kind: ${kind}`)
  return active[0]
}

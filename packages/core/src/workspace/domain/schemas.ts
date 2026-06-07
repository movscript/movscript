import type { SemanticEntityKind, SemanticEntitySchemaDefinition, WorkspaceKind } from './schemaTypes.js'

function objectSchema(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required,
    properties,
  }
}

function entitySchema(
  entityKind: SemanticEntityKind,
  required: string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return objectSchema(['schema', 'kind', 'id', ...required], {
    schema: { const: `movscript.${entityKind}.v1` },
    kind: { const: entityKind },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    description: { type: 'string' },
    order: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    ...properties,
  })
}

function strictObjectSchema(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  }
}

const sourceRefSchema = { type: 'string', minLength: 1 }
const candidateSchema = objectSchema(['id'], {
  id: { type: 'string', minLength: 1 },
  resource_id: sourceRefSchema,
  source: { enum: ['generated', 'uploaded', 'imported', 'derived', 'manual'] },
  notes: { type: 'string' },
  metadata: { type: 'object', additionalProperties: true },
})
const lockSchema = objectSchema([], {
  candidate_id: { type: 'string', minLength: 1 },
  resource_id: sourceRefSchema,
  reason: { type: 'string' },
})

export const projectEntitySchema = {
  id: 'movscript.project.v1',
  entityKind: 'project',
  title: 'Project',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('project', ['title'], {
    project_kind: { type: 'string' },
    logline: { type: 'string' },
    language: { type: 'string' },
  }),
  promptSummary: 'Project is the root business boundary for a complete local film workspace.',
  examples: [{
    name: 'demo',
    content: { schema: 'movscript.project.v1', kind: 'project', id: 'project_demo', title: 'Demo' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const projectStandardsEntitySchema = {
  id: 'movscript.project_standards.v1',
  entityKind: 'project_standards',
  title: 'Project Standards',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('project_standards', [], {
    aspect_ratio: { type: 'string' },
    shot_size_system: { type: 'array', items: { type: 'string' } },
    camera_language: { type: 'string' },
    visual_style: { type: 'string' },
    lighting_style: { type: 'string' },
    color_palette: { type: 'string' },
    pacing_rules: { type: 'string' },
    negative_rules: { type: 'array', items: { type: 'string' } },
    custom_rules: { type: 'array', items: { type: 'object', additionalProperties: true } },
  }),
  promptSummary: 'Project standards define project-wide production, visual, camera, lighting, pacing, and prompt constraints.',
  examples: [{
    name: 'vertical_drama',
    content: {
      schema: 'movscript.project_standards.v1',
      kind: 'project_standards',
      id: 'project_standards_main',
      aspect_ratio: '9:16',
      shot_size_system: ['wide', 'medium', 'close_up', 'insert'],
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const settingEntitySchema = {
  id: 'movscript.setting.v1',
  entityKind: 'setting',
  title: 'Setting',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('setting', ['title'], {
    setting_kind: { enum: ['character', 'location', 'prop', 'world_rule', 'style', 'other'] },
    profile: { type: 'object', additionalProperties: true },
  }),
  promptSummary: 'Setting is a reusable character, location, prop, world rule, or style fact. Assets belong under a setting or setting state.',
  examples: [{
    name: 'hero',
    content: { schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_hero', setting_kind: 'character', title: 'Hero' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const settingStateEntitySchema = {
  id: 'movscript.setting_state.v1',
  entityKind: 'setting_state',
  title: 'Setting State',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('setting_state', ['title'], {
    state_kind: { type: 'string' },
    changes: { type: 'object', additionalProperties: true },
  }),
  promptSummary: 'Setting state is a contextual state variant of a setting, such as wet hair, damaged prop, or rainy location.',
  examples: [{
    name: 'rain_panic',
    content: { schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'setting_state_rain_panic', title: 'Rain panic' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const assetEntitySchema = {
  id: 'movscript.asset.v1',
  entityKind: 'asset',
  title: 'Asset',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('asset', ['slot'], {
    slot: { type: 'string', minLength: 1 },
    asset_kind: { enum: ['image', 'video', 'audio', 'text', 'reference', 'other'] },
    prompt_hint: { type: 'string' },
    candidates: { type: 'array', items: candidateSchema },
    lock: lockSchema,
  }),
  promptSummary: 'Asset is a setting-owned or setting-state-owned resource slot. Candidate and lock data stays inline in asset.json.',
  examples: [{
    name: 'portrait',
    content: { schema: 'movscript.asset.v1', kind: 'asset', id: 'asset_base_portrait', slot: 'character_base_portrait', candidates: [] },
  }],
} satisfies SemanticEntitySchemaDefinition

export const scriptEntitySchema = {
  id: 'movscript.script.v1',
  entityKind: 'script',
  title: 'Script',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('script', ['title'], {
    script_kind: { type: 'string' },
    source_ref: { type: 'string' },
    content: { type: 'string' },
  }),
  promptSummary: 'Script is a screenplay or source text root. Script and production are parallel workspaces and can reference each other.',
  examples: [{
    name: 'main',
    content: { schema: 'movscript.script.v1', kind: 'script', id: 'script_main', title: 'Main Script' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const scriptVersionEntitySchema = {
  id: 'movscript.script_version.v1',
  entityKind: 'script_version',
  title: 'Script Version',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('script_version', ['title'], {
    version_label: { type: 'string' },
    source_ref: { type: 'string' },
  }),
  promptSummary: 'Script version is a versioned script snapshot and can own script blocks.',
  examples: [{
    name: 'v1',
    content: { schema: 'movscript.script_version.v1', kind: 'script_version', id: 'script_version_v1', title: 'V1' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const scriptBlockEntitySchema = {
  id: 'movscript.script_block.v1',
  entityKind: 'script_block',
  title: 'Script Block',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('script_block', ['text'], {
    block_kind: { type: 'string' },
    text: { type: 'string', minLength: 1 },
    source_range: { type: 'object', additionalProperties: true },
  }),
  promptSummary: 'Script block is an addressable block of script text referenced by planning entities.',
  examples: [{
    name: 'opening',
    content: { schema: 'movscript.script_block.v1', kind: 'script_block', id: 'script_block_1', text: 'INT. APARTMENT - NIGHT' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const productionEntitySchema = {
  id: 'movscript.production.v1',
  entityKind: 'production',
  title: 'Production',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('production', ['title'], {
    production_kind: { type: 'string' },
  }),
  promptSummary: 'Production is a makeable video unit. It owns ordered segment planning structure.',
  examples: [{
    name: 'episode',
    content: { schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const segmentEntitySchema = {
  id: 'movscript.segment.v1',
  entityKind: 'segment',
  title: 'Segment',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('segment', ['title', 'order'], {
    segment_kind: { enum: ['emotional_function', 'rhythm_shift', 'dramatic_function', 'setup', 'escalation', 'release', 'reversal', 'transition'] },
    emotional_intent: { type: 'string' },
    rhythm: { type: 'string' },
  }),
  promptSummary: 'Segment is a rhythm section inside a production. Directory id is stable; order lives in segment.json.',
  examples: [{
    name: 'opening',
    content: { schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening pressure', order: 1 },
  }],
} satisfies SemanticEntitySchemaDefinition

export const sceneMomentEntitySchema = {
  id: 'movscript.scene_moment.v1',
  entityKind: 'scene_moment',
  title: 'Scene Moment',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('scene_moment', ['title', 'order'], {
    when: { type: 'string' },
    where: { type: 'string' },
    action: { type: 'string' },
    emotion: { type: 'string' },
    active_storyboard_id: { type: 'string' },
    storyboard_timing: objectSchema([], {
      items: {
        type: 'array',
        items: objectSchema(['storyboard_id', 'order'], {
          storyboard_id: { type: 'string', minLength: 1 },
          order: { type: 'number' },
          gap_after_sec: { type: 'number' },
          caption: { type: 'string' },
        }),
      },
      audio: objectSchema([], {
        note: { type: 'string' },
        music: { type: 'string' },
        sound_effects: { type: 'array', items: { type: 'string' } },
      }),
      transition: objectSchema([], {
        in: { type: 'string' },
        out: { type: 'string' },
        notes: { type: 'string' },
      }),
    }),
  }),
  promptSummary: 'Scene moment is planning context. storyboard_timing orders storyboards; audio and transition live at scene moment timing level.',
  examples: [{
    name: 'call',
    content: {
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_r72k',
      title: 'Hero hears the unknown call',
      order: 1,
      active_storyboard_id: 'storyboard_main',
      storyboard_timing: {
        items: [{ storyboard_id: 'storyboard_main', order: 1 }],
        audio: { note: 'Rain is low; phone vibration is prominent.' },
        transition: { out: 'hold_then_cut' },
      },
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const storyboardEntitySchema = {
  id: 'movscript.storyboard.v1',
  entityKind: 'storyboard',
  title: 'Storyboard',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('storyboard', [], {
    setting_refs: {
      type: 'array',
      items: objectSchema(['setting_id'], {
        setting_id: sourceRefSchema,
        setting_state_id: sourceRefSchema,
        role: { type: 'string' },
        notes: { type: 'string' },
      }),
    },
    shot_plans: {
      type: 'array',
      items: objectSchema(['id', 'order'], {
        id: { type: 'string', minLength: 1 },
        order: { type: 'number' },
        shot_size: { type: 'string' },
        camera: { type: 'object', additionalProperties: true },
        blocking: { type: 'object', additionalProperties: true },
        lighting: { type: 'object', additionalProperties: true },
        performance: { type: 'array', items: { type: 'object', additionalProperties: true } },
        reference_image_refs: { type: 'array', items: sourceRefSchema },
      }),
    },
    coverage_plan: { type: 'object', additionalProperties: true },
    continuity: { type: 'object', additionalProperties: true },
    storyboard_panels: { type: 'array', items: { type: 'object', additionalProperties: true } },
  }),
  promptSummary: 'Storyboard is planning-only: setting refs, ordered shot plans, camera/blocking/lighting/performance planning, coverage, continuity, and optional panels. It does not reference content units.',
  examples: [{
    name: 'main',
    content: {
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'storyboard_main',
      title: 'Rain call storyboard',
      setting_refs: [{ setting_id: 'setting_hero', setting_state_id: 'setting_state_rain_panic', role: 'subject' }],
      shot_plans: [{ id: 'shot_plan_1', order: 1, shot_size: 'close_up', camera: { movement: 'slow_push_in' } }],
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const writingExpressionEntitySchema = {
  id: 'movscript.writing_expression.v1',
  entityKind: 'writing_expression',
  title: 'Writing Expression',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('writing_expression', ['expression_kind', 'text'], {
    expression_kind: { enum: ['dialogue', 'narration', 'subtitle', 'caption', 'action', 'visual_note'] },
    speaker: { type: 'string' },
    text: { type: 'string', minLength: 1 },
    intent: { type: 'string' },
    target_ref: { type: 'string' },
  }),
  promptSummary: 'Writing expression is a storyboard-level text expression. It is independent from shot_plans order.',
  examples: [{
    name: 'caption',
    content: { schema: 'movscript.writing_expression.v1', kind: 'writing_expression', id: 'writing_expression_1', expression_kind: 'caption', text: 'Unknown number lights up again.' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const contentUnitEntitySchema = {
  id: 'movscript.content_unit.v1',
  entityKind: 'content_unit',
  title: 'Content Unit',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('content_unit', ['unit_kind', 'title', 'source_context'], {
    unit_kind: { enum: ['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'] },
    source_context: strictObjectSchema(['scene_moment_ref', 'storyboard_ref'], {
      scene_moment_ref: sourceRefSchema,
      storyboard_ref: sourceRefSchema,
    }),
    editable_prompt: objectSchema([], {
      prompt: { type: 'string' },
      negative_prompt: { type: 'string' },
      notes: { type: 'string' },
    }),
    generation_constraints: { type: 'object', additionalProperties: true },
    candidates: { type: 'array', items: candidateSchema },
    lock: lockSchema,
  }),
  promptSummary: 'Content unit is a project-level stable production unit. It references scene moment/storyboard and owns editable source prompt, candidates, and lock.',
  examples: [{
    name: 'shot',
    content: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Hero watches the vibrating phone',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
      },
      editable_prompt: { prompt: 'Cold phone light on frightened face.' },
      candidates: [],
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const keyframeEntitySchema = {
  id: 'movscript.keyframe.v1',
  entityKind: 'keyframe',
  title: 'Keyframe',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('keyframe', [], {
    visual_intent: { type: 'string' },
    reference_asset_refs: { type: 'array', items: sourceRefSchema },
    candidates: { type: 'array', items: candidateSchema },
    lock: lockSchema,
  }),
  promptSummary: 'Keyframe is a visual anchor. Scene-level, content-unit-level, and future shot-level keyframes use the same schema.',
  examples: [{
    name: 'anchor',
    content: {
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_c83x',
      title: 'Phone light close-up',
      visual_intent: 'Phone blue light illuminates the hero face in a rainy apartment.',
      candidates: [],
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const SEMANTIC_ENTITY_SCHEMA_REGISTRY = {
  [projectEntitySchema.id]: projectEntitySchema,
  [projectStandardsEntitySchema.id]: projectStandardsEntitySchema,
  [settingEntitySchema.id]: settingEntitySchema,
  [settingStateEntitySchema.id]: settingStateEntitySchema,
  [assetEntitySchema.id]: assetEntitySchema,
  [scriptEntitySchema.id]: scriptEntitySchema,
  [scriptVersionEntitySchema.id]: scriptVersionEntitySchema,
  [scriptBlockEntitySchema.id]: scriptBlockEntitySchema,
  [productionEntitySchema.id]: productionEntitySchema,
  [segmentEntitySchema.id]: segmentEntitySchema,
  [sceneMomentEntitySchema.id]: sceneMomentEntitySchema,
  [storyboardEntitySchema.id]: storyboardEntitySchema,
  [writingExpressionEntitySchema.id]: writingExpressionEntitySchema,
  [contentUnitEntitySchema.id]: contentUnitEntitySchema,
  [keyframeEntitySchema.id]: keyframeEntitySchema,
} as const satisfies Record<string, SemanticEntitySchemaDefinition>

export const SEMANTIC_ENTITY_SCHEMA_IDS = Object.keys(SEMANTIC_ENTITY_SCHEMA_REGISTRY)
export type SemanticEntitySchemaKey = keyof typeof SEMANTIC_ENTITY_SCHEMA_REGISTRY

export const WORKSPACE_KIND_VALUES = [
  'project_workspace',
  'project_standards_workspace',
  'setting_workspace',
  'setting_state_workspace',
  'asset_workspace',
  'script_workspace',
  'script_version_workspace',
  'script_block_workspace',
  'production_workspace',
  'segment_workspace',
  'scene_moment_workspace',
  'storyboard_workspace',
  'writing_expression_workspace',
  'content_unit_workspace',
  'keyframe_workspace',
] as const satisfies readonly WorkspaceKind[]

export const SEMANTIC_ENTITY_KIND_VALUES = [
  'project',
  'project_standards',
  'setting',
  'setting_state',
  'asset',
  'script',
  'script_version',
  'script_block',
  'production',
  'segment',
  'scene_moment',
  'storyboard',
  'writing_expression',
  'content_unit',
  'keyframe',
] as const satisfies readonly SemanticEntityKind[]

export type WorkspaceKindValue = typeof WORKSPACE_KIND_VALUES[number]
export type SemanticEntityKindValue = typeof SEMANTIC_ENTITY_KIND_VALUES[number]

export function getSemanticEntitySchemaEntry(schemaId: string): SemanticEntitySchemaDefinition | null {
  return SEMANTIC_ENTITY_SCHEMA_REGISTRY[schemaId] ?? null
}

export function listSemanticEntitySchemasByKind(entityKind: SemanticEntityKind): SemanticEntitySchemaDefinition[] {
  return Object.values(SEMANTIC_ENTITY_SCHEMA_REGISTRY)
    .filter((schema) => schema.entityKind === entityKind)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

export function getActiveSemanticEntitySchemaForKind(entityKind: SemanticEntityKind): SemanticEntitySchemaDefinition {
  const active = listSemanticEntitySchemasByKind(entityKind).filter((schema) => schema.status === 'active')
  if (active.length === 0) throw new Error(`No active semantic entity schema for kind: ${entityKind}`)
  return active[0]
}

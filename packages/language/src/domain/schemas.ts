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
const transitionSchema = objectSchema([], {
  in: { type: 'string' },
  out: { type: 'string' },
  notes: { type: 'string' },
})

export const projectEntitySchema = {
  id: 'movscript.project.v1',
  entityKind: 'project',
  title: 'Project',
  version: '1.0.0',
  status: 'active',
  jsonSchema: objectSchema(['schema', 'kind', 'project_id', 'title'], {
    schema: { const: 'movscript.project.v1' },
    kind: { const: 'project' },
    project_id: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    description: { type: 'string' },
    project_kind: { type: 'string' },
    logline: { type: 'string' },
    language: { type: 'string' },
  }),
  promptSummary: 'Project is the root business boundary for a complete local film workspace.',
  examples: [{
    title: 'demo',
    content: { schema: 'movscript.project.v1', kind: 'project', project_id: 'demo', title: 'Demo' },
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
    title: 'vertical_drama',
    content: {
      schema: 'movscript.project_standards.v1',
      kind: 'project_standards',
      id: 'project_standards',
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
  promptSummary: 'Setting is a reusable character, location, prop, world rule, or style fact. Assets belong under setting states.',
  examples: [{
    title: 'hero',
    content: { schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Hero' },
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
    title: 'rain_panic',
    content: { schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'rain_panic', title: 'Rain panic' },
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
  }),
  promptSummary: 'Asset is a setting-state-owned resource slot. Runtime candidates and production decisions are stored outside asset.json.',
  examples: [{
    title: 'portrait',
    content: { schema: 'movscript.asset.v1', kind: 'asset', id: 'base_portrait', slot: 'character_base_portrait' },
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
    title: 'main',
    content: { schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script' },
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
    title: 'v1',
    content: { schema: 'movscript.script_version.v1', kind: 'script_version', id: 'v1', title: 'V1' },
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
    title: 'opening',
    content: { schema: 'movscript.script_block.v1', kind: 'script_block', id: 'opening', text: 'INT. APARTMENT - NIGHT' },
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
    transition: transitionSchema,
  }),
  promptSummary: 'Production is a makeable video unit. It owns ordered segment planning structure and production-level transition boundaries.',
  examples: [{
    title: 'episode',
    content: { schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' },
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
    transition: transitionSchema,
  }),
  promptSummary: 'Segment is a rhythm section inside a production. Directory id is stable; order and segment-level transition boundaries live in segment.json.',
  examples: [{
    title: 'opening',
    content: { schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening pressure', order: 1 },
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
    transition: transitionSchema,
  }),
  promptSummary: 'Scene moment is planning context. It owns only scene-level transition boundaries; storyboard ordering lives on storyboard entities and audio cues are independent objects.',
  examples: [{
    title: 'call',
    content: {
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Hero hears the unknown call',
      order: 1,
      transition: { out: 'hold_then_cut' },
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const shotEntitySchema = {
  id: 'movscript.shot.v1',
  entityKind: 'shot',
  title: 'Shot',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('shot', ['title', 'order'], {
    shot_kind: { enum: ['establishing', 'coverage', 'close_up', 'insert', 'reaction', 'transition', 'other'] },
    scene_moment_ref: sourceRefSchema,
    script_block_id: sourceRefSchema,
    shot_size: { type: 'string' },
    camera: { type: 'object', additionalProperties: true },
    blocking: { type: 'object', additionalProperties: true },
    lighting: { type: 'object', additionalProperties: true },
    performance: { type: 'array', items: { type: 'object', additionalProperties: true } },
    sound: { type: 'object', additionalProperties: true },
    expression: { type: 'object', additionalProperties: true },
    timing: objectSchema([], {
      start: { type: 'string' },
      end: { type: 'string' },
      duration_sec: { type: 'number' },
      gap_after_sec: { type: 'number' },
    }),
    transition: transitionSchema,
    reference_asset_refs: { type: 'array', items: sourceRefSchema },
  }),
  promptSummary: 'Shot is the makeable camera unit inside a scene moment. It carries shot order, camera, blocking, lighting, performance, sound/expression notes, timing, transitions, and refs used by storyboard graphs.',
  examples: [{
    title: 'phone_close_up',
    content: {
      schema: 'movscript.shot.v1',
      kind: 'shot',
      id: 'phone_close_up',
      title: 'Phone light close-up',
      order: 1,
      shot_size: 'close_up',
      camera: { movement: 'slow_push_in' },
      timing: { duration_sec: 4 },
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
    asset_kind: { enum: ['image', 'video', 'reference', 'other'] },
    slot: { type: 'string', minLength: 1 },
    shot_ref: sourceRefSchema,
    transition: transitionSchema,
    timeline: objectSchema([], {
      gap_after_sec: { type: 'number' },
      caption: { type: 'string' },
      duration_sec: { type: 'number' },
    }),
    graph: objectSchema([], {
      nodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
      edges: { type: 'array', items: { type: 'object', additionalProperties: true } },
      entry_node_id: { type: 'string' },
      exit_node_id: { type: 'string' },
    }),
    setting_refs: {
      type: 'array',
      items: objectSchema(['setting_id'], {
        setting_id: sourceRefSchema,
        setting_state_id: sourceRefSchema,
        role: { type: 'string' },
        notes: { type: 'string' },
      }),
    },
    coverage_plan: { type: 'object', additionalProperties: true },
    continuity: { type: 'object', additionalProperties: true },
    storyboard_panels: { type: 'array', items: { type: 'object', additionalProperties: true } },
    prompt_hint: { type: 'string' },
  }),
  promptSummary: 'Storyboard is a graph-like visual asset for a shot, similar to an asset slot: storyboard.json defines refs, graph nodes/edges, panels, prompt hints, and continuity; runtime candidates and production decisions live outside storyboard.json.',
  examples: [{
    title: 'main',
    content: {
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      title: 'Rain call storyboard',
      slot: 'main',
      asset_kind: 'video',
      order: 1,
      graph: {
        nodes: [{ id: 'phone_glow', kind: 'panel', caption: 'Phone glow returns.' }],
        edges: [],
        entry_node_id: 'phone_glow',
        exit_node_id: 'phone_glow',
      },
      timeline: { caption: 'Phone glow returns.', gap_after_sec: 0.4 },
      transition: { out: 'hold_then_cut' },
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain_panic', role: 'subject' }],
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const audioCueEntitySchema = {
  id: 'movscript.audio_cue.v1',
  entityKind: 'audio_cue',
  title: 'Audio Cue',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('audio_cue', ['cue_kind', 'title'], {
    cue_kind: { enum: ['sound_effect', 'music', 'ambience', 'dialogue', 'foley', 'other'] },
    scope_ref: sourceRefSchema,
    shot_ref: sourceRefSchema,
    storyboard_ref: sourceRefSchema,
    timing: objectSchema([], {
      start: { type: 'string' },
      end: { type: 'string' },
      offset_sec: { type: 'number' },
      duration_sec: { type: 'number' },
    }),
    prompt_hint: { type: 'string' },
    asset_refs: { type: 'array', items: sourceRefSchema },
  }),
  promptSummary: 'Audio cue is an independent planning object for sound effects, music, ambience, dialogue cues, or foley. It can attach to a scene moment, shot, or storyboard through refs.',
  examples: [{
    title: 'phone_vibration',
    content: {
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      scope_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main',
      timing: { start: 'after_action', duration_sec: 1.2 },
      prompt_hint: 'Low, sharp phone vibration under rain ambience.',
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const expressionUnitEntitySchema = {
  id: 'movscript.expression_unit.v1',
  entityKind: 'expression_unit',
  title: 'Expression Unit',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('expression_unit', ['expression_kind', 'text'], {
    expression_kind: { enum: ['dialogue', 'narration', 'subtitle', 'caption', 'action', 'visual_note'] },
    speaker: { type: 'string' },
    text: { type: 'string', minLength: 1 },
    intent: { type: 'string' },
    span: objectSchema([], {
      storyboard_refs: { type: 'array', items: sourceRefSchema },
      from_storyboard_id: { type: 'string' },
      to_storyboard_id: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
    }),
    script_block_id: sourceRefSchema,
  }),
  promptSummary: 'Expression unit is a scene-moment-owned semantic expression. It can span multiple storyboards without belonging to one storyboard.',
  examples: [{
    title: 'dialogue_span',
    content: {
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'line_001',
      expression_kind: 'dialogue',
      speaker: 'hero',
      text: 'You finally came.',
      span: { from_storyboard_id: 'shot_01', to_storyboard_id: 'shot_03' },
    },
  }],
} satisfies SemanticEntitySchemaDefinition

export const contentUnitEntitySchema = {
  id: 'movscript.content_unit.v1',
  entityKind: 'content_unit',
  title: 'Content Unit',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('content_unit', ['content_unit_type', 'output_kind', 'title'], {
    content_unit_type: { type: 'string', minLength: 1 },
    output_kind: { enum: ['image', 'video', 'audio', 'text', 'metadata'] },
    edit_prompt: objectSchema([], {
      text: { type: 'string' },
      negative_text: { type: 'string' },
      notes: { type: 'string' },
      structured: { type: 'object', additionalProperties: true },
    }),
    model_intent: objectSchema([], {
      capability: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      quality: { type: 'string' },
      duration_sec: { type: 'number' },
      aspect_ratio: { type: 'string' },
      params: { type: 'object', additionalProperties: true },
    }),
  }),
  promptSummary: 'Content unit is a project-level stable prompt entity. It declares content_unit_type, output_kind, structured target refs such as shot_ref or asset_ref, edit_prompt, and model_intent. References written inside edit_prompt with {{type:id}} syntax are upstream inputs. Candidates copy the normalized prompt snapshot at generation time; selections and runtime candidates are stored outside content_unit.json.',
  examples: [{
    title: 'shot_ref',
    content: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_shot',
      content_unit_type: 'shot_ref',
      output_kind: 'video',
      title: 'Hero watches the vibrating phone',
      shot_ref: 'phone',
      edit_prompt: { text: 'Generate the phone shot using selected storyboard {{storyboard:main}}.' },
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
    scene_moment_ref: sourceRefSchema,
    shot_ref: sourceRefSchema,
    storyboard_ref: sourceRefSchema,
    role: { type: 'string' },
    visual_intent: { type: 'string' },
    timing: { type: 'object', additionalProperties: true },
    composition: { type: 'object', additionalProperties: true },
    continuity: { type: 'object', additionalProperties: true },
    reference_asset_refs: { type: 'array', items: sourceRefSchema },
    reference_keyframe_refs: { type: 'array', items: sourceRefSchema },
  }),
  promptSummary: 'Keyframe is a shot-owned visual anchor for prompt engineering. It describes timing, composition, continuity, visual intent, and reference assets. Runtime candidates and production decisions are stored outside keyframe.json.',
  examples: [{
    title: 'anchor',
    content: {
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
      title: 'Phone light close-up',
      visual_intent: 'Phone blue light illuminates the hero face in a rainy apartment.',
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
  [shotEntitySchema.id]: shotEntitySchema,
  [storyboardEntitySchema.id]: storyboardEntitySchema,
  [audioCueEntitySchema.id]: audioCueEntitySchema,
  [expressionUnitEntitySchema.id]: expressionUnitEntitySchema,
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
  'shot_workspace',
  'storyboard_workspace',
  'audio_cue_workspace',
  'expression_unit_workspace',
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
  'shot',
  'storyboard',
  'audio_cue',
  'expression_unit',
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
  const schema = active[0]
  if (!schema) throw new Error(`No active semantic entity schema for kind: ${entityKind}`)
  return schema
}

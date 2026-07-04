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
    timeline_template: {
      enum: ['film', 'series', 'short_video', 'course'],
      description: 'Optional default timeline namespace template. It is a creation/planning hint, not an instance parent tree.',
    },
    timeline_namespaces: {
      type: 'array',
      description: 'Project-owned timeline namespace vocabulary, such as series, season, episode, act, sequence, beat.',
      items: { type: 'string', minLength: 1 },
    },
    setting_namespaces: {
      type: 'array',
      description: 'Project-owned setting namespace vocabulary, such as character, costume, state, or voice_state.',
      items: { type: 'string', minLength: 1 },
    },
    namespace_vocabulary: objectSchema([], {
      timeline_template: {
        enum: ['film', 'series', 'short_video', 'course'],
        description: 'Optional default timeline namespace template. It suggests creation flow but never owns concrete parent relations.',
      },
      timeline_namespaces: { type: 'array', items: { type: 'string', minLength: 1 } },
      setting_namespaces: { type: 'array', items: { type: 'string', minLength: 1 } },
    }),
    logline: { type: 'string' },
    language: { type: 'string' },
  }),
  promptSummary: 'Project is the root business boundary for a complete local film workspace. It may declare namespace vocabulary and templates for UI and agent planning, but concrete parent/containment still comes from source paths or validated explicit refs.',
  examples: [{
    title: 'series_demo',
    content: {
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'demo',
      title: 'Demo Series',
      namespace_vocabulary: {
        timeline_template: 'series',
        timeline_namespaces: ['episode', 'act', 'beat'],
        setting_namespaces: ['character', 'costume', 'state'],
      },
    },
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
    namespace_kind: { type: 'string', description: 'Project vocabulary label for this setting namespace node, such as character, location, prop, costume, or voice_identity.' },
    setting_namespace_kind: { type: 'string', description: 'Alias of namespace_kind for setting namespace vocabulary.' },
    setting_kind: { enum: ['character', 'location', 'prop', 'world_rule', 'style', 'other'] },
    profile: { type: 'object', additionalProperties: true },
  }),
  promptSummary: 'Setting is a concrete setting namespace root for a reusable film/music entity, such as a character, prop, place, instrument, costume, or voice identity. It is not a content-unit target and must not own content-unit refs; assets belong under setting states.',
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
    namespace_kind: { type: 'string', description: 'Project vocabulary label for this setting-state namespace node, such as base_state, costume_state, emotion_state, or voice_state.' },
    setting_namespace_kind: { type: 'string', description: 'Alias of namespace_kind for setting namespace vocabulary.' },
    state_kind: { type: 'string' },
    changes: { type: 'object', additionalProperties: true },
  }),
  promptSummary: 'Setting state is a namespace under one setting for a named condition/version of that entity, such as base look, wet hair, damaged prop, side-view variant, or calm voice. It is not a content-unit target and must not own content-unit refs.',
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
    setting_id: { type: 'string', description: 'Concrete setting id. Usually derived from the source path.' },
    setting_state_id: { type: 'string', description: 'Owning setting_state id. Usually derived from the source path.' },
    slot: { type: 'string', minLength: 1 },
    asset_kind: { enum: ['image', 'video', 'audio', 'text', 'reference', 'other'] },
    prompt_hint: { type: 'string' },
    resource_id: { type: ['string', 'number'], description: 'Optional selected stable RawResource reference for imported/manual assets. Generated asset candidates should be selected through an asset_ref content unit instead.' },
    asset_ref_content_unit_id: { type: 'string', description: 'Optional pointer to the asset_ref content unit that carries generated candidates for this asset.' },
    provider_certifications: {
      type: 'object',
      description: 'Provider material-library certification records keyed by provider, such as seedance2. Certifications bind to the selected asset_ref RawResource, not the abstract setting.',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
        properties: {
          status: { enum: ['active', 'processing', 'failed', 'stale', 'unknown'] },
          hub_asset_id: { type: 'string' },
          asset_uri: { type: 'string' },
          source_resource_id: { type: ['string', 'number'] },
          source_candidate_id: { type: ['string', 'number'] },
          source_hash: { type: 'string' },
          certified_at: { type: 'string' },
          updated_at: { type: 'string' },
          error: { type: ['string', 'object', 'null'], additionalProperties: true },
        },
      },
    },
    candidates: {
      type: 'array',
      deprecated: true,
      description: 'Legacy inline candidate storage only. Do not create new asset candidates here; use an asset_ref content unit and backend content-unit candidate decisions.',
      items: { type: 'object', additionalProperties: true },
    },
    selection: {
      type: 'object',
      deprecated: true,
      description: 'Legacy inline asset selection only. New generated asset selections belong to the asset_ref content unit candidate decision flow.',
      additionalProperties: true,
    },
  }),
  promptSummary: 'Asset is a setting-state-owned resource slot and a carrier for asset_ref content-unit generation/review. Do not write new candidates or selections into asset.json; generated asset candidates belong to the linked asset_ref content unit and backend content-unit decision flow. Provider material-library certifications, when present, bind to the selected asset_ref resource and should be marked stale if that selected resource changes. Image assets should prefer plain white or very clean backgrounds.',
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
    namespace_kind: { type: 'string', description: 'Project vocabulary label for this timeline namespace node, such as film, episode, act, sequence, or beat.' },
    timeline_namespace_kind: { type: 'string', description: 'Alias of namespace_kind for timeline namespace vocabulary.' },
    production_kind: { type: 'string' },
    transition: transitionSchema,
  }),
  promptSummary: 'Production is a timeline namespace source record. It contributes path-derived containment, context, and transition boundaries, but it is not directly generated. Production-level playback and editing belong in a production editing workspace.',
  examples: [{
    title: 'episode',
    content: { schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1', namespace_kind: 'episode' },
  }],
} satisfies SemanticEntitySchemaDefinition

export const segmentEntitySchema = {
  id: 'movscript.segment.v1',
  entityKind: 'segment',
  title: 'Segment',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('segment', ['title', 'order'], {
    namespace_kind: { type: 'string', description: 'Project vocabulary label for this timeline namespace node, such as act, sequence, beat, hook, lesson, or segment.' },
    timeline_namespace_kind: { type: 'string', description: 'Alias of namespace_kind for timeline namespace vocabulary.' },
    segment_kind: { enum: ['emotional_function', 'rhythm_shift', 'dramatic_function', 'setup', 'escalation', 'release', 'reversal', 'transition'] },
    emotional_intent: { type: 'string' },
    rhythm: { type: 'string' },
    transition: transitionSchema,
  }),
  promptSummary: 'Segment is a timeline namespace node inside the path tree. Directory id and path parent define containment; namespace_kind names the user-facing layer. It is not directly generated; use scene_moment, expression_unit, or primitive-scoped content units for production work.',
  examples: [{
    title: 'opening',
    content: { schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening pressure', namespace_kind: 'beat', order: 1 },
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

export const storyboardEntitySchema = {
  id: 'movscript.storyboard.v1',
  entityKind: 'storyboard',
  title: 'Storyboard',
  version: '1.0.0',
  status: 'active',
  jsonSchema: entitySchema('storyboard', [], {
    asset_kind: { enum: ['image', 'video', 'reference', 'other'] },
    slot: { type: 'string', minLength: 1 },
    scene_moment_ref: sourceRefSchema,
    expression_unit_ref: sourceRefSchema,
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
  promptSummary: 'Storyboard is a graph-like visual asset for a scene moment or expression unit, similar to an asset slot: storyboard.json defines refs, graph nodes/edges, panels, prompt hints, and continuity; runtime candidates and production decisions live outside storyboard.json.',
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
    expression_unit_ref: sourceRefSchema,
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
  promptSummary: 'Audio cue is an independent planning object for sound effects, music, ambience, dialogue cues, or foley. It can attach to a scene moment, expression unit, or storyboard through refs.',
  examples: [{
    title: 'phone_vibration',
    content: {
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      scope_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/eu_phone_closeup/storyboards/main',
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
  jsonSchema: entitySchema('expression_unit', [], {
    slot_kind: { enum: ['visual', 'voice', 'subtitle', 'audio'] },
    modality: { enum: ['visual', 'verbal', 'audio', 'text', 'interaction', 'metadata'] },
    role: { type: 'string', minLength: 1 },
    expression_kind: { enum: ['dialogue', 'narration', 'subtitle', 'caption', 'action', 'visual_note', 'shot'] },
    visual_kind: { type: 'string' },
    speaker: { type: 'string' },
    speaker_ref: sourceRefSchema,
    source_expression_ref: sourceRefSchema,
    text: { type: 'string', minLength: 1 },
    intent: { type: 'string' },
    content: { type: 'object', additionalProperties: true },
    timing_intent: { type: 'object', additionalProperties: true },
    voice_profile_ref: sourceRefSchema,
    span: objectSchema([], {
      storyboard_refs: { type: 'array', items: sourceRefSchema },
      expression_refs: { type: 'array', items: sourceRefSchema },
      from_storyboard_id: { type: 'string' },
      to_storyboard_id: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
    }),
    script_block_id: sourceRefSchema,
  }),
  promptSummary: 'Expression unit is the smallest form/edit slot under a scene moment. Use slot_kind=visual|voice|subtitle|audio for new records; legacy modality, role, and expression_kind fields remain compatibility hints. Content units target expression_unit_ref and declare the generated output_kind.',
  examples: [{
    title: 'visual_shot_material',
    content: {
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'eu_phone_closeup',
      slot_kind: 'visual',
      modality: 'visual',
      role: 'shot',
      title: 'Phone close-up',
      intent: 'Phone lights up again while the hero freezes.',
      content: {
        shot_size: 'close_up',
        camera: { movement: 'slow_push_in' },
      },
      timing_intent: { duration_sec: 2.4 },
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
    target_category: { enum: ['system_primitive', 'content_unit'] },
    target_kind: {
      enum: ['production', 'segment', 'scene_moment', 'expression_unit', 'asset', 'keyframe', 'storyboard', 'audio_cue', 'content_unit'],
      description: 'Use production/segment only with specialized production_ref or segment_ref content units; use system primitives or content_unit for regular generation targets.',
    },
    target_ref: sourceRefSchema,
    scope_kind: { type: 'string' },
    scope_ref: sourceRefSchema,
    generation_role: { type: 'string' },
    production_ref: sourceRefSchema,
    segment_ref: sourceRefSchema,
    asset_ref: sourceRefSchema,
    keyframe_ref: sourceRefSchema,
    storyboard_ref: sourceRefSchema,
    audio_cue_ref: sourceRefSchema,
    scene_moment_ref: sourceRefSchema,
    expression_unit_ref: sourceRefSchema,
    content_unit_ref: sourceRefSchema,
    voice_profile_ref: sourceRefSchema,
    edit_prompt: objectSchema([], {
      text: { type: 'string' },
      negative_text: { type: 'string' },
      notes: { type: 'string' },
      structured: { type: 'object', additionalProperties: true },
    }),
    generation_references: {
      type: 'array',
      items: objectSchema([], {
        id: { type: 'string' },
        kind: { type: 'string' },
        ref: sourceRefSchema,
        raw: { type: 'string' },
        resource_id: { type: 'number' },
        media_type: { type: 'string' },
        role: { type: 'string' },
        source_ref: { type: 'string' },
        label: { type: 'string' },
        source: { type: 'string' },
      }),
      description: 'Independent generation reference pool. Prompt @ refs may only refer to entries already listed here; entries are passed to generation as typed reference assets even when unused in edit_prompt text.',
    },
    reference_assets: {
      type: 'array',
      items: objectSchema([], {
        role: { type: 'string' },
        media_type: { type: 'string' },
        resource_id: { type: 'number' },
        source_ref: { type: 'string' },
      }),
      description: 'Compatibility direct typed resource references for generation. Prefer generation_references when the source is semantic rather than a raw resource.',
    },
    model_intent: objectSchema([], {
      capability: { type: 'string' },
      operation: { type: 'string' },
      target_output: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      quality: { type: 'string' },
      duration_sec: { type: 'number' },
      aspect_ratio: { type: 'string' },
      params: { type: 'object', additionalProperties: true },
    }),
  }),
  promptSummary: 'Content unit is a project-level stable generation task. It targets a specialized production/segment ref, a system primitive such as scene_moment, expression_unit, asset, keyframe, storyboard, or audio_cue, or another content_unit. Namespace-level freeform playback belongs in a production editing workspace rather than a content unit. generation_references is the independent input/reference fact source for model calls; edit_prompt {{type:id}} or @ resource mentions are text-level references that may only point at entries already in that reference pool. Candidates copy the normalized prompt snapshot at generation time; selections and runtime candidates are stored outside content_unit.json.',
  examples: [{
    title: 'expression_visual_material',
    content: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_phone_visual',
      content_unit_type: 'expression_unit_ref',
      output_kind: 'video',
      target_kind: 'expression_unit',
      target_ref: 'eu_phone_closeup',
      generation_role: 'visual_material',
      title: 'Phone close-up visual material',
      edit_prompt: { text: 'Generate this visual expression material with selected references.' },
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
    expression_unit_ref: sourceRefSchema,
    storyboard_ref: sourceRefSchema,
    role: { type: 'string' },
    visual_intent: { type: 'string' },
    timing: { type: 'object', additionalProperties: true },
    composition: { type: 'object', additionalProperties: true },
    continuity: { type: 'object', additionalProperties: true },
    reference_asset_refs: { type: 'array', items: sourceRefSchema },
    reference_keyframe_refs: { type: 'array', items: sourceRefSchema },
  }),
  promptSummary: 'Keyframe is a visual anchor for a scene moment or expression unit. It describes timing, composition, continuity, visual intent, and reference assets. Runtime candidates and production decisions are stored outside keyframe.json.',
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

import type { MCPJSONValue, MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const workspaceLocator = {
  workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  projectId: { type: ['string', 'number'], description: 'Required project id for project-scoped domain tools. MCP never infers project from session, cwd, route, or focus.' },
  project_id: { type: ['string', 'number'], description: 'Alias for projectId.' },
}

const entityQuery = {
  ...workspaceLocator,
  entityKind: { type: 'string', description: 'Optional semantic entity kind, for example setting, production, scene_moment, content_unit, or keyframe.' },
  entity_kind: { type: 'string', description: 'Alias for entityKind.' },
  kind: { type: 'string' },
  query: { type: 'string' },
  q: { type: 'string', description: 'Alias for query.' },
  productionId: { type: ['string', 'number'] },
  production_id: { type: ['string', 'number'] },
  segmentId: { type: ['string', 'number'] },
  segment_id: { type: ['string', 'number'] },
  sceneMomentId: { type: ['string', 'number'] },
  scene_moment_id: { type: ['string', 'number'] },
  shotId: { type: ['string', 'number'] },
  shot_id: { type: ['string', 'number'] },
  storyboardId: { type: ['string', 'number'] },
  storyboard_id: { type: ['string', 'number'] },
  contentUnitId: { type: ['string', 'number'] },
  content_unit_id: { type: ['string', 'number'] },
  settingId: { type: ['string', 'number'] },
  setting_id: { type: ['string', 'number'] },
  settingStateId: { type: ['string', 'number'] },
  setting_state_id: { type: ['string', 'number'] },
  limit: { type: 'number' },
}

export function domainTools(): MCPTool[] {
  return [
    {
      name: 'domain_get_model',
      description: 'Return the movscript-lang workspace model for one editable domain entity: concept, editable source paths, context paths, schema ids, supported write APIs, and agent instructions. Call this before direct file edits. This is project-scoped and does not write files.',
      inputSchema: projectSchema(
        {
          ...workspaceLocator,
          entityKind: { type: 'string', description: 'Domain entity kind, for example setting, asset, production, storyboard, content_unit, or keyframe.' },
          entity_kind: { type: 'string', description: 'Alias for entityKind.' },
          entityId: { type: ['string', 'number'], description: 'Optional entity id used to expand editable path hints.' },
          entity_id: { type: ['string', 'number'], description: 'Alias for entityId.' },
        },
        ['entityKind']
      ),
    },
    {
      name: 'domain_query_entities',
      description: 'Query indexed MovScript domain entities from source/current indexes by entity kind, ids, path context, or free text. Use this before reading many files.',
      inputSchema: projectSchema(entityQuery),
    },
    {
      name: 'domain_query_settings',
      description: 'Query MovScript setting domain entities such as characters, locations, props, world rules, and styles.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        settingId: { type: ['string', 'number'] },
        setting_id: { type: ['string', 'number'] },
        kind: { type: 'string' },
        query: { type: 'string' },
        q: { type: 'string' },
        limit: { type: 'number' },
      }),
    },
    {
      name: 'domain_query_assets',
      description: 'Query MovScript setting-owned and setting-state-owned asset slots, optionally including inline candidates.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        assetId: { type: ['string', 'number'] },
        asset_id: { type: ['string', 'number'] },
        settingId: { type: ['string', 'number'] },
        setting_id: { type: ['string', 'number'] },
        settingStateId: { type: ['string', 'number'] },
        setting_state_id: { type: ['string', 'number'] },
        query: { type: 'string' },
        q: { type: 'string' },
        includeCandidates: { type: 'boolean' },
        include_candidates: { type: 'boolean' },
        limit: { type: 'number' },
      }),
    },
    {
      name: 'domain_query_production_context',
      description: 'Query production planning context: productions, segments, scene moments, storyboards, audio cues, expression units, content units, and candidate-bearing production slots.',
      inputSchema: projectSchema({
        ...entityQuery,
        include: {
          type: 'array',
          items: { type: 'string', enum: ['productions', 'segments', 'scene_moments', 'storyboards', 'audio_cues', 'expression_units', 'content_units', 'keyframes'] },
        },
      }),
    },
    {
      name: 'domain_derive_content_unit_artifact',
      description: 'Derive the interpreter artifact bundle for a content unit, including runtime panel, generation prompt, dependency report, and selection validity. Use before generation or candidate selection when content-unit context may be stale.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_preview_timeline',
      description: 'Read an interpreted production preview timeline from .interpret/current. This is read-only interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_runtime_panel',
      description: 'Read an interpreted content unit runtime panel from .interpret/current. This is read-only interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_generation_prompt',
      description: 'Read an interpreted normalized content unit generation prompt from .interpret/current. This is read-only interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_input_version',
      description: 'Compatibility alias for domain_read_content_unit_generation_prompt. Reads the interpreted normalized content unit generation prompt from .interpret/current.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_dependency_report',
      description: 'Read an interpreted content unit dependency report from .interpret/current. This is read-only interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_selection_validity',
      description: 'Read an interpreted content unit selection validity report from .interpret/current. This is read-only interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_upsert_project_standards',
      description: 'Create or update project-wide creative standards in source project_standards.json. Run inspect/review and interpret after this write.',
      inputSchema: projectSchema({ ...workspaceLocator, projectStyle: { type: 'object', additionalProperties: true }, project_style: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_setting',
      description: 'Create or update a MovScript setting source entity. Put the setting data to write in required payload; record/entity are optional existing-context objects only. Prefer this API over direct file edits for setting records.',
      inputSchema: projectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }, ['payload']),
    },
    {
      name: 'domain_upsert_asset',
      description: 'Create or update a MovScript asset slot source entity under a setting or setting state. Put the asset data to write in required payload; record/entity are optional existing-context objects only. Store RawResource references by resource_id, not binaries or external URLs.',
      inputSchema: projectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }, ['payload']),
    },
    {
      name: 'domain_upsert_script',
      description: 'Create or update a script source record and script.md text. Prefer this API over hand-editing script metadata plus markdown.',
      inputSchema: projectSchema({ ...workspaceLocator, scriptId: { type: ['string', 'number'] }, script_id: { type: ['string', 'number'] }, sourceText: { type: 'string' }, source_text: { type: 'string' }, metadata: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_read_script_source',
      description: 'Read script.md source text for a script domain entity.',
      inputSchema: projectSchema({ ...workspaceLocator, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_snapshot_script_version',
      description: 'Create a script version and script blocks from a script Markdown source so downstream production entities can reference stable script blocks.',
      inputSchema: projectSchema({ ...workspaceLocator, scriptId: { type: ['string', 'number'] }, script_id: { type: ['string', 'number'] }, versionId: { type: ['string', 'number'] }, version_id: { type: ['string', 'number'] }, versionLabel: { type: 'string' }, version_label: { type: 'string' }, sourcePath: { type: 'string' }, source_path: { type: 'string' } }),
    },
    {
      name: 'domain_upsert_content_unit',
      description: 'Create or update a project-level content unit source record. Content units are independent production slots and do not become owned by storyboards through path nesting.',
      inputSchema: projectSchema({ ...workspaceLocator, unit: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_production',
      description: 'Create or update a production source record under productions/. Use this before adding segment, scene_moment, shot, keyframe, or storyboard planning structure.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, production: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_segment',
      description: 'Create or update a segment source record inside a production. Segments are rhythm or dramatic-function sections and own scene_moment children.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, segment: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_scene_moment',
      description: 'Create or update a scene_moment source record inside a segment. Scene moments describe narrative events and own shots, expression units, and audio cues.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_shot',
      description: 'Create or update a shot source record inside a scene_moment. Shots are the makeable camera units and own keyframe/storyboard source children.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, shotId: { type: ['string', 'number'] }, shot_id: { type: ['string', 'number'] }, shot: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_keyframe',
      description: 'Create or update a keyframe source entity under a shot. Keyframes are shot-owned visual anchors referenced by keyframe_ref or storyboard_ref content units.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, shotId: { type: ['string', 'number'] }, shot_id: { type: ['string', 'number'] }, keyframeId: { type: ['string', 'number'] }, keyframe_id: { type: ['string', 'number'] }, keyframe: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, shot: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_storyboard',
      description: 'Create or update a storyboard source record under production/segment/scene_moment/shot. Use this when an agent turns shot-group entries into editable MovScript storyboards before creating candidates.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        segmentId: { type: ['string', 'number'] },
        segment_id: { type: ['string', 'number'] },
        sceneMomentId: { type: ['string', 'number'] },
        scene_moment_id: { type: ['string', 'number'] },
        shotId: { type: ['string', 'number'] },
        shot_id: { type: ['string', 'number'] },
        sceneMomentTitle: { type: 'string' },
        scene_moment_title: { type: 'string' },
        segmentTitle: { type: 'string' },
        segment_title: { type: 'string' },
        storyboardId: { type: ['string', 'number'] },
        storyboard_id: { type: ['string', 'number'] },
        storyboard: { type: 'object', additionalProperties: true },
        payload: { type: 'object', additionalProperties: true },
        production: { type: 'object', additionalProperties: true },
      }),
    },
    {
      name: 'domain_upsert_audio_cue',
      description: 'Create or update an audio_cue source entity under a scene_moment. Audio cues are independent sound, music, ambience, dialogue, or foley planning objects.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, audioCueId: { type: ['string', 'number'] }, audio_cue_id: { type: ['string', 'number'] }, audioCue: { type: 'object', additionalProperties: true }, audio_cue: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_expression_unit',
      description: 'Create or update an expression_unit source entity under a scene_moment. Expression units capture dialogue, narration, subtitle, action, caption, or visual-note semantics.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, expressionUnitId: { type: ['string', 'number'] }, expression_unit_id: { type: ['string', 'number'] }, expressionUnit: { type: 'object', additionalProperties: true }, expression_unit: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_content_unit_prompt',
      description: 'Update a content unit edit_prompt source field. Run inspect/review, interpret, and regeneration planning when prompt changes may stale candidates.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, editPrompt: { type: 'object', additionalProperties: true }, edit_prompt: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_entity_transition',
      description: 'Update an entity transition boundary on the source entity that owns transition semantics.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, transition: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_storyboard_timeline',
      description: 'Update a storyboard timeline source field. Storyboard order and timing belong on storyboard timeline entities, not on generated interpreted output.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, timeline: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_append_candidate',
      description: 'Append an inline candidate to an asset, keyframe, or content unit source entity. Generated resources become domain state only after candidate/selection writes and interpret.',
      inputSchema: candidateSchema(),
    },
    {
      name: 'domain_create_content_candidate',
      description: 'Create an external content candidate record for a content unit output through the backend decision API. This does not edit workspace source files.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        source: { type: 'string' },
        status: { type: 'string' },
        producer: { type: 'object', additionalProperties: true },
        outputs: { type: 'array', items: { type: 'object', additionalProperties: true } },
        promptSnapshot: { type: 'object', additionalProperties: true },
        prompt_snapshot: { type: 'object', additionalProperties: true },
      }),
    },
    {
      name: 'domain_create_content_candidate_batch',
      description: 'Create multiple external content candidate records for content unit outputs through the backend decision API. Each item accepts the same fields as domain_create_content_candidate. Runs sequentially and returns per-item results so agents can keep partial successes.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
        continueOnError: { type: 'boolean' },
        continue_on_error: { type: 'boolean' },
      }, ['items']),
    },
    {
      name: 'domain_create_asset_slot_candidate',
      description: 'Create an asset-slot candidate using the MovScript workspace candidate service. If targetRecord carries a workspace path, this appends an inline candidate to that asset source entity.',
      inputSchema: projectSchema(candidateWriteSchema()),
    },
    {
      name: 'domain_create_keyframe_candidate',
      description: 'Create a keyframe candidate using the MovScript workspace candidate service. If keyframes are represented as content units in the active model, use the content-unit candidate flow instead.',
      inputSchema: projectSchema(candidateWriteSchema()),
    },
    {
      name: 'domain_select_content_unit_candidate',
      description: 'Select a content candidate for a content unit through the backend decision API. Selection is backend decision metadata, not a workspace source-file edit; run inspect/review/interpret when effective interpreted state must be refreshed.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        resourceId: { type: ['string', 'number'] },
        resource_id: { type: ['string', 'number'] },
        stalePolicy: { type: 'string' },
        stale_policy: { type: 'string' },
        reason: { type: 'string' },
      }),
    },
    {
      name: 'domain_select_content_unit_candidate_batch',
      description: 'Select content candidates for multiple content units through the backend decision API. Each item accepts the same fields as domain_select_content_unit_candidate. Runs sequentially and returns per-item results.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
        continueOnError: { type: 'boolean' },
        continue_on_error: { type: 'boolean' },
      }, ['items']),
    },
    {
      name: 'domain_select_candidate',
      description: 'Select and lock an inline candidate on an asset, keyframe, or content unit source entity.',
      inputSchema: candidateSchema({ candidateId: { type: 'string' }, candidate_id: { type: 'string' }, reason: { type: 'string' } }),
    },
    {
      name: 'domain_update_candidate',
      description: 'Update an inline candidate on an asset, keyframe, or content unit source entity.',
      inputSchema: candidateSchema({ candidateId: { type: 'string' }, candidate_id: { type: 'string' } }),
    },
    {
      name: 'domain_unlock_candidate',
      description: 'Remove an inline candidate lock from an asset, keyframe, or content unit source entity.',
      inputSchema: candidateSchema(),
    },
    {
      name: 'domain_delete_entity',
      description: 'Delete a MovScript domain source entity file through the workspace service. Do not delete .interpret output directly.',
      inputSchema: projectSchema({ ...workspaceLocator, entity: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_overview',
      description: 'Show MovScript source state, last successful interpreted state, pending edits, stale generated outputs, and recommended next actions.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_inspect',
      description: 'Inspect current source changes, diagnostics, and predicted impact without writing derived artifacts. Use after API writes or direct file edits.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_review',
      description: 'Review current source files by comparing them with .interpret/current. This is diagnostic only and does not make edits effective.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_interpret',
      description: 'Interpret current source files into .interpret/current, .interpret/indexes, and stable derived artifacts. Interpret must succeed before edits become current effective project state.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_regeneration_plan',
      description: 'Plan regeneration targets after interpret based on changed source entities, dependency impact, stale prompts, and stale content unit selections.',
      inputSchema: projectSchema(workspaceLocator),
    },
  ]
}

function candidateSchema(extra: Record<string, unknown> = {}): MCPTool['inputSchema'] {
  return projectSchema({
    ...workspaceLocator,
    targetPath: { type: 'string' },
    target_path: { type: 'string' },
    targetKind: { type: 'string', enum: ['asset', 'keyframe', 'content_unit'] },
    target_kind: { type: 'string', enum: ['asset', 'keyframe', 'content_unit'] },
    payload: { type: 'object', additionalProperties: true },
    lock: { type: ['boolean', 'object'], additionalProperties: true },
    nonce: { type: 'string' },
    ...extra,
  })
}

function candidateWriteSchema(): Record<string, MCPJSONValue> {
  return {
    ...workspaceLocator,
    payload: { type: 'object', additionalProperties: true },
    targetRecord: { type: 'object', additionalProperties: true },
    target_record: { type: 'object', additionalProperties: true },
    nonce: { type: 'string' },
  }
}

function projectSchema(properties: Record<string, MCPJSONValue>, required?: string[]): MCPTool['inputSchema'] {
  return objectSchema(properties, required)
}

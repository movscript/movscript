import type { MCPJSONValue, MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const workspaceLocator = {
  workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  projectId: { type: ['string', 'number'], description: 'Required project id for project-scoped domain tools. MCP never infers project from session, cwd, route, or focus.' },
  project_id: { type: ['string', 'number'], description: 'Alias for projectId.' },
}

const contentCandidateStatuses = ['queued', 'running', 'succeeded', 'failed', 'canceled', 'imported'] as const

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

const inspectOptions = {
  ...workspaceLocator,
  commit: { type: 'string', description: 'Optional git commit/ref to compare current source against. Defaults to HEAD when the workspace is in git.' },
  checkpointHash: { type: 'string', description: 'Compatibility alias for commit.' },
  checkpoint_hash: { type: 'string', description: 'Alias for checkpointHash.' },
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
      description: 'Query MovScript setting-owned and setting-state-owned asset slots. Content-unit candidates are queried through domain candidate/decision APIs.',
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
      name: 'domain_read_content_workspace',
      description: 'Return the same content-source workspace view model used by the content workbench UI. Use this to inspect the page data source, selections, candidates, production hierarchy, preview timelines, and production work plan through the project engine.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_read_content_workspace_snapshot',
      description: 'Return the raw content-source workspace snapshot before UI normalization. Use this when debugging whether source, decision, interpreted, or preview-timeline inputs match expectations.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_derive_content_unit_artifact',
      description: 'Derive the interpreter artifact bundle for a content unit, including runtime panel, generation prompt, dependency report, and selection validity. Use before generation or candidate selection when content-unit context may be stale.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_build_content_unit_backend_prompt',
      description: 'Build a backend-ready prompt for a content unit by resolving prompt refs through backend decision selections. Rewrites selected upstream resources like {{asset:id}} to [[resource::id]] and returns blockers when referenced content has not been produced or selected.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_preview_timeline',
      description: 'Read the derived production preview timeline through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_scene_moment_edit_plan',
      description: 'Read the derived scene_moment edit plan through the domain API. The plan groups selected content-unit candidates into video, voice, subtitle, audio, image, and metadata tracks for agent-driven composition.',
      inputSchema: projectSchema({ ...workspaceLocator, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_compose_scene_moment_from_edit_plan',
      description: 'Compose a scene_moment final video candidate from its derived edit plan. This domain-level tool reads selected expression/content-unit candidates, composes the video track into a new RawResource, and writes that output as a candidate on the target scene_moment content unit. Voice/subtitle/audio tracks are preserved in candidate metadata until multi-track mixing is available.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        sceneMomentId: { type: ['string', 'number'], description: 'Scene moment whose edit_plan.json supplies the selected input candidates.' },
        scene_moment_id: { type: ['string', 'number'], description: 'Alias for sceneMomentId.' },
        contentUnitId: { type: ['string', 'number'], description: 'Scene-moment output content unit that receives the composed candidate.' },
        content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
        candidateId: { type: ['string', 'number'], description: 'Optional candidate id. Defaults to a generated scene_moment_comp_* id.' },
        candidate_id: { type: ['string', 'number'], description: 'Alias for candidateId.' },
        filename: { type: 'string', description: 'Optional output MP4 filename.' },
        name: { type: 'string', description: 'Alias for filename.' },
        folder_id: { type: 'string', description: 'Optional resource library folder id for the composed video.' },
        folderId: { type: 'string', description: 'Camel-case alias for folder_id.' },
        max_video_bytes: { type: 'number', description: 'Maximum per-source video bytes for compose.' },
        maxVideoBytes: { type: 'number', description: 'Camel-case alias for max_video_bytes.' },
        max_upload_bytes: { type: 'number', description: 'Maximum generated upload bytes for compose.' },
        maxUploadBytes: { type: 'number', description: 'Camel-case alias for max_upload_bytes.' },
        adopt: { type: 'boolean', description: 'When true, immediately adopt/select the composed candidate after creation.' },
        select: { type: 'boolean', description: 'Alias for adopt.' },
        reason: { type: 'string', description: 'Optional decision reason when adopt/select is true.' },
      }),
    },
    {
      name: 'domain_read_content_unit_runtime_panel',
      description: 'Read the derived content unit runtime panel through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_generation_prompt',
      description: 'Read the derived normalized content unit generation prompt through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_input_version',
      description: 'Compatibility alias for domain_read_content_unit_generation_prompt. Reads the derived normalized content unit generation prompt through the domain API.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_dependency_report',
      description: 'Read the derived content unit dependency report through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_selection_validity',
      description: 'Read the derived content unit selection validity report through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_upsert_project_standards',
      description: 'Create or update project-wide creative standards in source project_standards.json. Run domain_inspect, then domain_interpret when derived artifact tools need refreshed context.',
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
      description: 'Create or update a scene_moment source record inside a segment. Scene moments are the final expression aggregation unit for an event/beat; they own expression units and receive final composed content-unit candidates.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_shot',
      description: 'Legacy/auxiliary: create or update a shot source record inside a scene_moment. Prefer expression_unit with modality=visual for new planning; shots are retained only as optional visual material structure.',
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
      description: 'Legacy/auxiliary: create or update an audio_cue source entity under a scene_moment. Prefer expression_unit with modality=audio or verbal plus voice_profile_ref for new dialogue, sound, music, ambience, or foley planning.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, audioCueId: { type: ['string', 'number'] }, audio_cue_id: { type: ['string', 'number'] }, audioCue: { type: 'object', additionalProperties: true }, audio_cue: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_expression_unit',
      description: 'Create or update an expression_unit source entity under a scene_moment. Expression units are the preferred orthogonal expression layer: modality says visual/verbal/audio/text, role says dramatic function, content carries semantics, and content units generate candidate media from them.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, expressionUnitId: { type: ['string', 'number'] }, expression_unit_id: { type: ['string', 'number'] }, expressionUnit: { type: 'object', additionalProperties: true }, expression_unit: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_content_unit_prompt',
      description: 'Update a content unit edit_prompt source field. Run domain_inspect, domain_interpret, and regeneration planning when prompt changes may stale candidates.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, editPrompt: { type: 'object', additionalProperties: true }, edit_prompt: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_entity_transition',
      description: 'Update an entity transition boundary on the source entity that owns transition semantics.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, transition: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_storyboard_timeline',
      description: 'Update a storyboard timeline source field. Storyboard order and timing belong on storyboard timeline source entities, not on generated artifact output.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, timeline: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_append_candidate',
      description: 'Append an inline candidate to an asset or keyframe source entity. Content-unit candidates are backend decision records; use domain_create_content_candidate instead. Generated resources become stable domain dependencies only after candidate/selection writes and explicit adoption/selection.',
      inputSchema: candidateSchema(),
    },
    {
      name: 'domain_create_content_candidate',
      description: 'Create an external content candidate record for a content unit output through the backend decision API. This does not edit workspace source files. Omit status for completed generated resources; the backend defaults it to succeeded. If status is provided, use only queued, running, succeeded, failed, canceled, or imported.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        ...contentCandidateWriteProperties(),
      }),
    },
    {
      name: 'domain_create_content_candidate_batch',
      description: 'Create multiple external content candidate records for content unit outputs through the backend decision API. Each item accepts the same candidate fields as domain_create_content_candidate. Omit item status for completed generated resources; the backend defaults it to succeeded. Runs sequentially and returns per-item results so agents can keep partial successes.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        items: { type: 'array', items: contentCandidateWriteItemSchema() },
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
      description: 'Select a content candidate for a content unit through the backend decision API. Selection is backend decision metadata, not a workspace source-file edit; run domain_inspect and domain_interpret when derived artifact tools need refreshed context.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        resourceId: { type: 'number', description: 'Positive integer RawResource ID.' },
        resource_id: { type: 'number', description: 'Positive integer RawResource ID.' },
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
      name: 'domain_decide_content_unit_candidate',
      description: 'Apply a user decision to a content-unit candidate through the backend decision API. Use decision=adopt to write selection and unblock stable downstream dependencies; use reject or defer to mark the candidate decision without selecting it, so downstream remains blocked until a candidate is adopted.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        decision: { type: 'string', enum: ['adopt', 'reject', 'defer'] },
        resourceId: { type: 'number', description: 'Positive integer RawResource ID.' },
        resource_id: { type: 'number', description: 'Positive integer RawResource ID.' },
        stalePolicy: { type: 'string' },
        stale_policy: { type: 'string' },
        reason: { type: 'string' },
        decidedAt: { type: 'string' },
        decided_at: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      }),
    },
    {
      name: 'domain_select_candidate',
      description: 'Select and lock an inline candidate on an asset or keyframe source entity. Content-unit selections are backend decision records; use domain_select_content_unit_candidate instead.',
      inputSchema: candidateSchema({ candidateId: { type: 'string' }, candidate_id: { type: 'string' }, reason: { type: 'string' } }),
    },
    {
      name: 'domain_update_candidate',
      description: 'Update an inline candidate on an asset or keyframe source entity. Content-unit candidates are backend decision records; use domain_create_content_candidate or domain_decide_content_unit_candidate instead.',
      inputSchema: candidateSchema({ candidateId: { type: 'string' }, candidate_id: { type: 'string' } }),
    },
    {
      name: 'domain_unlock_candidate',
      description: 'Remove an inline candidate lock from an asset or keyframe source entity. Content-unit selections are backend decision records; use domain_select_content_unit_candidate/domain_decide_content_unit_candidate instead.',
      inputSchema: candidateSchema(),
    },
    {
      name: 'domain_delete_entity',
      description: 'Delete a MovScript domain source entity file through the workspace service. Do not touch interpreter debug output for product work.',
      inputSchema: projectSchema({ ...workspaceLocator, entity: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_overview',
      description: 'Show MovScript source state, backend decisions, diagnostics, stale generated outputs, and recommended next actions.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_read_production_work_plan',
      description: 'Derive the current in-memory production work plan from source and decision state. This does not read or write interpreter debug artifacts and should be used by UI, CLI, and agents as the shared production todo graph.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_inspect',
      description: 'Inspect current source changes, diagnostics, and predicted impact without writing debug artifacts. This is the primary diagnostic entrypoint after API writes or direct source edits.',
      inputSchema: projectSchema(inspectOptions),
    },
    {
      name: 'domain_review',
      description: 'Compatibility alias for domain_inspect with review-shaped output. Prefer domain_inspect for current source diagnostics. This is diagnostic only and writes no interpreted artifacts.',
      inputSchema: projectSchema(inspectOptions),
    },
    {
      name: 'domain_interpret',
      description: 'Validate current source and refresh derived diagnostic artifacts when enabled. Does not publish, approve, commit, checkpoint user intent, or create product state.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_regeneration_plan',
      description: 'Plan downstream review targets after domain_interpret refreshes diagnostic context. Reports affected or stale content units, prompt bundles, preview timelines, and selections; it does not require regeneration by itself.',
      inputSchema: projectSchema(workspaceLocator),
    },
  ]
}

function candidateSchema(extra: Record<string, unknown> = {}): MCPTool['inputSchema'] {
  return projectSchema({
    ...workspaceLocator,
    targetPath: { type: 'string' },
    target_path: { type: 'string' },
    targetKind: { type: 'string', enum: ['asset', 'keyframe'] },
    target_kind: { type: 'string', enum: ['asset', 'keyframe'] },
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

function contentCandidateWriteProperties(): Record<string, MCPJSONValue> {
  return {
    contentUnitId: { type: ['string', 'number'] },
    content_unit_id: { type: ['string', 'number'] },
    candidateId: { type: ['string', 'number'] },
    candidate_id: { type: ['string', 'number'] },
    source: { type: 'string' },
    status: {
      type: 'string',
      enum: [...contentCandidateStatuses],
      description: 'Optional. Omit for completed generated resources; the backend defaults it to succeeded. Do not use completed, ready, done, selected, or accepted.',
    },
    producer: { type: 'object', additionalProperties: true },
    outputs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
          resource_id: { type: 'number', description: 'Positive integer RawResource ID.' },
          artifact_ref: { type: 'string', description: 'Optional logical artifact reference; never use as a RawResource ID.' },
          mime_type: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          duration_sec: { type: 'number' },
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['kind', 'resource_id'],
        additionalProperties: true,
      },
    },
    promptSnapshot: { type: 'object', additionalProperties: true },
    prompt_snapshot: { type: 'object', additionalProperties: true },
  }
}

function contentCandidateWriteItemSchema(): MCPJSONValue {
  return {
    type: 'object',
    properties: contentCandidateWriteProperties(),
    additionalProperties: false,
  }
}

function projectSchema(properties: Record<string, MCPJSONValue>, required?: string[]): MCPTool['inputSchema'] {
  return objectSchema(properties, required)
}

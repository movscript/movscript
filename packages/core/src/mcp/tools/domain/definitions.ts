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
      name: 'domain_build_content_unit_artifact',
      description: 'Build the compiler artifact bundle for a content unit, including runtime panel, input version, dependency report, and selection validity. Use before generation or candidate selection when content-unit context may be stale.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_preview_timeline',
      description: 'Read a built production preview timeline from .build/current. This is read-only build output.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_runtime_panel',
      description: 'Read a built content unit runtime panel from .build/current. This is read-only build output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_input_version',
      description: 'Read a built content unit input version from .build/current. This is read-only build output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_dependency_report',
      description: 'Read a built content unit dependency report from .build/current. This is read-only build output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_unit_selection_validity',
      description: 'Read a built content unit selection validity report from .build/current. This is read-only build output.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_upsert_project_standards',
      description: 'Create or update project-wide creative standards in source project_standards.json. Run inspect/review and compile after this write.',
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
      name: 'domain_update_content_unit_prompt',
      description: 'Update a content unit edit_prompt source field. Run inspect/review, compile, and regeneration planning when prompt changes may stale candidates.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, editPrompt: { type: 'object', additionalProperties: true }, edit_prompt: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_entity_transition',
      description: 'Update an entity transition boundary on the source entity that owns transition semantics. Do not write deprecated storyboard_timing transition fields unless the model says so.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, transition: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_storyboard_timeline',
      description: 'Update a storyboard timeline source field. Storyboard order and timing belong on storyboard timeline entities, not on generated build output.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, timeline: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_storyboard_shot_plans',
      description: 'Update storyboard shot_plans.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, shotPlans: { type: 'array', items: { type: 'object', additionalProperties: true } }, shot_plans: { type: 'array', items: { type: 'object', additionalProperties: true } } }),
    },
    {
      name: 'domain_append_candidate',
      description: 'Append an inline candidate to an asset, keyframe, or content unit source entity. Generated resources become domain state only after candidate/selection writes and compile.',
      inputSchema: candidateSchema(),
    },
    {
      name: 'domain_create_content_candidate',
      description: 'Create an external content candidate record for a content unit output. Use for generated content-unit media rather than embedding provider job state in domain JSON.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        source: { type: 'string' },
        status: { type: 'string' },
        inputVersion: { type: 'object', additionalProperties: true },
        input_version: { type: 'object', additionalProperties: true },
        producer: { type: 'object', additionalProperties: true },
        outputs: { type: 'array', items: { type: 'object', additionalProperties: true } },
        promptSnapshot: { type: 'object', additionalProperties: true },
        prompt_snapshot: { type: 'object', additionalProperties: true },
      }),
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
      description: 'Select a content candidate for a content unit using the workspace selection record. Selection is a source write and must be followed by inspect/review and compile.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        resourceId: { type: ['string', 'number'] },
        resource_id: { type: ['string', 'number'] },
        acceptedInputHash: { type: 'string' },
        accepted_input_hash: { type: 'string' },
        stalePolicy: { type: 'string' },
        stale_policy: { type: 'string' },
        reason: { type: 'string' },
      }),
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
      description: 'Delete a MovScript domain source entity file through the workspace service. Do not delete .build output directly.',
      inputSchema: projectSchema({ ...workspaceLocator, entity: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_overview',
      description: 'Show MovScript source state, last successful compiled state, pending edits, stale generated outputs, and recommended next actions.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_inspect',
      description: 'Inspect current source changes, diagnostics, and predicted impact without writing build artifacts. Use after API writes or direct file edits.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_review',
      description: 'Compatibility review entrypoint for inspecting current source files by comparing them with .build/current. This is diagnostic only and does not make edits effective.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_compile',
      description: 'Compile current source files into .build/current, .build/indexes, and stable build artifacts. Compile must succeed before edits become current effective project state.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_build',
      description: 'Compatibility alias for domain_compile. Prefer domain_compile in new agent workflows.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_regeneration_plan',
      description: 'Plan regeneration targets after compile based on changed source entities, dependency impact, stale prompts, and stale content unit selections.',
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

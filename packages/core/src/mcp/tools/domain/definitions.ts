import type { MCPJSONValue, MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const workspaceLocator = {
  workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  projectDir: { type: 'string', description: 'MovScript project source directory. Domain tools read and write this path directly.' },
  project_dir: { type: 'string', description: 'Alias for projectDir.' },
  projectPath: { type: 'string', description: 'Alias for projectDir.' },
  project_path: { type: 'string', description: 'Alias for projectDir.' },
  cwd: { type: 'string', description: 'Alias for projectDir when a provider passes the current project working directory.' },
  projectUid: { type: 'string', description: 'Optional manifest project_uid used for scoped backend candidate metadata.' },
  project_uid: { type: 'string', description: 'Alias for projectUid.' },
}

const contentCandidateStatuses = ['queued', 'running', 'succeeded', 'failed', 'canceled', 'imported'] as const

const entityQuery = {
  ...workspaceLocator,
  entityKind: { type: 'string', description: 'Optional semantic entity kind, for example setting, production, scene_moment, expression_unit, content_unit, storyboard, or keyframe.' },
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
  expressionUnitId: { type: ['string', 'number'] },
  expression_unit_id: { type: ['string', 'number'] },
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
      description: 'Return the movscript-lang workspace model for one editable domain entity: concept, editable path hints, path/vocabulary semantics, context paths, schema ids, supported write APIs, and agent instructions. Call this before direct file edits. Paths are the canonical instance tree; namespace vocabulary supplies labels/templates, not a second structure source. This is project-scoped and does not write files.',
      inputSchema: projectSchema(
        {
          ...workspaceLocator,
          entityKind: { type: 'string', description: 'Domain entity kind, for example setting, asset, production, expression_unit, storyboard, content_unit, or keyframe.' },
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
      description: 'Query MovScript setting entities: concrete film/music production entities to be made or reused, such as characters, props, places, instruments, costumes, or voice identities.',
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
      description: 'Query MovScript setting-state-owned asset slots such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. Content-unit candidates are queried through domain candidate/decision APIs.',
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
      name: 'domain_read_project_context_snapshot',
      description: 'Read and compile project-wide standards plus namespace vocabulary into the stable project context snapshot agents should consult before planning, content work, or generation. This is read-only; use domain_upsert_project_standards only when the user explicitly asks to add, remove, or change standards.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'domain_derive_content_unit_artifact',
      description: 'Derive the interpreter artifact bundle for a content unit, including runtime panel, generation prompt, dependency report, and selection validity. Use before generation or candidate selection when content-unit context may be stale.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_build_content_unit_backend_prompt',
      description: 'Build a backend-ready prompt for a content unit by resolving prompt refs through backend decision selections. Rewrites selected upstream resources like {{asset:id}} to @[resource:id] and returns blockers when referenced content has not been produced or selected.',
      inputSchema: projectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_preview_timeline',
      description: 'Read the derived production preview timeline through the domain API. This is read-only diagnostic/artifact context, not product source.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_production_timeline',
      description: 'Convert the production preview timeline plus selected scene_moment video candidates into a MediaEditingProject handoff. Product editing should continue through editing_* tools. Returns media_editing_project, compose_inputs, clips, and blockers for missing scene_moment output selections.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        projectName: { type: 'string' },
        project_name: { type: 'string' },
        defaultDurationSec: { type: 'number' },
        default_duration_sec: { type: 'number' },
      }),
    },
    {
      name: 'domain_read_scene_moment_edit_plan',
      description: 'Read the derived scene_moment edit plan through the domain API. The plan groups selected content-unit candidates into video, voice, subtitle, audio, image, and metadata tracks for agent-driven composition.',
      inputSchema: projectSchema({ ...workspaceLocator, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_production_edit_plan',
      description: 'Read a production-level edit plan handoff from selected scene_moment outputs. This returns a MovScript edit_plan-shaped artifact for editing_project_create_from_edit_plan; it does not render or write candidates.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        projectName: { type: 'string' },
        project_name: { type: 'string' },
        defaultDurationSec: { type: 'number' },
        default_duration_sec: { type: 'number' },
      }),
    },
    {
      name: 'domain_create_editing_project_context',
      description: 'Return domain-to-editing handoff context for a scene_moment or production: selected content units, candidates, resources, provenance, blockers, and an edit_plan when available. Creation of the MediaEditingProject remains the responsibility of editing_project_create_from_edit_plan.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        sceneMomentId: { type: ['string', 'number'] },
        scene_moment_id: { type: ['string', 'number'] },
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        projectName: { type: 'string' },
        project_name: { type: 'string' },
        defaultDurationSec: { type: 'number' },
        default_duration_sec: { type: 'number' },
      }),
    },
    {
      name: 'domain_read_scene_moment_timeline',
      description: 'Convert a scene_moment edit plan into a MediaEditingProject handoff. Product editing should use editing_project_create_from_edit_plan for new workflows. Returns media_editing_project plus compose_inputs.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        sceneMomentId: { type: ['string', 'number'] },
        scene_moment_id: { type: ['string', 'number'] },
        projectName: { type: 'string' },
        project_name: { type: 'string' },
        sceneName: { type: 'string' },
        scene_name: { type: 'string' },
        defaultDurationSec: { type: 'number' },
        default_duration_sec: { type: 'number' },
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
      description: 'Create or update a MovScript setting source entity. A setting must be a concrete film/music production entity to make or reuse, not an abstract style/rule. Put the setting data to write in required payload; record/entity are optional existing-context objects only. Prefer this API over direct file edits for setting records.',
      inputSchema: projectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }, ['payload']),
    },
    {
      name: 'domain_upsert_setting_state',
      description: 'Create or update a MovScript setting_state source entity under a concrete setting. Setting states are named conditions or versions of the same setting, such as base look, wet costume, damaged prop, side view, calm voice, or angry voice. Put the state data to write in required payload.',
      inputSchema: projectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }, ['payload']),
    },
    {
      name: 'domain_upsert_asset',
      description: 'Create or update a MovScript asset slot source entity under a setting state. Assets describe one state asset such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone; image assets should prefer plain white or very clean backgrounds. Put the asset data to write in required payload; record/entity are optional existing-context objects only. Store RawResource references by resource_id, not binaries or external URLs.',
      inputSchema: projectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }, ['payload']),
    },
    {
      name: 'domain_certify_asset_provider',
      description: 'Register the selected image RawResource with a provider asset library via the MovScript backend. Pass a concrete provider_id when known; otherwise the backend uses the enabled volcengine_ark_official provider. Official Volcengine Ark and Yunwu relay providers with private portrait support are supported. The RawResource stores provider_asset_certifications keyed by provider_id as the certification source of truth, and returned asset:// values are scoped to that provider/account boundary; asset provider_certifications may mirror the selected asset_ref use relationship.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        assetId: { type: ['string', 'number'], description: 'MovScript asset id or asset source path.' },
        asset_id: { type: ['string', 'number'], description: 'Alias for assetId.' },
        assetRef: { type: ['string', 'number'], description: 'Alias for assetId.' },
        asset_ref: { type: ['string', 'number'], description: 'Alias for assetId.' },
        provider: { type: 'string', description: 'Provider id or provider kind selector. Prefer a concrete provider_id such as volc-ark-main. Defaults to volcengine_ark_official.' },
        resourceId: { type: 'number', description: 'Optional RawResource override. Defaults to the selected asset_ref resource.' },
        resource_id: { type: 'number', description: 'Alias for resourceId.' },
        model: { type: 'string', description: 'Target model id. Provider asset certification is model-scoped; certify separately for fast/standard/pro variants.' },
        model_id: { type: 'string', description: 'Alias for model.' },
        asset_group_id: { type: 'string', description: 'Explicit remote provider asset group id selected by the user.' },
        assetGroupId: { type: 'string', description: 'Alias for asset_group_id.' },
        asset_group_name: { type: 'string', description: 'Optional display name for the explicit remote provider asset group.' },
        assetGroupName: { type: 'string', description: 'Alias for asset_group_name.' },
        projectName: { type: 'string', description: 'Optional provider project label for the managed asset group. Defaults to projectId when available.' },
        project_name: { type: 'string', description: 'Alias for projectName.' },
        settingId: { type: 'string', description: 'Optional setting scope for the managed asset group. Defaults to the asset path setting segment when available.' },
        setting_id: { type: 'string', description: 'Alias for settingId.' },
        source_url: { type: 'string', description: 'Optional public image URL override. If omitted, the backend creates a short-lived signed resource URL using MOVSCRIPT_PROVIDER_ASSET_PUBLIC_BASE_URL.' },
        sourceUrl: { type: 'string', description: 'Alias for source_url.' },
        name: { type: 'string', description: 'Optional material asset name. Defaults to asset title/slot/id.' },
        allow_private_urls: { type: 'boolean', description: 'Allow localhost/private source URLs for local official-API testing. Defaults to false.' },
        allowPrivateUrls: { type: 'boolean', description: 'Alias for allow_private_urls.' },
        timeout_ms: { type: 'number', minimum: 1000 },
        timeoutMs: { type: 'number', minimum: 1000 },
      }),
    },
    {
      name: 'domain_query_remote_asset_groups',
      description: 'List remote provider asset-library groups mirrored by MovScript for a provider account. Use this before registering assets when the user must choose the target remote group.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        provider: { type: 'string', description: 'Provider id or provider kind selector. Prefer a concrete provider_id such as yunwu-main or volc-ark-main.' },
        provider_id: { type: 'string', description: 'Alias for provider.' },
        model: { type: 'string', description: 'Optional target model id for model-scoped groups.' },
        model_id: { type: 'string', description: 'Alias for model.' },
      }),
    },
    {
      name: 'domain_query_remote_assets',
      description: 'List remote provider assets inside a selected provider asset group, including model-specific certification records.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        provider: { type: 'string', description: 'Provider id or provider kind selector. Prefer a concrete provider_id such as yunwu-main or volc-ark-main.' },
        provider_id: { type: 'string', description: 'Alias for provider.' },
        groupId: { type: ['string', 'number'], description: 'Remote provider asset group id or MovScript mirrored group id.' },
        group_id: { type: ['string', 'number'], description: 'Alias for groupId.' },
        asset_group_id: { type: ['string', 'number'], description: 'Alias for groupId.' },
      }),
    },
    {
      name: 'domain_upsert_setting_tree',
      description: 'Create or update one concrete setting plus multiple setting_state records and each state\'s asset slots in one structured write. Use this for setting -> many states -> many assets authoring. Asset generated candidates still belong to asset_ref content units; this tool only writes the source setting/state/asset structure.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        setting: { type: 'object', additionalProperties: true },
        payload: { type: 'object', additionalProperties: true },
        states: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              state: { type: 'object', additionalProperties: true },
              payload: { type: 'object', additionalProperties: true },
              assets: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      }, ['states']),
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
      description: 'Create or update a project-level content unit source record. Content units are independent production tasks and never target namespace nodes directly. For namespace-scope video output, use content_unit_type=timeline_assembly_ref with target_kind=timeline_assembly plus target_ref=timeline_assembly:<scopeKind>:<scopeRef>, or pass scope_kind/scope_ref so the writer derives that target_ref. Legacy production_ref/segment_ref remain compatibility aliases for timeline assemblies; do not invent episode_ref, beat_ref, or other namespace ref types.',
      inputSchema: projectSchema({ ...workspaceLocator, unit: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_timeline_namespace_tree',
      description: 'Merge-write a path-first timeline namespace tree under timeline/. Namespace vocabulary supplies labels/templates only; instance parent-child structure comes from targetPath and nested tree placement. Nodes are namespace labels over legacy production/segment projections and must not carry content-unit refs, candidates, selections, resources, production_ref, or segment_ref. Put scene_moments and their expression_units/storyboards/keyframes/audio_cues under namespace nodes when the tree needs production primitives. For namespace-scope video output, put explicit content_units on a namespace node; they are written as timeline_assembly_ref content units with target_kind=timeline_assembly and target_ref=timeline_assembly:<namespace_kind>:<id>.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        namespace: { type: 'object', additionalProperties: true },
        root: { type: 'object', additionalProperties: true },
        tree: { type: 'object', additionalProperties: true },
        nodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
        namespaces: { type: 'array', items: { type: 'object', additionalProperties: true } },
        timeline_namespaces: { type: 'array', items: { type: 'object', additionalProperties: true } },
        timelineNamespaces: { type: 'array', items: { type: 'object', additionalProperties: true } },
        scene_moments: { type: 'array', items: { type: 'object', additionalProperties: true } },
        sceneMoments: { type: 'array', items: { type: 'object', additionalProperties: true } },
      }),
    },
    {
      name: 'domain_upsert_production',
      description: 'Create or update a production source record under productions/. Use this before adding segment, scene_moment, expression_unit, keyframe, or storyboard planning structure.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, production: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_production_tree',
      description: 'Merge-write one legacy production-projection tree plus nested segments, scene_moments, expression_units, storyboards, keyframes, audio_cues, and content_units in one structured operation. This is an upsert/patch tree: records are matched by id and updated; omitted existing children are not deleted. Use explicit delete flows for removals. Candidate writes still belong to content-unit candidate tools. For new namespace-scope video output, prefer explicit timeline_assembly_ref content units through domain_upsert_content_unit instead of relying on legacy production_ref/segment_ref tree defaults.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        production: { type: 'object', additionalProperties: true },
        payload: { type: 'object', additionalProperties: true },
        record: { type: 'object', additionalProperties: true },
        content_units: { type: 'array', items: { type: 'object', additionalProperties: true } },
        contentUnits: { type: 'array', items: { type: 'object', additionalProperties: true } },
        segments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              segment: { type: 'object', additionalProperties: true },
              payload: { type: 'object', additionalProperties: true },
              scene_moments: { type: 'array', items: { type: 'object', additionalProperties: true } },
              sceneMoments: { type: 'array', items: { type: 'object', additionalProperties: true } },
              content_units: { type: 'array', items: { type: 'object', additionalProperties: true } },
              contentUnits: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      }, ['segments']),
    },
    {
      name: 'domain_upsert_segment',
      description: 'Create or update a segment source record inside a production. Segments are rhythm or dramatic-function sections and own scene_moment children.',
      inputSchema: projectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, segment: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_scene_moment',
      description: 'Create or update a scene_moment system primitive. Prefer targetPath or namespacePath for new timeline namespace projects so the scene moment is written under timeline/** by path; productionId/segmentId are legacy compatibility inputs. Scene moments are the final expression aggregation unit for an event/beat; they own expression units and receive final composed content-unit candidates.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, namespacePath: { type: 'string' }, namespace_path: { type: 'string' }, timelineNamespacePath: { type: 'string' }, timeline_namespace_path: { type: 'string' }, parentPath: { type: 'string' }, parent_path: { type: 'string' }, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_keyframe',
      description: 'Create or update a keyframe source entity under an expression_unit(kind=shot) or directly under a scene_moment. Prefer targetPath, expressionUnitPath, or sceneMomentPath for new timeline namespace projects; productionId/segmentId are legacy compatibility inputs. Keyframes are visual anchors referenced by keyframe_ref content units.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, expressionUnitPath: { type: 'string' }, expression_unit_path: { type: 'string' }, sceneMomentPath: { type: 'string' }, scene_moment_path: { type: 'string' }, parentPath: { type: 'string' }, parent_path: { type: 'string' }, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, expressionUnitId: { type: ['string', 'number'] }, expression_unit_id: { type: ['string', 'number'] }, keyframeId: { type: ['string', 'number'] }, keyframe_id: { type: ['string', 'number'] }, keyframe: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, expressionUnit: { type: 'object', additionalProperties: true }, expression_unit: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_storyboard',
      description: 'Create or update a storyboard source record under an expression_unit(kind=shot) or directly under a scene_moment. Prefer targetPath, expressionUnitPath, or sceneMomentPath for new timeline namespace projects; productionId/segmentId are legacy compatibility inputs. Use expression units for shot semantics; this tool does not create standalone shot nodes.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        targetPath: { type: 'string' },
        target_path: { type: 'string' },
        expressionUnitPath: { type: 'string' },
        expression_unit_path: { type: 'string' },
        sceneMomentPath: { type: 'string' },
        scene_moment_path: { type: 'string' },
        parentPath: { type: 'string' },
        parent_path: { type: 'string' },
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
        segmentId: { type: ['string', 'number'] },
        segment_id: { type: ['string', 'number'] },
        sceneMomentId: { type: ['string', 'number'] },
        scene_moment_id: { type: ['string', 'number'] },
        expressionUnitId: { type: ['string', 'number'] },
        expression_unit_id: { type: ['string', 'number'] },
        sceneMomentTitle: { type: 'string' },
        scene_moment_title: { type: 'string' },
        segmentTitle: { type: 'string' },
        segment_title: { type: 'string' },
        storyboardId: { type: ['string', 'number'] },
        storyboard_id: { type: ['string', 'number'] },
        storyboard: { type: 'object', additionalProperties: true },
        payload: { type: 'object', additionalProperties: true },
        expressionUnit: { type: 'object', additionalProperties: true },
        expression_unit: { type: 'object', additionalProperties: true },
        production: { type: 'object', additionalProperties: true },
      }),
    },
    {
      name: 'domain_upsert_audio_cue',
      description: 'Legacy/auxiliary: create or update an audio_cue source entity under a scene_moment. Prefer targetPath or sceneMomentPath for new timeline namespace projects; productionId/segmentId are legacy compatibility inputs. Prefer expression_unit with modality=audio or verbal plus voice_profile_ref for new dialogue, sound, music, ambience, or foley planning.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, sceneMomentPath: { type: 'string' }, scene_moment_path: { type: 'string' }, parentPath: { type: 'string' }, parent_path: { type: 'string' }, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, audioCueId: { type: ['string', 'number'] }, audio_cue_id: { type: ['string', 'number'] }, audioCue: { type: 'object', additionalProperties: true }, audio_cue: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_expression_unit',
      description: 'Create or update an expression_unit source entity under a scene_moment. Prefer targetPath or sceneMomentPath for new timeline namespace projects; productionId/segmentId are legacy compatibility inputs. Use slot_kind=visual|voice|subtitle|audio for new expression slots; expression_kind/kind are legacy compatibility hints.',
      inputSchema: projectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, sceneMomentPath: { type: 'string' }, scene_moment_path: { type: 'string' }, parentPath: { type: 'string' }, parent_path: { type: 'string' }, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] }, segmentId: { type: ['string', 'number'] }, segment_id: { type: ['string', 'number'] }, sceneMomentId: { type: ['string', 'number'] }, scene_moment_id: { type: ['string', 'number'] }, expressionUnitId: { type: ['string', 'number'] }, expression_unit_id: { type: ['string', 'number'] }, expressionUnit: { type: 'object', additionalProperties: true }, expression_unit: { type: 'object', additionalProperties: true }, payload: { type: 'object', additionalProperties: true }, sceneMoment: { type: 'object', additionalProperties: true }, scene_moment: { type: 'object', additionalProperties: true }, segment: { type: 'object', additionalProperties: true }, production: { type: 'object', additionalProperties: true } }),
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
      name: 'domain_register_raw_resource_as_content_unit_candidate',
      description: 'Register an existing MovScript RawResource as a content-unit candidate through the backend decision API. Use this when a resource already exists from upload, transform, import, or low-level generation and should enter the candidate pool without selecting it.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        resourceId: { type: 'number', description: 'Positive integer RawResource ID to register as a candidate output.' },
        resource_id: { type: 'number', description: 'Alias for resourceId.' },
        outputKind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
        output_kind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
        kind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
        candidateId: { type: ['string', 'number'] },
        candidate_id: { type: ['string', 'number'] },
        source: { type: 'string' },
        status: { type: 'string', enum: [...contentCandidateStatuses] },
        mimeType: { type: 'string' },
        mime_type: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        durationSec: { type: 'number' },
        duration_sec: { type: 'number' },
        metadata: { type: 'object', additionalProperties: true },
        producer: { type: 'object', additionalProperties: true },
        promptSnapshot: { type: 'object', additionalProperties: true },
        prompt_snapshot: { type: 'object', additionalProperties: true },
      }, ['contentUnitId', 'resourceId']),
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
      name: 'domain_production_status_summary',
      description: 'Summarize current production progress for agents: prerequisites/settings/assets, storyboards, keyframes, content-unit candidate counts, selected resources, stale hints, and blocking refs. Use this before broad generation or review instead of manually stitching many tool results.',
      inputSchema: projectSchema({
        ...workspaceLocator,
        productionId: { type: ['string', 'number'] },
        production_id: { type: ['string', 'number'] },
      }),
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

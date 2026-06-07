import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const workspaceLocator = {
  workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  userId: { type: ['string', 'number'], description: 'Optional workspace user id used to resolve the project repository root.' },
  user_id: { type: ['string', 'number'], description: 'Alias for userId.' },
  orgId: { type: ['string', 'number'], description: 'Optional workspace organization id used to resolve the project repository root.' },
  org_id: { type: ['string', 'number'], description: 'Alias for orgId.' },
  projectId: { type: ['string', 'number'], description: 'Optional project id used to resolve the project repository root.' },
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
      description: 'Return the domain workspace model for editing one MovScript entity: workspace kind, editable paths, context paths, schema ids, and agent instructions. This does not write files.',
      inputSchema: objectSchema(
        {
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
      description: 'Query indexed MovScript domain source entities by entity kind, ids, path context, or free text.',
      inputSchema: objectSchema(entityQuery),
    },
    {
      name: 'domain_query_settings',
      description: 'Query MovScript setting domain entities such as characters, locations, props, world rules, and styles.',
      inputSchema: objectSchema({
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
      inputSchema: objectSchema({
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
      description: 'Query production planning context: productions, segments, scene moments, storyboards, writing expressions, content units, and keyframes.',
      inputSchema: objectSchema({
        ...entityQuery,
        include: {
          type: 'array',
          items: { type: 'string', enum: ['productions', 'segments', 'scene_moments', 'storyboards', 'writing_expressions', 'content_units', 'keyframes'] },
        },
      }),
    },
    {
      name: 'domain_compile_content_generation_prompt',
      description: 'Compile generation prompt context for a content unit from built or source domain indexes.',
      inputSchema: objectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_preview_timeline',
      description: 'Read a built production preview timeline from .build/current. This is read-only build output.',
      inputSchema: objectSchema({ ...workspaceLocator, productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_read_content_generation_prompt',
      description: 'Read a built content unit generation prompt from .build/current. This is read-only build output.',
      inputSchema: objectSchema({ ...workspaceLocator, contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
    },
    {
      name: 'domain_upsert_project_standards',
      description: 'Create or update project-wide creative standards in project_standards.json.',
      inputSchema: objectSchema({ ...workspaceLocator, projectStyle: { type: 'object', additionalProperties: true }, project_style: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_setting',
      description: 'Create or update a MovScript setting source entity.',
      inputSchema: objectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_asset',
      description: 'Create or update a MovScript asset slot source entity under a setting or setting state.',
      inputSchema: objectSchema({ ...workspaceLocator, payload: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_upsert_script',
      description: 'Create or update a script source record and script.md text.',
      inputSchema: objectSchema({ ...workspaceLocator, scriptId: { type: ['string', 'number'] }, script_id: { type: ['string', 'number'] }, sourceText: { type: 'string' }, source_text: { type: 'string' }, metadata: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_read_script_source',
      description: 'Read script.md source text for a script domain entity.',
      inputSchema: objectSchema({ ...workspaceLocator, record: { type: 'object', additionalProperties: true }, entity: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_snapshot_script_version',
      description: 'Create a script version and script blocks from a script Markdown source.',
      inputSchema: objectSchema({ ...workspaceLocator, scriptId: { type: ['string', 'number'] }, script_id: { type: ['string', 'number'] }, versionId: { type: ['string', 'number'] }, version_id: { type: ['string', 'number'] }, versionLabel: { type: 'string' }, version_label: { type: 'string' }, sourcePath: { type: 'string' }, source_path: { type: 'string' } }),
    },
    {
      name: 'domain_upsert_content_unit',
      description: 'Create or update a project-level content unit and optional content-unit keyframes.',
      inputSchema: objectSchema({ ...workspaceLocator, unit: { type: 'object', additionalProperties: true }, keyframes: { type: 'array', items: { type: 'object', additionalProperties: true } } }),
    },
    {
      name: 'domain_update_content_unit_prompt',
      description: 'Update a content unit editable prompt.',
      inputSchema: objectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, editablePrompt: { type: 'object', additionalProperties: true }, editable_prompt: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_update_scene_moment_timing',
      description: 'Update scene_moment storyboard_timing, audio, transition, and active storyboard id.',
      inputSchema: objectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: true } }, audio: { type: 'object', additionalProperties: true }, transition: { type: 'object', additionalProperties: true }, activeStoryboardId: { type: 'string' }, active_storyboard_id: { type: 'string' } }),
    },
    {
      name: 'domain_update_storyboard_shot_plans',
      description: 'Update storyboard shot_plans.',
      inputSchema: objectSchema({ ...workspaceLocator, targetPath: { type: 'string' }, target_path: { type: 'string' }, shotPlans: { type: 'array', items: { type: 'object', additionalProperties: true } }, shot_plans: { type: 'array', items: { type: 'object', additionalProperties: true } } }),
    },
    {
      name: 'domain_append_candidate',
      description: 'Append an inline candidate to an asset, keyframe, or content unit source entity.',
      inputSchema: candidateSchema(),
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
      description: 'Delete a MovScript domain source entity file.',
      inputSchema: objectSchema({ ...workspaceLocator, entity: { type: 'object', additionalProperties: true }, record: { type: 'object', additionalProperties: true } }),
    },
    {
      name: 'domain_review',
      description: 'Review current source files by comparing them with .build/current. Reports changed files, changed entities, schema/domain issues, and whether build is ready. This does not make edits effective.',
      inputSchema: objectSchema(workspaceLocator),
    },
    {
      name: 'domain_build',
      description: 'Build current source files into .build/current and .build/indexes. Build must succeed before edits become the current effective workspace state.',
      inputSchema: objectSchema(workspaceLocator),
    },
  ]
}

function candidateSchema(extra: Record<string, unknown> = {}): MCPTool['inputSchema'] {
  return objectSchema({
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

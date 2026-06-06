import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function workspaceTools(): MCPTool[] {
  return [
    {
      name: 'get_focus_context',
      description: 'Return the current task focus: route, selected project, active production id, current user, and selected entity. This does not load project lists, scripts, workspaces, or resources.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'movscript_focus_get',
      description: 'Return the current MovScript task focus: route, selected project, active production id, current user, and selected entity. This does not load project lists, scripts, workspaces, or resources.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'movscript_project_list',
      description: 'List visible projects for the current user as numbered Markdown summaries.',
      inputSchema: objectSchema(
        {
          limit: { type: 'number' },
        }
      ),
    },
    {
      name: 'movscript_script_list',
      description: 'List editable project scripts and immutable script versions without reading full screenplay text by default. Use this before locating passages when you need script IDs, scriptVersion IDs, titles, statuses, or readonly refs.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          project_id: { type: 'number', description: 'Snake-case alias for projectId.' },
          scriptId: { type: 'number', description: 'Optional script ID filter.' },
          script_id: { type: 'number', description: 'Snake-case alias for scriptId.' },
          status: { type: 'string', description: 'Optional script-version status filter, e.g. workspace, active, archived.' },
          query: { type: 'string', description: 'Optional local search over title, description, summary, status, and type fields.' },
          q: { type: 'string', description: 'Alias for query.' },
          limit: { type: 'number', description: 'Maximum scripts and versions to return per section. Defaults to 100.' },
          include_content: { type: 'boolean', description: 'When true, include bounded content/raw_source previews. Defaults to false.' },
          includeContent: { type: 'boolean', description: 'Camel-case alias for include_content.' },
          contentLimit: { type: 'number', description: 'Maximum preview characters when include_content is true. Defaults to 500, max 5000.' },
          content_limit: { type: 'number', description: 'Snake-case alias for contentLimit.' },
        }
      ),
    },
    {
      name: 'movscript_script_locate',
      description: 'Locate likely screenplay passages across project script-version files from a fuzzy user intent without reading full scripts. Supports multiple query terms, must/should/exclude terms, alias groups, scene-aware scoring, and returns readonly script file refs plus line ranges for core_file_read/search.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          scriptVersionId: { type: 'number', description: 'Preferred immutable script version ID.' },
          scriptId: { type: 'number', description: 'Optional legacy script ID; matching script versions are searched.' },
          scriptTitle: { type: 'string', description: 'Optional script title such as 总剧本 or 第一集 when no version ID is known.' },
          intent: { type: 'string', description: 'Natural-language user request, for example 老张发现纸条那里改得更压抑一点.' },
          query: { type: 'string', description: 'Single search query alias. Prefer queries for multiple terms.' },
          queries: { type: 'array', items: { type: 'string' }, description: 'Candidate terms. Any matching term helps ranking.' },
          must: { type: 'array', items: { type: 'string' }, description: 'Terms that should appear in the returned context window when provided.' },
          should: { type: 'array', items: { type: 'string' }, description: 'Optional ranking terms.' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Terms that exclude a candidate context window.' },
          aliasGroups: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Equivalent names or phrases, e.g. [["张建国","老张","父亲"],["纸条","字条","便签"]].' },
          windowLines: { type: 'number', description: 'Context window radius around matched lines. Defaults to 6.' },
          limit: { type: 'number', description: 'Maximum candidates to return. Defaults to 5.' },
          contentLimit: { type: 'number', description: 'Compatibility hint for maximum follow-up read size. Use core_file_read contentLimit for actual file reads.' },
          includeExcerpt: { type: 'boolean', description: 'When true, include bounded original text excerpts. Defaults to true.' },
        }
      ),
    },
    {
      name: 'movscript_creative_reference_query',
      description: 'Query project creative references / setting materials such as characters, places, props, products, style rules, and restrictions. Can include related states, usages, relationships, and asset slots for candidate material planning.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          creative_reference_id: { type: 'number', description: 'Optional creative reference ID to return one setting material.' },
          kind: { type: 'string', description: 'Optional reference kind such as person, place, prop, product, brand, style, world_rule, time_period, or restriction.' },
          status: { type: 'string', description: 'Optional local status filter applied client-side.' },
          query: { type: 'string', description: 'Optional text search over name, alias, description, content, and tags/profile JSON fields.' },
          include_states: { type: 'boolean', description: 'When true, include creative-reference states for returned references.' },
          include_usages: { type: 'boolean', description: 'When true, include usages for returned references.' },
          include_relationships: { type: 'boolean', description: 'When true, include creative relationships for returned references.' },
          include_asset_slots: { type: 'boolean', description: 'When true, include asset slots linked to returned references or their states.' },
          limit: { type: 'number', description: 'Maximum references to return. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_asset_slot_query',
      description: 'Query project asset slots, including slots owned by a creative reference, creative reference state, segment, scene moment, storyboard line, content unit, or keyframe.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          asset_slot_id: { type: 'number', description: 'Optional asset slot ID to return one slot.' },
          creative_reference_id: { type: 'number', description: 'Optional creative reference ID; matches direct reference links and reference-owned slots.' },
          creative_reference_state_id: { type: 'number', description: 'Optional creative reference state ID; matches direct state links and state-owned slots.' },
          owner_type: { type: 'string', description: 'Optional owner type such as creative_reference, creative_reference_state, segment, scene_moment, content_unit, or keyframe.' },
          owner_id: { type: 'number', description: 'Optional owner entity ID. Applied with owner_type when provided.' },
          production_id: { type: 'number', description: 'Optional production filter.' },
          status: { type: 'string', description: 'Optional status filter such as missing, candidate, locked, or waived.' },
          query: { type: 'string', description: 'Optional text search over name, description, prompt_hint, slot_key, and metadata_json.' },
          include_internal: { type: 'boolean', description: 'When true, include internal asset-slot-owned slots.' },
          include_candidates: { type: 'boolean', description: 'When true, include existing asset slot candidates for returned slots.' },
          limit: { type: 'number', description: 'Maximum asset slots to return. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_production_context_query',
      description: 'Query production context entities for material planning: productions, emotional / dramatic segments, scene moments, content units, and official keyframes. For a content_unit_id it can also build the generation context with references and asset slots.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          production_id: { type: 'number', description: 'Optional production ID.' },
          segment_id: { type: 'number', description: 'Optional segment ID.' },
          scene_moment_id: { type: 'number', description: 'Optional scene moment ID.' },
          content_unit_id: { type: 'number', description: 'Optional content unit ID.' },
          status: { type: 'string', description: 'Optional status filter for productions or segments where supported.' },
          query: { type: 'string', description: 'Optional text search over titles, descriptions, summaries, prompts, mood, action, and metadata.' },
          include: { type: 'array', items: { type: 'string', enum: ['productions', 'segments', 'scene_moments', 'content_units', 'keyframes'] }, description: 'Optional entity groups to include. Defaults to segments, scene_moments, and content_units. keyframes returns official keyframes only, excluding AI candidate keyframes.' },
          include_generation_context: { type: 'boolean', description: 'When true and content_unit_id is provided, include backend generation context for that content unit.' },
          intent: { type: 'string', enum: ['keyframe', 'video'], description: 'Generation-context intent. Defaults to video.' },
          limit: { type: 'number', description: 'Maximum items per group. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'workspace_update',
      description: 'Refresh a MovScript business projection path from the backend database, overwriting local changes under that file or folder. Supports workspace JSON, project.json, script.md, and the read-only user projects index. Legacy snapshot payloads are still accepted for compatibility.',
      inputSchema: objectSchema(
        {
          path: { type: 'string', description: 'Projection file or folder under .movscript/data. Defaults to the current user/project/production projection folder when omitted by path-based clients.' },
          cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
          kind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'], description: 'Workspace kind. Alias: workspaceKind.' },
          workspaceKind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'], description: 'Alias for kind.' },
          target: { type: 'object', additionalProperties: true, description: 'Target entity anchor, e.g. projectId/entityType/entityId.' },
          content: { description: 'Complete workspace snapshot JSON object or JSON string. Aliases: snapshot, proposedValue.' },
          snapshot: { description: 'Alias for content.' },
          proposedValue: { description: 'Legacy alias for content.' },
          currentValue: { description: 'Optional current snapshot for validation context.' },
          workspaceId: { type: 'string', description: 'Optional frontend workspace id.' },
          workspacePath: { type: 'string', description: 'Legacy .movscript-relative projection path alias. Prefer path.' },
          workspace_path: { type: 'string', description: 'Snake-case alias for workspacePath.' },
          projection: { type: 'object', additionalProperties: true, description: 'Legacy projection object. workspacePath is used when content is omitted.' },
        }
      ),
    },
    {
      name: 'movscript_project_create',
      description: 'Create a formal MovScript project. Use only when the user explicitly asks to create a new project or confirms the project name.',
      inputSchema: objectSchema(
        {
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          total_episodes: { type: 'number' },
        },
        ['name']
      ),
    },
    {
      name: 'workspace_apply_review',
      description: 'Preview what applying a local MovScript business projection file or folder would change in the backend database. This does not write backend entity state.',
      inputSchema: objectSchema(
        {
          path: { type: 'string', description: 'Projection file or folder under .movscript/data. Defaults to the projection root when omitted by path-based clients.' },
          cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
          userId: { type: 'number' },
        }
      ),
    },
    {
      name: 'workspace_apply',
      description: 'Apply a local MovScript business projection file or folder to the backend database when that projection has a writable backend route. Legacy review payloads are still accepted for frontend review handoff compatibility.',
      inputSchema: objectSchema(
        {
          path: { type: 'string', description: 'Projection file or folder under .movscript/data. When provided, local files are read and submitted to the backend.' },
          cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
          review: { type: 'object', description: 'Legacy review wrapper. Prefer kind/target/content for new calls.' },
          kind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'], description: 'Workspace kind. Alias: workspaceKind.' },
          workspaceKind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'], description: 'Alias for kind.' },
          target: { type: 'object', additionalProperties: true, description: 'Target entity anchor, e.g. projectId/entityType/entityId.' },
          content: { description: 'Complete workspace snapshot JSON object or JSON string. Aliases: snapshot, proposedValue.' },
          snapshot: { description: 'Alias for content.' },
          proposedValue: { description: 'Legacy alias for content.' },
          currentValue: { description: 'Optional current snapshot for validation context.' },
          workspaceId: { type: 'string', description: 'Optional frontend workspace id.' },
          workspacePath: { type: 'string', description: 'Legacy .movscript-relative projection path alias. When content is omitted, apply reads this file.' },
          workspace_path: { type: 'string', description: 'Snake-case alias for workspacePath.' },
          projection: { type: 'object', additionalProperties: true, description: 'Legacy projection object. workspacePath is used when content is omitted.' },
          userId: { type: 'number' },
        }
      ),
    },
  ]
}

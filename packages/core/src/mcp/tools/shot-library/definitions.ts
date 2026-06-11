import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function shotLibraryTools(): MCPTool[] {
  return [
    {
      name: 'movscript_shot_library_query',
      description: 'Query the MovScript shot reference library for reusable camera, composition, movement, narrative, emotion, and production patterns. Use this before generation when the user asks for a shot style, camera plan, reference shot, or reusable visual pattern.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Natural-language or tag query, e.g. 角色发现真相前, slow push in, foreground obstruction, tension.' },
          q: { type: 'string', description: 'Alias for query.' },
          shot_reference_id: { type: 'number', description: 'Optional shot reference ID to filter the requested page.' },
          shotReferenceId: { type: 'number', description: 'Camel-case alias for shot_reference_id.' },
          id: { type: 'number', description: 'Alias for shot_reference_id.' },
          group_id: { type: 'number', description: 'Optional shot reference group ID. When present, returns shots in that group.' },
          groupId: { type: 'number', description: 'Camel-case alias for group_id.' },
          page: { type: 'number', description: '1-based page number. Defaults to 1.' },
          page_size: { type: 'number', description: 'Page size, clamped to 1-100. Defaults to 20.' },
          pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
          limit: { type: 'number', description: 'Alias for page_size.' },
          topK: { type: 'number', description: 'Alias for page_size.' },
          include_full: { type: 'boolean', description: 'When true, return the full backend record instead of a compact agent summary.' },
          includeFull: { type: 'boolean', description: 'Camel-case alias for include_full.' },
        }
      ),
      outputSchema: objectSchema(
        {
          query: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
          total: { type: 'number' },
          count: { type: 'number' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          warning: { type: 'string' },
        },
        ['query', 'page', 'pageSize', 'total', 'count', 'items']
      ),
    },
    {
      name: 'movscript_shot_group_create',
      description: 'Create an empty MovScript shot reference group for a video RawResource. Use this before adding detected shots when the agent needs a stable group ID for the source clip.',
      inputSchema: objectSchema(
        {
          resource_id: { type: 'number', description: 'Video RawResource ID used as the source resource for the group.' },
          resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
          title: { type: 'string', description: 'Optional group title. Defaults from the source filename.' },
          summary: { type: 'string', description: 'Optional group summary.' },
          cut_strategy: { type: 'string', description: 'Optional cut strategy label, e.g. scene_detection or manual_review.' },
          cutStrategy: { type: 'string', description: 'Camel-case alias for cut_strategy.' },
        }
      ),
      outputSchema: objectSchema({
        status: { type: 'string' },
        group_id: { type: 'number' },
        group: { type: 'object', additionalProperties: true },
        message: { type: 'string' },
      }, ['status', 'group_id', 'group', 'message']),
    },
    {
      name: 'movscript_shot_group_get',
      description: 'Read a MovScript shot reference group and its ordered shots. Use this as the agent source of truth for which shots need to be recreated.',
      inputSchema: objectSchema(
        {
          group_id: { type: 'number', description: 'Shot reference group ID.' },
          groupId: { type: 'number', description: 'Camel-case alias for group_id.' },
          id: { type: 'number', description: 'Alias for group_id.' },
        }
      ),
      outputSchema: objectSchema({
        status: { type: 'string' },
        group_id: { type: 'number' },
        group: { type: 'object', additionalProperties: true },
        count: { type: 'number' },
        shots: { type: 'array', items: { type: 'object', additionalProperties: true } },
      }, ['status', 'group_id', 'group', 'count', 'shots']),
    },
    {
      name: 'movscript_shot_group_add_shots',
      description: 'Append one or more shot references to an existing shot reference group for a source video resource. The agent can pass detected start/end ranges plus optional manual shot metadata.',
      inputSchema: objectSchema(
        {
          group_id: { type: 'number', description: 'Existing shot reference group ID.' },
          groupId: { type: 'number', description: 'Camel-case alias for group_id.' },
          resource_id: { type: 'number', description: 'Video RawResource ID. Defaults to the group source resource when omitted.' },
          resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
          duration_sec: { type: 'number', description: 'Optional full video duration in seconds.' },
          durationSec: { type: 'number', description: 'Camel-case alias for duration_sec.' },
          width: { type: 'number', description: 'Optional video width.' },
          height: { type: 'number', description: 'Optional video height.' },
          shots: {
            type: 'array',
            description: 'Shot metadata array. Each item may include title, summary, start_sec/startSec, end_sec/endSec, tags, and professional annotation fields.',
            items: { type: 'object', additionalProperties: true },
          },
        }
      ),
      outputSchema: objectSchema({
        status: { type: 'string' },
        group_id: { type: 'number' },
        count: { type: 'number' },
        shots: { type: 'array', items: { type: 'object', additionalProperties: true } },
        message: { type: 'string' },
      }, ['status', 'group_id', 'count', 'shots', 'message']),
    },
    {
      name: 'movscript_video_shot_cuts_analyze',
      description: 'Analyze a MovScript video RawResource with ffmpeg scene detection and return shot ranges. This only detects cuts; use movscript_shot_group_add_shots to persist the ranges.',
      inputSchema: objectSchema({
        resource_id: { type: 'number', description: 'Video RawResource ID.' },
        resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
        id: { type: 'number', description: 'Alias for resource_id.' },
        duration_sec: { type: 'number', description: 'Optional known duration. If omitted, ffprobe is used when available.' },
        durationSec: { type: 'number', description: 'Camel-case alias for duration_sec.' },
        scene_threshold: { type: 'number', description: 'ffmpeg scene threshold. Defaults to 0.28.' },
        sceneThreshold: { type: 'number', description: 'Camel-case alias for scene_threshold.' },
        min_shot_duration_sec: { type: 'number', description: 'Minimum shot duration in seconds. Defaults to 1.2.' },
        minShotDurationSec: { type: 'number', description: 'Camel-case alias for min_shot_duration_sec.' },
        max_shot_duration_sec: { type: 'number', description: 'Maximum shot duration in seconds. Defaults to 12.' },
        maxShotDurationSec: { type: 'number', description: 'Camel-case alias for max_shot_duration_sec.' },
        max_video_bytes: { type: 'number', description: 'Maximum source video size to download. Defaults to 200 MiB, hard-capped at 1 GiB.' },
        maxVideoBytes: { type: 'number', description: 'Camel-case alias for max_video_bytes.' },
      }),
      outputSchema: objectSchema({
        status: { type: 'string' },
        resource_id: { type: 'number' },
        strategy: { type: 'string' },
        duration_sec: { type: 'number' },
        count: { type: 'number' },
        shots: { type: 'array', items: { type: 'object', additionalProperties: true } },
        warning: { type: 'string' },
      }, ['status', 'resource_id', 'strategy', 'count', 'shots']),
    },
  ]
}

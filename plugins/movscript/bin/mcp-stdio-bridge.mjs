#!/usr/bin/env node
import readline from 'node:readline'

const DEFAULT_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_ENDPOINT
const debug = process.env.MOVSCRIPT_MCP_BRIDGE_DEBUG === '1'
const discoveryTimeoutMs = Number(process.env.MOVSCRIPT_MCP_BRIDGE_DISCOVERY_TIMEOUT_MS || 750)

const workspaceTools = [
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
    inputSchema: objectSchema({
      limit: { type: 'number' },
    }),
  },
  {
    name: 'movscript_script_list',
    description: 'List editable project scripts and immutable script versions without reading full screenplay text by default. Use this before locating passages when you need script IDs, scriptVersion IDs, titles, statuses, or readonly refs.',
    inputSchema: objectSchema({
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
    }),
  },
  {
    name: 'movscript_project_create',
    description: 'Create a formal MovScript project. Use only when the user explicitly asks to create a new project or confirms the project name.',
    inputSchema: objectSchema({
      name: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string' },
      total_episodes: { type: 'number' },
    }, ['name']),
  },
  {
    name: 'movscript_script_locate',
    description: 'Locate likely screenplay passages across project script-version files from a fuzzy user intent without reading full scripts. Supports multiple query terms, must/should/exclude terms, alias groups, scene-aware scoring, and returns readonly script file refs plus line ranges for core_file_read/search.',
    inputSchema: objectSchema({
      projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
      scriptVersionId: { type: 'number', description: 'Preferred immutable script version ID.' },
      scriptId: { type: 'number', description: 'Optional legacy script ID; matching script versions are searched.' },
      scriptTitle: { type: 'string', description: 'Optional script title when no version ID is known.' },
      intent: { type: 'string', description: 'Natural-language user request, for example making a scene more tense.' },
      query: { type: 'string', description: 'Single search query alias. Prefer queries for multiple terms.' },
      queries: { type: 'array', items: { type: 'string' }, description: 'Candidate terms. Any matching term helps ranking.' },
      must: { type: 'array', items: { type: 'string' }, description: 'Terms that should appear in the returned context window when provided.' },
      should: { type: 'array', items: { type: 'string' }, description: 'Optional ranking terms.' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Terms that exclude a candidate context window.' },
      aliasGroups: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Equivalent names or phrases, e.g. [["Robert","Bob"],["note","letter"]].' },
      windowLines: { type: 'number', description: 'Context window radius around matched lines. Defaults to 6.' },
      limit: { type: 'number', description: 'Maximum candidates to return. Defaults to 5.' },
      contentLimit: { type: 'number', description: 'Compatibility hint for maximum follow-up read size. Use core_file_read contentLimit for actual file reads.' },
      includeExcerpt: { type: 'boolean', description: 'When true, include bounded original text excerpts. Defaults to true.' },
    }),
  },
  {
    name: 'workspace_update',
    description: 'Refresh a MovScript business projection path from the backend database, overwriting local changes under that file or folder. Supports workspace JSON, project.json, script.md, and the read-only user projects index. Legacy snapshot payloads are still accepted for compatibility.',
    inputSchema: objectSchema({
      path: { type: 'string', description: 'Projection file or folder under .movscript/data.' },
      cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
      kind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'] },
      workspaceKind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'] },
      target: { type: 'object', additionalProperties: true },
      content: {},
      snapshot: {},
      proposedValue: {},
      currentValue: {},
      workspaceId: { type: 'string' },
      workspacePath: { type: 'string', description: 'Legacy .movscript-relative projection path alias. Prefer path.' },
      workspace_path: { type: 'string', description: 'Snake-case alias for workspacePath.' },
      projection: { type: 'object', additionalProperties: true, description: 'Legacy projection object. workspacePath is used when content is omitted.' },
    }),
    outputSchema: objectSchema({
      performed: { type: 'boolean' },
      persisted: { type: 'boolean' },
      persistenceOwner: { type: 'string' },
      agentWritable: { type: 'boolean' },
      projection: { type: 'object', additionalProperties: true },
      validation: { type: 'object', additionalProperties: true },
      effects: { type: 'array', items: { type: 'object', additionalProperties: true } },
      saveable: { type: 'boolean' },
    }),
  },
  {
    name: 'workspace_apply_review',
    description: 'Preview what applying a local MovScript business projection file or folder would change in the backend database. This does not write backend entity state.',
    inputSchema: objectSchema({
      path: { type: 'string', description: 'Projection file or folder under .movscript/data.' },
      cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
      userId: { type: 'number' },
    }),
  },
  {
    name: 'workspace_apply',
    description: 'Apply a local MovScript business projection file or folder to the backend database when that projection has a writable backend route. Legacy review payloads are still accepted for frontend review handoff compatibility.',
    inputSchema: objectSchema({
      path: { type: 'string', description: 'Projection file or folder under .movscript/data.' },
      cwd: { type: 'string', description: 'Optional agent thread cwd. Agent sessions should use a .movscript/data projection folder directly.' },
      review: { type: 'object', description: 'Legacy review wrapper. Prefer kind/target/content for new calls.' },
      kind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'] },
      workspaceKind: { type: 'string', enum: ['setting_workspace', 'project_standards_workspace', 'production_workspace', 'content_unit_workspace', 'asset_workspace'] },
      target: { type: 'object', additionalProperties: true },
      content: {},
      snapshot: {},
      proposedValue: {},
      currentValue: {},
      workspaceId: { type: 'string' },
      workspacePath: { type: 'string', description: 'Legacy .movscript-relative projection path alias. When content is omitted, apply reads this file.' },
      workspace_path: { type: 'string', description: 'Snake-case alias for workspacePath.' },
      projection: { type: 'object', additionalProperties: true, description: 'Legacy projection object. workspacePath is used when content is omitted.' },
      userId: { type: 'number' },
    }),
    outputSchema: objectSchema({
      performed: { type: 'boolean' },
      submitted: { type: 'boolean' },
      changeSubmitted: { type: 'boolean' },
      materialized: { type: 'boolean' },
      applyBoundary: { type: 'string' },
      method: { type: 'string' },
      plannedUrl: { type: 'string' },
      projection: { type: 'object', additionalProperties: true },
      changeSubmission: { type: 'object', additionalProperties: true },
      handoff: { type: 'object', additionalProperties: true },
      projectionMeta: { type: 'object', additionalProperties: true },
      validation: { type: 'object', additionalProperties: true },
      effects: { type: 'array', items: { type: 'object', additionalProperties: true } },
      saveable: { type: 'boolean' },
    }),
  },
]

const generationTools = [
  {
    name: 'generation_model_list',
    description: 'List enabled MovScript generation models and versioned model contracts. Use this before image/video generation to select a valid model_id and supported parameters.',
    inputSchema: objectSchema({
      capability: { type: 'string', description: 'Optional capability filter such as image, image_edit, video, video_i2v, video_v2v, audio_tts, audio_transcribe, subtitle_align, or render_video.' },
      provider_variants: { type: 'boolean' },
      include_provider_variants: { type: 'boolean' },
    }),
  },
  {
    name: 'generation_image_generate',
    description: 'Submit an image generation job. Supports text-to-image and image-to-image when input_resource_ids or reference_resource_ids are MovScript RawResource IDs from movscript_resource_library_query. Returns a job id plus a monitor tool call.',
    inputSchema: objectSchema({
      prompt: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      negative_prompt: { type: 'string' },
      model_id: { type: 'string' },
      project_id: { type: 'number' },
      projectId: { type: 'number' },
      input_resource_ids: { type: 'array', items: { type: 'number' } },
      reference_resource_ids: { type: 'array', items: { type: 'number' } },
      aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'] },
      image_size: { type: 'string' },
      quality: { type: 'string', enum: ['auto', 'standard', 'hd', 'high', 'medium', 'low'] },
      steps: { type: 'number', minimum: 1 },
      seed: { type: 'number' },
      extra_params: { type: 'object', additionalProperties: true },
      timeout_ms: { type: 'number', minimum: 1 },
      poll_interval_ms: { type: 'number', minimum: 1 },
    }, ['prompt']),
  },
  {
    name: 'generation_image_job_get',
    description: 'Fetch the latest state of an image generation job submitted by generation_image_generate. Terminal results include output_resource_ids when available.',
    inputSchema: objectSchema({
      jobId: { type: 'number', minimum: 1 },
      job_id: { type: 'number', minimum: 1 },
    }),
  },
  {
    name: 'generation_video_generate',
    description: 'Submit a video generation job. Supports text-to-video and image-to-video when input_resource_ids or reference_resource_ids are MovScript RawResource IDs from movscript_resource_library_query. Returns a job id plus a monitor tool call.',
    inputSchema: objectSchema({
      prompt: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      model_id: { type: 'string' },
      project_id: { type: 'number' },
      projectId: { type: 'number' },
      input_resource_ids: { type: 'array', items: { type: 'number' } },
      reference_resource_ids: { type: 'array', items: { type: 'number' } },
      aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
      duration: { type: 'number', minimum: 1 },
      quality: { type: 'string', enum: ['auto', 'standard', 'high', 'medium', 'low'] },
      fps: { type: 'number', minimum: 1 },
      seed: { type: 'number' },
      extra_params: { type: 'object', additionalProperties: true },
      timeout_ms: { type: 'number', minimum: 1 },
      poll_interval_ms: { type: 'number', minimum: 1 },
    }, ['prompt']),
  },
  {
    name: 'generation_video_job_get',
    description: 'Fetch the latest state of a video generation job submitted by generation_video_generate. Terminal results include output_resource_ids when available.',
    inputSchema: objectSchema({
      jobId: { type: 'number', minimum: 1 },
      job_id: { type: 'number', minimum: 1 },
    }),
  },
  {
    name: 'candidate_asset_slot_attach',
    description: 'Attach an existing generated resource as a reviewable candidate for an asset slot. Use after generation succeeds and output_resource_id is available.',
    inputSchema: objectSchema({
      projectId: { type: 'number' },
      asset_slot_id: { type: 'number', minimum: 1 },
      assetSlotId: { type: 'number', minimum: 1 },
      resource_id: { type: 'number', minimum: 1 },
      resourceId: { type: 'number', minimum: 1 },
      output_resource_id: { type: 'number', minimum: 1 },
      outputResourceId: { type: 'number', minimum: 1 },
      resource_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      resourceIds: { type: 'array', items: { type: 'number', minimum: 1 } },
      output_resource_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      outputResourceIds: { type: 'array', items: { type: 'number', minimum: 1 } },
      jobId: { type: 'number' },
      note: { type: 'string' },
    }),
  },
  {
    name: 'candidate_keyframe_attach',
    description: 'Attach an existing generated resource as a reviewable candidate for an original target keyframe / visual anchor. Use after generation succeeds and output_resource_id is available.',
    inputSchema: objectSchema({
      projectId: { type: 'number' },
      keyframe_id: { type: 'number', minimum: 1 },
      keyframeId: { type: 'number', minimum: 1 },
      target_keyframe_id: { type: 'number', minimum: 1 },
      targetKeyframeId: { type: 'number', minimum: 1 },
      resource_id: { type: 'number', minimum: 1 },
      resourceId: { type: 'number', minimum: 1 },
      output_resource_id: { type: 'number', minimum: 1 },
      outputResourceId: { type: 'number', minimum: 1 },
      resource_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      resourceIds: { type: 'array', items: { type: 'number', minimum: 1 } },
      output_resource_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      outputResourceIds: { type: 'array', items: { type: 'number', minimum: 1 } },
      jobId: { type: 'number' },
      title: { type: 'string' },
      description: { type: 'string' },
      prompt: { type: 'string' },
      note: { type: 'string' },
    }),
  },
]

const queryTools = [
  {
    name: 'movscript_resource_library_query',
    description: 'Query MovScript RawResources stored in the internal resource library. Use returned RawResource.ID values as input_resource_ids or reference_resource_ids for generation.',
    inputSchema: objectSchema({
      query: { type: 'string', description: 'Search resource names.' },
      q: { type: 'string', description: 'Alias for query.' },
      resource_id: { type: 'number', description: 'Optional RawResource ID to filter the requested page.' },
      resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
      id: { type: 'number', description: 'Alias for resource_id.' },
      type: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'file'], description: 'Optional MovScript resource type filter.' },
      media_type: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'file'], description: 'Alias for type.' },
      scope: { type: 'string', enum: ['personal', 'team'], description: 'Optional library scope. Omit for the unified visible library.' },
      folder_id: { type: 'string', description: 'Optional folder filter. Use "root" or "0" for unfiled resources.' },
      folderId: { type: 'string', description: 'Camel-case alias for folder_id.' },
      page: { type: 'number', description: '1-based page number. Defaults to 1.' },
      page_size: { type: 'number', description: 'Page size, clamped to 1-100. Defaults to 20.' },
      pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
      limit: { type: 'number', description: 'Alias for page_size.' },
      include_full: { type: 'boolean', description: 'When true, return full backend RawResource records.' },
      includeFull: { type: 'boolean', description: 'Camel-case alias for include_full.' },
    }),
  },
  {
    name: 'movscript_resource_image_read',
    description: 'Read a MovScript image RawResource and return it as MCP image content for provider vision. Use when the provider needs to inspect actual image pixels.',
    inputSchema: objectSchema({
      resource_id: { type: 'number', description: 'MovScript RawResource ID.' },
      resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
      id: { type: 'number', description: 'Alias for resource_id.' },
      max_bytes: { type: 'number', description: 'Maximum image file size to return. Defaults to 8 MiB.' },
      maxBytes: { type: 'number', description: 'Camel-case alias for max_bytes.' },
      mime_type: { type: 'string', description: 'Optional MIME type override when backend headers are missing.' },
      mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },
    }),
  },
  {
    name: 'movscript_resource_video_extract_frames',
    description: 'Download a MovScript video RawResource, extract representative or precise frames with ffmpeg, and return them as MCP image content for provider vision. Supports overview, timestamps, range, and burst sampling. The original video is not sent to the model.',
    inputSchema: objectSchema({
      resource_id: { type: 'number', description: 'MovScript RawResource ID.' },
      resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
      id: { type: 'number', description: 'Alias for resource_id.' },
      mode: { type: 'string', enum: ['overview', 'timestamps', 'range', 'burst'], description: 'Sampling mode: overview, exact timestamps, time range, or burst window around a center timestamp.' },
      count: { type: 'number', description: 'Overview frame count. Defaults to 4.' },
      frame_count: { type: 'number', description: 'Alias for count.' },
      max_frames: { type: 'number', description: 'Maximum frames returned for any mode. Defaults to 12, hard-capped at 24.' },
      maxFrames: { type: 'number', description: 'Camel-case alias for max_frames.' },
      max_video_bytes: { type: 'number', description: 'Maximum source video file size to download for extraction. Defaults to 200 MiB.' },
      maxVideoBytes: { type: 'number', description: 'Camel-case alias for max_video_bytes.' },
      timestamps_sec: { type: 'array', items: { type: 'number' }, description: 'Optional exact timestamps in seconds.' },
      timestampsSec: { type: 'array', items: { type: 'number' }, description: 'Camel-case alias for timestamps_sec.' },
      start_sec: { type: 'number', description: 'Start timestamp when timestamps_sec is omitted.' },
      startSec: { type: 'number', description: 'Camel-case alias for start_sec.' },
      end_sec: { type: 'number', description: 'End timestamp for range sampling.' },
      endSec: { type: 'number', description: 'Camel-case alias for end_sec.' },
      center_sec: { type: 'number', description: 'Center timestamp for burst sampling.' },
      centerSec: { type: 'number', description: 'Camel-case alias for center_sec.' },
      window_sec: { type: 'number', description: 'Window length in seconds for burst sampling. Defaults to 2.' },
      windowSec: { type: 'number', description: 'Camel-case alias for window_sec.' },
      fps: { type: 'number', description: 'Range/burst sampling frequency in frames per second. Defaults to 2, capped at 6.' },
      interval_sec: { type: 'number', description: 'Sampling interval in seconds when timestamps_sec is omitted. Defaults to 3.' },
      intervalSec: { type: 'number', description: 'Camel-case alias for interval_sec.' },
      max_width: { type: 'number', description: 'Maximum output frame width. Defaults to 960.' },
      maxWidth: { type: 'number', description: 'Camel-case alias for max_width.' },
      image_format: { type: 'string', enum: ['jpeg', 'png'], description: 'Output frame format. Defaults to jpeg.' },
      imageFormat: { type: 'string', enum: ['jpeg', 'png'], description: 'Camel-case alias for image_format.' },
    }),
  },
  {
    name: 'movscript_resource_image_annotate',
    description: 'Create a simple agent-authored visual guidance image by overlaying structured annotations on a MovScript image resource, data URL, or local artifact. Outputs an SVG artifact plus MCP image content for review.',
    inputSchema: objectSchema({
      resource_id: { type: 'number', description: 'Optional MovScript image RawResource ID used as the annotation background.' },
      resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
      id: { type: 'number', description: 'Alias for resource_id.' },
      data_url: { type: 'string', description: 'Optional image data URL used as the annotation background.' },
      dataUrl: { type: 'string', description: 'Camel-case alias for data_url.' },
      local_path: { type: 'string', description: 'Optional local image path used as the annotation background.' },
      localPath: { type: 'string', description: 'Camel-case alias for local_path.' },
      artifact_path: { type: 'string', description: 'Alias for local_path, useful for annotating a previous agent artifact.' },
      artifactPath: { type: 'string', description: 'Camel-case alias for artifact_path.' },
      mime_type: { type: 'string', description: 'Optional source image MIME type override.' },
      mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },
      width: { type: 'number', description: 'SVG coordinate width. Defaults to source image width when readable.' },
      height: { type: 'number', description: 'SVG coordinate height. Defaults to source image height when readable.' },
      title: { type: 'string', description: 'Artifact title used in metadata and default filename.' },
      note: { type: 'string', description: 'Optional note rendered at the bottom of the annotation image.' },
      annotations: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Structured shapes. Supported type values: rect, circle, line, arrow, text, highlight.' },
      shapes: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Alias for annotations.' },
      output_path: { type: 'string', description: 'Optional absolute output path for the generated SVG artifact.' },
      outputPath: { type: 'string', description: 'Camel-case alias for output_path.' },
      workspace_path: { type: 'string', description: 'Optional output path under the frontend-owned .movscript workspace root.' },
      workspacePath: { type: 'string', description: 'Camel-case alias for workspace_path.' },
      workspaceDir: { type: 'string', description: 'Optional MovScript workspace root directory. Defaults to the desktop workspace root.' },
    }),
  },
  {
    name: 'movscript_resource_upload',
    description: 'Upload an agent-created image artifact to the MovScript RawResource library. Use the returned resource_id in generation input_resource_ids/reference_resource_ids.',
    inputSchema: objectSchema({
      artifact_path: { type: 'string', description: 'Local artifact path returned by movscript_resource_image_annotate or another agent tool.' },
      artifactPath: { type: 'string', description: 'Camel-case alias for artifact_path.' },
      local_path: { type: 'string', description: 'Local file path to upload.' },
      localPath: { type: 'string', description: 'Camel-case alias for local_path.' },
      path: { type: 'string', description: 'Alias for local_path.' },
      workspace_path: { type: 'string', description: 'Path under the frontend-owned .movscript workspace root.' },
      workspacePath: { type: 'string', description: 'Camel-case alias for workspace_path.' },
      workspaceDir: { type: 'string', description: 'Optional MovScript workspace root directory. Defaults to the desktop workspace root.' },
      data_url: { type: 'string', description: 'Image data URL to upload.' },
      dataUrl: { type: 'string', description: 'Camel-case alias for data_url.' },
      base64: { type: 'string', description: 'Base64 image payload without the data URL prefix.' },
      filename: { type: 'string', description: 'Resource filename.' },
      name: { type: 'string', description: 'Alias for filename.' },
      mime_type: { type: 'string', description: 'Upload MIME type. Defaults from filename or image/png.' },
      mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },
      folder_id: { type: 'string', description: 'Optional resource library folder ID.' },
      folderId: { type: 'string', description: 'Camel-case alias for folder_id.' },
      max_bytes: { type: 'number', description: 'Maximum upload input size. Defaults to 20 MiB.' },
      maxBytes: { type: 'number', description: 'Camel-case alias for max_bytes.' },
      userId: { type: 'number', description: 'Optional user ID override for backend requests.' },
    }),
  },
  {
    name: 'movscript_shot_library_query',
    description: 'Query the MovScript shot reference library for reusable camera, composition, movement, narrative, emotion, and production patterns before image/video generation.',
    inputSchema: objectSchema({
      query: { type: 'string' },
      q: { type: 'string' },
      shot_reference_id: { type: 'number' },
      shotReferenceId: { type: 'number' },
      id: { type: 'number' },
      page: { type: 'number' },
      page_size: { type: 'number' },
      pageSize: { type: 'number' },
      limit: { type: 'number' },
      include_full: { type: 'boolean' },
      includeFull: { type: 'boolean' },
    }),
  },
  {
    name: 'movscript_external_resource_source_list',
    description: 'List configured external media search sources such as Pexels or Pixabay. Use this when choosing a source_id for external media search.',
    inputSchema: objectSchema({
      include_disabled: { type: 'boolean', description: 'When true, include disabled sources.' },
      includeDisabled: { type: 'boolean', description: 'Camel-case alias for include_disabled.' },
    }),
  },
  {
    name: 'movscript_external_resource_search',
    description: 'Search external image/video providers configured in MovScript. Results are external media candidates and must be imported into MovScript before they can be used as generation resource IDs.',
    inputSchema: objectSchema({
      query: { type: 'string', description: 'Search query, e.g. neon city street, handheld office scene, product packshot.' },
      q: { type: 'string', description: 'Alias for query.' },
      source_id: { type: 'number', description: 'External resource source ID. Omit to use the first enabled source.' },
      sourceId: { type: 'number', description: 'Camel-case alias for source_id.' },
      media_type: { type: 'string', enum: ['image', 'video'], description: 'Optional media type filter.' },
      mediaType: { type: 'string', enum: ['image', 'video'], description: 'Camel-case alias for media_type.' },
      orientation: { type: 'string', enum: ['all', 'landscape', 'portrait', 'square'], description: 'Optional orientation filter.' },
      page: { type: 'number', description: '1-based page number. Defaults to 1.' },
      page_size: { type: 'number', description: 'Page size, clamped to 1-80. Defaults to 20.' },
      pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
      limit: { type: 'number', description: 'Alias for page_size.' },
    }),
  },
  {
    name: 'movscript_creative_reference_query',
    description: 'Query project creative references and setting materials such as characters, places, props, style rules, and restrictions.',
    inputSchema: objectSchema({
      projectId: { type: 'number' },
      creative_reference_id: { type: 'number' },
      kind: { type: 'string' },
      status: { type: 'string' },
      query: { type: 'string' },
      include_states: { type: 'boolean' },
      include_usages: { type: 'boolean' },
      include_relationships: { type: 'boolean' },
      include_asset_slots: { type: 'boolean' },
      limit: { type: 'number' },
    }),
  },
  {
    name: 'movscript_asset_slot_query',
    description: 'Query project asset slots and candidate requirements for generated image/video resources.',
    inputSchema: objectSchema({
      projectId: { type: 'number' },
      asset_slot_id: { type: 'number' },
      creative_reference_id: { type: 'number' },
      creative_reference_state_id: { type: 'number' },
      owner_type: { type: 'string' },
      owner_id: { type: 'number' },
      production_id: { type: 'number' },
      status: { type: 'string' },
      query: { type: 'string' },
      include_internal: { type: 'boolean' },
      include_candidates: { type: 'boolean' },
      limit: { type: 'number' },
    }),
  },
  {
    name: 'movscript_production_context_query',
    description: 'Query productions, segments, scene moments, content units, and official keyframes for image/video generation context.',
    inputSchema: objectSchema({
      projectId: { type: 'number' },
      production_id: { type: 'number' },
      segment_id: { type: 'number' },
      scene_moment_id: { type: 'number' },
      content_unit_id: { type: 'number' },
      status: { type: 'string' },
      query: { type: 'string' },
      include: { type: 'array', items: { type: 'string' } },
      include_generation_context: { type: 'boolean' },
      intent: { type: 'string', enum: ['keyframe', 'video'] },
      limit: { type: 'number' },
    }),
  },
]

const fallbackTools = [
  ...generationTools,
  ...queryTools,
  ...workspaceTools,
]

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    const message = JSON.parse(trimmed)
    const response = await handleMessage(message)
    if (response !== undefined) writeMessage(response)
  } catch (error) {
    writeMessage(makeError(null, -32700, 'Parse error', errorMessage(error)))
  }
})

rl.on('close', () => {
  process.exit(0)
})

async function handleMessage(message) {
  const id = Object.prototype.hasOwnProperty.call(message, 'id') ? message.id ?? null : undefined
  if (debug) log(`recv method=${message?.method ?? ''} id=${id ?? '(notification)'}`)
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (id === undefined) return undefined
    return makeError(id, -32600, 'Invalid Request')
  }

  switch (message.method) {
    case 'initialize':
      return makeResult(id, {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'movscript-provider-bridge', version: '0.1.2' },
        capabilities: { tools: {}, resources: {} },
      })
    case 'initialized':
    case 'notifications/initialized':
    case 'notifications/cancelled':
    case 'notifications/progress':
      return undefined
    case 'ping':
      return makeResult(id, {})
    case 'tools/list':
      return makeResult(id, { tools: await listTools() })
    case 'tools/call':
      return forwardToDesktop(message, id)
    case 'resources/list':
      return listResources(id)
    case 'resources/read':
      return forwardToDesktop(message, id)
    default:
      if (id === undefined) return undefined
      return makeError(id, -32601, `Method not found: ${message.method}`)
  }
}

async function listTools() {
  const desktop = await tryDesktopRPC({ jsonrpc: '2.0', id: 'tools-list', method: 'tools/list' }, discoveryTimeoutMs)
  if (desktop?.result?.tools && Array.isArray(desktop.result.tools)) {
    return mergeTools(desktop.result.tools, fallbackTools)
  }
  return fallbackTools
}

async function listResources(id) {
  if (id === undefined) return undefined
  const desktop = await tryDesktopRPC({ jsonrpc: '2.0', id, method: 'resources/list' }, discoveryTimeoutMs)
  if (desktop?.error) return makeError(id, desktop.error.code ?? -32000, desktop.error.message ?? 'MovScript Desktop MCP error', desktop.error.data)
  if (desktop?.result) return makeResult(id, desktop.result)
  return makeResult(id, {
    resources: [
      {
        uri: 'movscript://shot-library',
        name: 'Shot reference library',
        description: 'Searchable shot-reference index for reusable camera, composition, motion, narrative, emotion, and production patterns. Requires MovScript Desktop MCP to read.',
        mimeType: 'text/markdown',
      },
      {
        uri: 'movscript://resource-library',
        name: 'MovScript resource library',
        description: 'Internal MovScript RawResource library for image/video/text/audio files. Use movscript_resource_library_query for generation-ready RawResource IDs. Requires MovScript Desktop MCP to read.',
        mimeType: 'text/markdown',
      },
      {
        uri: 'movscript://resource-file/{resource_id}',
        name: 'MovScript resource file',
        description: 'Dynamic binary RawResource reader. Replace {resource_id} with an ID. Prefer movscript_resource_image_read and movscript_resource_video_extract_frames for provider vision workflows.',
        mimeType: 'application/octet-stream',
      },
      {
        uri: 'movscript://external-resources',
        name: 'External media search sources',
        description: 'Configured external image/video providers. Use movscript_external_resource_search for provider search; import results before generation. Requires MovScript Desktop MCP to read.',
        mimeType: 'text/markdown',
      },
    ],
  })
}

async function forwardToDesktop(message, id) {
  if (id === undefined) return undefined
  try {
    const rpc = await desktopRPC({
      jsonrpc: '2.0',
      id,
      method: message.method,
      params: message.params,
    })
    if (rpc.error) return makeError(id, rpc.error.code ?? -32000, rpc.error.message ?? 'MovScript Desktop MCP error', rpc.error.data)
    return makeResult(id, rpc.result)
  } catch (error) {
    return makeError(id, -32000, `MovScript Desktop MCP is not reachable at ${endpoint}: ${errorMessage(error)}`)
  }
}

async function tryDesktopRPC(message, timeoutMs) {
  try {
    return await desktopRPC(message, timeoutMs)
  } catch (error) {
    if (debug) log(`desktop discovery skipped: ${errorMessage(error)}`)
    return undefined
  }
}

async function desktopRPC(message, timeoutMs) {
  const controller = timeoutMs > 0 ? new AbortController() : undefined
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      ...(controller ? { signal: controller.signal } : {}),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`MovScript Desktop MCP HTTP ${response.status}: ${preview(text)}`)
    }
    if (!text.trim()) {
      throw new Error(`MovScript Desktop MCP returned an empty response from ${endpoint}`)
    }
    return JSON.parse(text)
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function mergeTools(primary, fallback) {
  const result = []
  const seen = new Set()
  for (const tool of [...primary, ...fallback]) {
    if (!tool || typeof tool.name !== 'string' || seen.has(tool.name)) continue
    seen.add(tool.name)
    result.push(tool)
  }
  return result
}

function objectSchema(properties, required = []) {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function makeResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function makeError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function preview(value) {
  return value.length <= 500 ? value : `${value.slice(0, 500)}...`
}

function log(message) {
  process.stderr.write(`[movscript-mcp-bridge] ${message}\n`)
}

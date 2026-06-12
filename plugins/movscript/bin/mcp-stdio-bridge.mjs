#!/usr/bin/env node
import readline from 'node:readline'

const DEFAULT_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_ENDPOINT
const debug = process.env.MOVSCRIPT_MCP_BRIDGE_DEBUG === '1'
const discoveryTimeoutMs = Number(process.env.MOVSCRIPT_MCP_BRIDGE_DISCOVERY_TIMEOUT_MS || 750)

const workspaceTools = [
  {
    name: 'movscript_focus_get',
    description: 'Return the current MovScript task focus: route, selected project, active production id, and selected entity. This does not load project lists, scripts, workspaces, or resources.',
    inputSchema: objectSchema({}),
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
    name: 'movscript_workspace_get_model',
    description: 'Return the movscript-lang workspace model for one editable domain entity: editable source paths, context paths, schema ids, supported write APIs, and agent instructions. Call this before direct file edits. This is project-scoped and does not write files.',
    inputSchema: projectSchema({
      ...workspaceLocatorProperties(),
      entityKind: { type: 'string', description: 'Domain entity kind, for example setting, asset, production, content_unit, or keyframe.' },
      entity_kind: { type: 'string', description: 'Alias for entityKind.' },
      entityId: { type: ['string', 'number'], description: 'Optional entity id used to expand editable path hints.' },
      entity_id: { type: ['string', 'number'], description: 'Alias for entityId.' },
    }, ['entityKind']),
  },
  {
    name: 'movscript_workspace_review',
    description: 'Inspect current source edits by comparing .interpret/current with source files. Reports changed files, changed entities, schema/domain issues, and interpret readiness. This does not make edits effective.',
    inputSchema: projectSchema(workspaceLocatorProperties()),
  },
  {
    name: 'movscript_workspace_interpret',
    description: 'Interpret current source files into .interpret/current and .interpret/indexes. Interpret must succeed before edits become current effective workspace state.',
    inputSchema: projectSchema(workspaceLocatorProperties()),
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
      project_id: { type: ['string', 'number'], description: 'Required project id. MCP never infers project from session, cwd, route, or focus.' },
      projectId: { type: ['string', 'number'], description: 'Alias for project_id.' },
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
      project_id: { type: ['string', 'number'], description: 'Required project id. MCP never infers project from session, cwd, route, or focus.' },
      projectId: { type: ['string', 'number'], description: 'Alias for project_id.' },
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
      workspace_path: { type: 'string', description: 'Optional output path under the MovScript .movscript workspace root.' },
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
      workspace_path: { type: 'string', description: 'Path under the MovScript .movscript workspace root.' },
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
]

const systemTools = [
  ...renameTools(workspaceTools, {
    movscript_focus_get: 'system_focus_get',
    movscript_project_create: 'system_project_create',
  }),
  ...renameTools(generationTools, {
    generation_model_list: 'system_model_list',
    generation_image_generate: 'system_generate_image',
    generation_image_job_get: 'system_generate_image_job_get',
    generation_video_generate: 'system_generate_video',
    generation_video_job_get: 'system_generate_video_job_get',
  }),
  ...renameTools(queryTools, {
    movscript_resource_library_query: 'system_resource_library_query',
    movscript_resource_image_read: 'system_resource_image_read',
    movscript_resource_video_extract_frames: 'system_resource_video_extract_frames',
    movscript_resource_image_annotate: 'system_resource_image_annotate',
    movscript_resource_upload: 'system_resource_upload',
    movscript_shot_library_query: 'system_shot_library_query',
    movscript_external_resource_source_list: 'system_external_resource_source_list',
    movscript_external_resource_search: 'system_external_resource_search',
  }),
]

const domainTools = [
  ...renameTools(workspaceTools, {
    movscript_workspace_get_model: 'domain_get_model',
    movscript_workspace_review: 'domain_review',
    movscript_workspace_interpret: 'domain_interpret',
  }),
  {
    name: 'domain_query_entities',
    description: 'Query indexed MovScript domain entities from source/current indexes by entity kind, ids, path context, or free text. Use this before reading many files.',
    inputSchema: projectSchema(domainQueryProperties()),
  },
  {
    name: 'domain_query_settings',
    description: 'Query MovScript setting domain entities such as characters, locations, props, world rules, and styles.',
    inputSchema: projectSchema(domainQueryProperties()),
  },
  {
    name: 'domain_query_assets',
    description: 'Query MovScript setting-owned and setting-state-owned asset slots, optionally including inline candidates.',
    inputSchema: projectSchema({ ...domainQueryProperties(), includeCandidates: { type: 'boolean' }, include_candidates: { type: 'boolean' } }),
  },
  {
    name: 'domain_query_production_context',
    description: 'Query production planning context: productions, segments, scene moments, storyboards, audio cues, expression units, content units, and candidate-bearing production slots.',
    inputSchema: projectSchema({ ...domainQueryProperties(), include: { type: 'array', items: { type: 'string' } } }),
  },
  {
    name: 'domain_derive_content_unit_artifact',
    description: 'Derive the interpreter artifact bundle for a content unit, including runtime panel, input version, dependency report, and selection validity. Use before generation or candidate selection when content-unit context may be stale.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
  },
  {
    name: 'domain_read_preview_timeline',
    description: 'Read an interpreted production preview timeline from .interpret/current. This is read-only interpreted output.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), productionId: { type: ['string', 'number'] }, production_id: { type: ['string', 'number'] } }),
  },
  {
    name: 'domain_read_content_unit_runtime_panel',
    description: 'Read an interpreted content unit runtime panel from .interpret/current. This is read-only interpreted output.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
  },
  {
    name: 'domain_read_content_unit_generation_prompt',
    description: 'Read an interpreted normalized content unit generation prompt from .interpret/current. This is read-only interpreted output.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
  },
  {
    name: 'domain_read_content_unit_dependency_report',
    description: 'Read an interpreted content unit dependency report from .interpret/current. This is read-only interpreted output.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
  },
  {
    name: 'domain_read_content_unit_selection_validity',
    description: 'Read an interpreted content unit selection validity report from .interpret/current. This is read-only interpreted output.',
    inputSchema: projectSchema({ ...workspaceLocatorProperties(), contentUnitId: { type: ['string', 'number'] }, content_unit_id: { type: ['string', 'number'] } }),
  },
  ...[
    ['domain_upsert_project_standards', 'Create or update project-wide creative standards in source project_standards.json. Run inspect/review and interpret after this write.'],
    ['domain_upsert_setting', 'Create or update a MovScript setting source entity. Put the setting data to write in required payload; record/entity are optional existing-context objects only. Prefer this API over direct file edits for setting records.'],
    ['domain_upsert_asset', 'Create or update a MovScript asset slot source entity under a setting or setting state. Put the asset data to write in required payload; record/entity are optional existing-context objects only. Store RawResource references by resource_id, not binaries or external URLs.'],
    ['domain_upsert_script', 'Create or update a script source record and script.md text. Prefer this API over hand-editing script metadata plus markdown.'],
    ['domain_read_script_source', 'Read script.md source text for a script domain entity.'],
    ['domain_snapshot_script_version', 'Create a script version and script blocks from a script Markdown source so downstream production entities can reference stable script blocks.'],
    ['domain_upsert_content_unit', 'Create or update a project-level content unit source record. Content units are independent production slots and do not become owned by storyboards through path nesting.'],
    ['domain_upsert_production', 'Create or update a production source record under productions/.'],
    ['domain_upsert_segment', 'Create or update a segment source record inside a production.'],
    ['domain_upsert_scene_moment', 'Create or update a scene_moment source record inside a segment.'],
    ['domain_upsert_shot', 'Create or update a shot source record inside a scene_moment.'],
    ['domain_upsert_keyframe', 'Create or update a keyframe source entity under a shot.'],
    ['domain_upsert_storyboard', 'Create or update a storyboard source record under production/segment/scene_moment/shot. Use this when an agent turns shot-group entries into editable MovScript storyboards before creating candidates.'],
    ['domain_upsert_audio_cue', 'Create or update an audio_cue source entity under a scene_moment.'],
    ['domain_upsert_expression_unit', 'Create or update an expression_unit source entity under a scene_moment.'],
    ['domain_update_content_unit_prompt', 'Update a content unit edit_prompt source field. Run inspect/review, interpret, and regeneration planning when prompt changes may stale candidates.'],
    ['domain_update_entity_transition', 'Update an entity transition boundary on the source entity that owns transition semantics.'],
    ['domain_update_storyboard_timeline', 'Update a storyboard timeline source field. Storyboard order and timing belong on storyboard timeline entities, not on generated interpreted output.'],
    ['domain_append_candidate', 'Append an inline candidate to an asset, keyframe, or content unit source entity. Generated resources become domain state only after candidate/selection writes and interpret.'],
    ['domain_create_content_candidate', 'Create an external content candidate record for a content unit output. Use for generated content-unit media rather than embedding provider job state in domain JSON.'],
    ['domain_create_content_candidate_batch', 'Create multiple external content candidate records for content unit outputs. Each item accepts the same fields as domain_create_content_candidate.'],
    ['domain_create_asset_slot_candidate', 'Create an asset-slot candidate using the MovScript workspace candidate service. If targetRecord carries a workspace path, this appends an inline candidate to that asset source entity.'],
    ['domain_create_keyframe_candidate', 'Create a keyframe candidate using the MovScript workspace candidate service. If keyframes are represented as content units in the active model, use the content-unit candidate flow instead.'],
    ['domain_select_content_unit_candidate', 'Select a content candidate for a content unit using the workspace selection record. Selection is a source write and must be followed by inspect/review and interpret.'],
    ['domain_select_content_unit_candidate_batch', 'Select content candidates for multiple content units using workspace selection records.'],
    ['domain_select_candidate', 'Select and lock an inline candidate on an asset, keyframe, or content unit source entity.'],
    ['domain_update_candidate', 'Update an inline candidate on an asset, keyframe, or content unit source entity.'],
    ['domain_unlock_candidate', 'Remove an inline candidate lock from an asset, keyframe, or content unit source entity.'],
    ['domain_delete_entity', 'Delete a MovScript domain source entity file through the workspace service. Do not delete .interpret output directly.'],
    ['domain_overview', 'Show MovScript source state, last successful interpreted state, pending edits, stale generated outputs, and recommended next actions.'],
    ['domain_inspect', 'Inspect current source changes, diagnostics, and predicted impact without writing derived artifacts. Use after API writes or direct file edits.'],
    ['domain_interpret', 'Interpret current source files into .interpret/current, .interpret/indexes, and stable derived artifacts. Interpret must succeed before edits become current effective project state.'],
    ['domain_regeneration_plan', 'Plan regeneration targets after interpret based on changed source entities, dependency impact, stale prompts, and stale content unit selections.'],
  ].map(([name, description]) => ({
    name,
    description,
    inputSchema: projectSchema({
      ...workspaceLocatorProperties(),
      payload: { type: 'object', additionalProperties: true },
      record: { type: 'object', additionalProperties: true },
      entity: { type: 'object', additionalProperties: true },
      targetPath: { type: 'string' },
      target_path: { type: 'string' },
      targetKind: { type: 'string', enum: ['asset', 'keyframe', 'content_unit'] },
      target_kind: { type: 'string', enum: ['asset', 'keyframe', 'content_unit'] },
      candidateId: { type: 'string' },
      candidate_id: { type: 'string' },
      contentUnitId: { type: ['string', 'number'] },
      content_unit_id: { type: ['string', 'number'] },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      unit: { type: 'object', additionalProperties: true },
      production: { type: 'object', additionalProperties: true },
      segment: { type: 'object', additionalProperties: true },
      sceneMoment: { type: 'object', additionalProperties: true },
      scene_moment: { type: 'object', additionalProperties: true },
      shot: { type: 'object', additionalProperties: true },
      keyframe: { type: 'object', additionalProperties: true },
      storyboard: { type: 'object', additionalProperties: true },
      audioCue: { type: 'object', additionalProperties: true },
      audio_cue: { type: 'object', additionalProperties: true },
      expressionUnit: { type: 'object', additionalProperties: true },
      expression_unit: { type: 'object', additionalProperties: true },
      outputs: { type: 'array', items: { type: 'object', additionalProperties: true } },
      productionId: { type: ['string', 'number'] },
      production_id: { type: ['string', 'number'] },
      segmentId: { type: ['string', 'number'] },
      segment_id: { type: ['string', 'number'] },
      sceneMomentId: { type: ['string', 'number'] },
      scene_moment_id: { type: ['string', 'number'] },
      shotId: { type: ['string', 'number'] },
      shot_id: { type: ['string', 'number'] },
      keyframeId: { type: ['string', 'number'] },
      keyframe_id: { type: ['string', 'number'] },
      acceptedInputHash: { type: 'string' },
      accepted_input_hash: { type: 'string' },
      stalePolicy: { type: 'string' },
      stale_policy: { type: 'string' },
    }, ['domain_upsert_setting', 'domain_upsert_asset'].includes(name) ? ['payload'] : []),
  })),
]

const fallbackTools = [
  ...systemTools,
  ...domainTools,
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

function renameTools(tools, names) {
  return tools
    .filter((tool) => names[tool.name])
    .map((tool) => ({
      ...tool,
      name: names[tool.name],
      description: `${tool.description} Alias for ${tool.name}.`,
}))
}

function workspaceLocatorProperties() {
  return {
    workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    projectId: { type: ['string', 'number'], description: 'Required project id for project-scoped tools. MCP never infers project from session, cwd, route, or focus.' },
    project_id: { type: ['string', 'number'], description: 'Alias for projectId.' },
  }
}

function domainQueryProperties() {
  return {
    ...workspaceLocatorProperties(),
    entityKind: { type: 'string' },
    entity_kind: { type: 'string' },
    status: { type: 'string' },
    kind: { type: 'string' },
    query: { type: 'string' },
    q: { type: 'string' },
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
}

function projectSchema(properties, required = []) {
  return objectSchema(properties, required)
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

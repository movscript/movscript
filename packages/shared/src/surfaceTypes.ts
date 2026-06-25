export interface User {
  ID: number
  username: string
  system_role: 'super_admin' | 'user'
}

export interface OrgMembership {
  org_id: number
  org_name: string
  org_slug?: string
  is_personal?: boolean
  status?: string
  role?: string
}

export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: User
  project_uid?: string
  workspace_path?: string
  project_path?: string
  local?: boolean
  total_episodes?: number
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ProjectMember {
  ID: number
  project_id: number
  user_id: number
  user?: User
  role: string
}

export type ReviewStatus = 'workspace' | 'under_review' | 'approved' | 'revision'

export interface Script {
  ID: number
  project_id: number
  title: string
  description: string
  content: string
  raw_source?: string
  script_type: string
  source_type?: 'raw' | 'adapted' | 'revised'
  version?: number
  parent_script_id?: number
  episode_id?: number
  assignee_id?: number
  assignee?: User
  author_id: number
  order: number
  summary: string
  characters: string
  character_profiles?: string
  character_relationships?: string
  core_settings: string
  background: string
  scenes_desc: string
  hook: string
  plot_summary: string
  script_points?: string
  planned_scene_count?: number
  planned_character_count?: number
  time_text?: string
  location_text?: string
  structured_characters?: string
  plot_beats?: string
  atmosphere?: string
  structure_json?: string
  entity_candidates?: string
  relationship_candidates?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface RawResource {
  ID: number
  owner_id: number
  org_id?: number
  blob_id?: number
  folder_id?: number
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  name: string
  url: string
  size: number
  mime_type: string
  storage_backend?: string
  storage_key?: string
  direct_url?: string
  owner?: { ID: number; username: string }
  verification_status?: string
  verification_provider?: string
  verified_at?: string
  verification_error?: string
  provider_asset_certifications?: Record<string, Record<string, unknown>>
  provider_generated_artifact?: Record<string, unknown>
}

export interface ResourceFolder {
  ID: number
  owner_id: number
  owner?: { ID: number; username: string }
  name: string
  parent_id?: number
  storage_backend: string
  resource_count: number
  CreatedAt: string
  UpdatedAt: string
}

export interface ExternalResourceSource {
  ID: number
  owner_id: number
  org_id?: number
  name: string
  provider_key: 'pexels' | 'pixabay' | string
  priority: number
  is_enabled: boolean
  masked_config?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ExternalResourceItem {
  provider_key: string
  external_id: string
  media_type: 'image' | 'video' | string
  title?: string
  description?: string
  thumbnail_url: string
  preview_url?: string
  source_url: string
  width?: number
  height?: number
  duration_seconds?: number
  author_name?: string
  author_url?: string
  attribution_text?: string
  license_label?: string
}

export interface ExternalResourceSearchResult {
  total: number
  items: ExternalResourceItem[]
  page: number
  page_size: number
  provider: string
  next_page?: string
  source_name?: string
}

export type ResourceBindingOwnerType =
  | 'project'
  | 'script'
  | 'asset_slot'
  | 'script_version'
  | 'segment'
  | 'scene_moment'
  | 'storyboard_script'
  | 'content_unit'
  | 'keyframe'
  | 'canvas'

export type ResourceBindingRole =
  | 'reference'
  | 'input'
  | 'output'
  | 'workspace'
  | 'final'
  | 'thumbnail'
  | 'attachment'
  | 'source'

export type ResourceBindingStatus = 'workspace' | 'selected' | 'rejected' | 'approved' | 'archived'
export type ResourceBindingSourceType = 'upload' | 'job' | 'canvas' | 'import' | 'manual' | 'legacy'

export interface ResourceBinding {
  ID: number
  project_id: number
  resource_id: number
  resource?: RawResource
  owner_type: ResourceBindingOwnerType
  owner_id: number
  role: ResourceBindingRole
  slot: string
  sort_order: number
  version: number
  is_primary: boolean
  status: ResourceBindingStatus
  source_type: ResourceBindingSourceType
  source_id?: number
  metadata_json: string
  created_by_id?: number
  CreatedAt: string
  UpdatedAt: string
}

export interface PaginatedResponse<T> {
  total: number
  items: T[]
  page: number
  page_size: number
}

export type MediaNodeType = 'text' | 'image' | 'video'
export type ToolNodeType = 'canvas' | 'ref_image_gen' | 'ref_video_gen' | 'multi_angle' | 'style_transfer' | 'motion_imitation' | 'audio_tts'
export type SemanticEntityKind = 'script' | 'segment' | 'scene_moment' | 'setting' | 'asset_slot' | 'content_unit'
export type SpecialNodeType = 'input' | 'output' | 'resource_sink' | 'approval' | 'text_gen' | 'ai_gen' | 'group' | 'plugin_card'
export type PluginNodeType = string & { readonly __pluginNodeType?: unique symbol }
export type NodeType = MediaNodeType | ToolNodeType | SpecialNodeType | PluginNodeType
export type NodeSource = 'upload' | 'ai' | 'manual'
export type CanvasTaskStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'
export type CanvasType = 'inspiration' | 'workflow'
export type CanvasParamType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'number' | 'boolean' | 'resource'
export type CanvasRunStatus = 'pending' | 'running' | 'done' | 'failed'
export type CanvasPortType = CanvasParamType

export interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'boolean' | 'string'
  options?: string[]
  default?: string | number | boolean
  min?: number
  max?: number
  step?: number
  json_schema?: Record<string, unknown>
  conflicts_with?: string[]
  conditional_enum?: ParamConditionalEnum[]
  conditional_const?: ParamConditionalConst[]
  requires_value?: ParamRequiresValue[]
}

export interface ParamConditionalEnum {
  when_param: string
  when_value: string | number | boolean
  options: string[]
}

export interface ParamConditionalConst {
  when_param: string
  when_value: string | number | boolean
  value: string | number | boolean
}

export interface ParamRequiresValue {
  param: string
  value: string | number | boolean
}

export interface ModelInputRequirement {
  min: number
  max: number
}

export interface ModelInputRequirements {
  image: ModelInputRequirement
  video: ModelInputRequirement
}

export type ProviderModelAPIKind = 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'

export interface PublicModel {
  id: number
  catalog_entry_id?: number
  provider_id?: string
  model_id: string
  display_name: string
  short_name?: string
  provider_name?: string
  logical_model_id?: string
  provider_variant_count?: number
  capabilities: string[]
  supported_api_kinds?: ProviderModelAPIKind[]
  accepts_image_input: boolean
  is_default?: boolean
  model_def_id?: string
  model_id_override?: string
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
  supported_params?: ParamDef[]
  input_requirements?: ModelInputRequirements
  params_schema?: Record<string, unknown>
}

export interface Job {
  ID: number
  user_id: number
  model_id?: string
  provider_name?: string
  model_display?: string
  model_identifier?: string
  job_type: string
  feature_key?: string
  title?: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  prompt: string
  extra_params?: string
  aspect_ratio?: string
  duration?: number
  request_context?: string
  input_resource_id?: number
  input_resource_ids?: string
  input_resources?: RawResource[]
  output_resource_id?: number
  output_resource_ids?: number[]
  output_resource?: RawResource
  provider_task_id?: string
  provider_task_kind?: string
  provider_task_status?: string
  provider_task_history?: string
  error_msg?: string
  debug_info?: string
  execution_state?: string
  state_trace?: string
  started_at?: string
  finished_at?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface CanvasNodeModelDiagnostics {
  canvas_id: number
  node_id: string
  node_label: string
  node_type: string
  capability?: string
  status: 'ok' | 'missing_model_selection' | 'route_error' | 'not_applicable' | 'invalid_node_data' | 'ai_service_unavailable' | 'missing_capability' | string
  problems?: string[]
  next_actions?: string[]
  raw_model_fields?: Record<string, unknown>
  data_model_id?: string
  executable?: boolean
  executable_model_id?: string
  available_model_count: number
  available_models?: Array<{
    model_id: string
    display_name: string
    is_default?: boolean
    capabilities?: string[]
  }>
  route?: {
    model_id: string
    provider_model_id?: string
    selection_reason?: string
  }
}

export interface CanvasPortDef {
  id: string
  aliases?: string[]
  label?: string
  labelKey?: string
  type: CanvasPortType
  order?: number
  required?: boolean
  maxCount?: number
  deprecated?: boolean
  description?: string
}

export interface CanvasPortValue {
  type: CanvasPortType
  resource_id?: number
  resource?: RawResource
  text?: string
  json?: unknown
  number?: number
  boolean?: boolean
}

export type CanvasStage = 'script_analysis' | 'asset_prep' | 'storyboard' | 'generation' | 'editing'

export type CanvasExecutableCapability = 'text' | 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v' | 'audio' | 'audio_tts' | 'audio_transcribe' | 'audio_music' | 'audio_sfx' | 'subtitle_align' | 'subtitle_translate'

export interface CanvasExecutableSpec {
  executor: 'ai_model' | 'plugin_http'
  capability: CanvasExecutableCapability
  modelId?: string
  prompt?: string
  inputResourceIds?: number[]
  aspectRatio?: string
  duration?: number
  params?: Record<string, unknown>
}

export interface CanvasNodeData {
  source: NodeSource
  resourceId?: number
  resource?: RawResource
  prompt?: string
  modelId?: string
  referencedCanvasId?: number
  referencedCanvasName?: string
  inputResourceIds?: number[]
  params?: Record<string, unknown>
  status?: CanvasTaskStatus
  taskId?: number
  error?: string
  runDiagnostics?: CanvasNodeModelDiagnostics
  textContent?: string
  inputValue?: string
  paramName?: string
  paramType?: CanvasParamType
  paramOrder?: number
  approvalStatus?: 'waiting' | 'approved' | 'rejected'
  refNodeIds?: string[]
  outputType?: 'image' | 'video' | 'text'
  groupId?: string
  isGroup?: boolean
  groupLabel?: string
  groupWidth?: number
  groupHeight?: number
  cardMode?: 'compact' | 'detail' | 'full'
  pluginId?: string
  pluginName?: string
  pluginVersion?: string
  pluginRuntime?: 'trusted_local' | 'backend_ai_model' | 'backend_http' | 'callback'
  pluginArgs?: Record<string, unknown>
  pluginResultText?: string
  pluginResultData?: unknown
  pluginLastRunAt?: string
  executableSpec?: CanvasExecutableSpec
  inputPorts?: CanvasPortDef[]
  outputPorts?: CanvasPortDef[]
  canvasId?: string
  rfNodeId?: string
}

export interface CanvasNodeModel {
  ID: number
  canvas_id: number
  node_id: string
  type: NodeType
  label: string
  pos_x: number
  pos_y: number
  data: string
}

export interface CanvasEdgeModel {
  ID: number
  canvas_id: number
  edge_id: string
  source: string
  target: string
  source_handle?: string
  target_handle?: string
}

export interface Canvas {
  ID: number
  owner_id: number
  name: string
  stage?: CanvasStage
  canvas_type?: CanvasType
  ref_type?: string
  ref_id?: number
  nodes?: CanvasNodeModel[]
  edges?: CanvasEdgeModel[]
}

export interface CanvasTask {
  ID: number
  canvas_node_id: number
  canvas_run_id?: number
  node_id?: string
  node_label?: string
  node_type?: string
  status: CanvasTaskStatus
  provider_task_id?: string
  error?: string
  input_values?: string
  output_values?: string
  resource_id?: number
  resource?: RawResource
  CreatedAt: string
}

export interface CanvasRun {
  ID: number
  canvas_id: number
  status: CanvasRunStatus
  input_values?: string
  output_values?: string
  error?: string
  graph_snapshot?: string
  snapshot_hash?: number
  snapshot_node_count?: number
  snapshot_edge_count?: number
  started_at?: string
  finished_at?: string
  tasks?: CanvasTask[]
  CreatedAt: string
  UpdatedAt: string
}

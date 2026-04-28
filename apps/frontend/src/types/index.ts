export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: User
  status?: string
  total_episodes?: number
  pipeline_template?: string
  CreatedAt: string
  UpdatedAt: string
}

export type PipelineNodeStatus = 'draft' | 'under_review' | 'rejected' | 'final'
export type PipelineContentType = 'script' | 'storyboard' | 'shot' | 'asset' | 'episode' | 'scene' | 'final_video' | 'custom'

export interface PipelineNode {
  ID: number
  project_id: number
  type: string // raw_script|main_script|episode_script|scene_script|storyboard_script|shot_production|episode_edit|custom
  content_type: PipelineContentType
  name: string
  status: PipelineNodeStatus
  description?: string
  assignee_id?: number
  assignee?: User
  lead_id?: number
  lead?: User
  due_date?: string
  review_note?: string
  reviewed_by?: number
  reviewed_at?: string
  entity_type?: string
  entity_id?: number
  pos_x: number
  pos_y: number
  CreatedAt: string
  UpdatedAt: string
}

export interface PipelineEdge {
  ID: number
  project_id: number
  from_node_id: number
  to_node_id: number
  relation_type?: 'hierarchy' | 'dependency'
}

export interface Pipeline {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
}

export interface ProjectMember {
  ID: number
  project_id: number
  user_id: number
  user?: User
  role: string
}

export type ReviewStatus = 'draft' | 'under_review' | 'approved' | 'revision'

export interface Script {
  ID: number
  project_id: number
  title: string
  description: string
  content: string // full script body text
  status: string
  review_status?: ReviewStatus
  script_type: 'main' | 'episode' | 'scene'
  episode_id?: number
  pipeline_node_id?: number
  assignee_id?: number
  assignee?: User
  author_id: number
  resource_ids: string // JSON array of RawResource IDs
  order: number // sort order for episode scripts
  // content management fields (内容管理)
  summary: string
  characters: string
  core_settings: string
  background: string
  scenes_desc: string
  hook: string        // 钩子（分集剧本）
  plot_summary: string // 剧情推演总结（分集剧本）
  CreatedAt: string
  UpdatedAt: string
}

// Setting is the "bible" entry for a character, scene location, or prop.
export interface Setting {
  ID: number
  project_id: number
  script_id?: number // optional link to a script
  type: 'character' | 'scene' | 'prop'
  name: string
  description: string
  content: string
  CreatedAt: string
  UpdatedAt: string
}

export interface AssetView {
  ID: number
  asset_id: number
  view_type: string // front|back|left|right|detail|custom
  label: string
  resource_id?: number
  resource?: RawResource
  canvas_id?: number
  image_url?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface Asset {
  ID: number
  project_id: number
  pipeline_node_id?: number
  name: string
  type: 'character' | 'scene' | 'prop' | 'draft'
  description: string
  review_status?: ReviewStatus
  setting_id?: number // optional link to a Setting
  setting?: Setting
  views?: AssetView[]
  CreatedAt: string
  UpdatedAt: string
}

// Scene belongs to a Project directly (not to an Episode).
// Episodes link to Scenes via EpisodeScene (many-to-many).
export interface Scene {
  ID: number
  project_id: number
  pipeline_node_id?: number
  number: number
  title: string
  location: string
  time_of_day: string
  notes: string
  review_status?: ReviewStatus
  resource_ids: string // JSON array of RawResource IDs
  storyboards?: Storyboard[]
}

export interface EpisodeScene {
  episode_id: number
  scene_id: number
  order: number
}

export interface Episode {
  ID: number
  project_id: number
  pipeline_node_id?: number
  title: string
  number: number
  synopsis: string
  status: string
  review_status?: ReviewStatus
  script_id?: number // optional — can be created without a script
  target_storyboards?: number
  target_scenes?: number
  resource_ids: string // JSON array of RawResource IDs
  scenes?: Scene[]
  CreatedAt: string
  UpdatedAt: string
}

// Storyboard is the director's written description for a scene.
// scene_id and episode_id are optional — can be associated later.
export interface Storyboard {
  ID: number
  project_id: number
  scene_id?: number | null
  episode_id?: number | null
  pipeline_node_id?: number
  assignee_id?: number
  assignee?: User
  order: number
  title: string
  description: string
  notes: string
  characters: string
  actions: string
  dialogue: string
  atmosphere: string
  // Camera parameters
  camera_angle: string    // close-up|medium|wide|extreme-wide|overhead|pov
  camera_movement: string // static|pan|tilt|dolly|zoom|handheld
  depth_of_field: string  // shallow|normal|deep
  lighting: string
  duration: number
  shot_size?: string    // close_up|near|medium|full|wide|extreme_wide
  angle?: string        // eye_level|overhead|low_angle|side|top|dutch
  movement?: string     // push|pull|pan|dolly|follow|crane|handheld|static
  focal_length?: string // wide|standard|telephoto
  pacing?: string       // fast_cut|long_take|pause
  intent?: string       // 镜头意图
  resource_ids: string // JSON array of RawResource IDs
  status: 'draft' | 'approved'
  review_status?: ReviewStatus
  shots?: Shot[]
  CreatedAt: string
  UpdatedAt: string
}

export type ShotStatus = 'draft' | 'prompt_ready' | 'generating' | 'generated' | 'approved'

// Shot is the executable unit — one generation task.
// storyboard_id is optional — shots can exist without a storyboard.
export interface Shot {
  ID: number
  project_id: number
  storyboard_id?: number | null
  pipeline_node_id?: number
  assignee_id?: number
  assignee?: User
  order: number
  description: string
  prompt: string
  canvas_id?: number
  generated_res_id?: number
  ref_resource_ids: string // JSON array of reference RawResource IDs
  // Final version fields — stored separately from working draft above
  final_description?: string
  final_prompt?: string
  is_approved?: boolean
  review_status?: ReviewStatus
  status: ShotStatus
  CreatedAt: string
  UpdatedAt: string
}

export interface User {
  ID: number
  username: string
  system_role: 'super_admin' | 'user'
}

export interface Progress {
  scripts: number
  episodes: number
  total_episodes: number
  scenes: number
  assets: number
  members: number
  storyboards: { total: number; draft: number; approved: number }
  shots: { total: number; draft: number; prompt_ready: number; generating: number; generated: number; approved: number; is_approved: number }
}

// AICredential stores authentication credentials for one adapter type.
export interface AICredential {
  ID: number
  adapter_type: string  // adapter type constant (e.g. "openai_compat", "kling")
  display_name: string
  base_url: string
  masked_key: string
  is_enabled: boolean
  models?: AIModelConfig[]
  files_api_enabled: boolean
  files_api_base_url: string
  files_api_masked_key: string
  CreatedAt: string
  UpdatedAt: string
}

// AIModelConfig registers a model and stores all metadata + admin credit prices.
export interface AIModelConfig {
  ID: number
  credential_id: number
  model_def_id: string           // the API model ID (e.g. "gpt-4o", "gemini-2.0-flash")
  model_id_override: string      // optional override for the API-level model ID (e.g. Volcengine ep-xxx)
  is_enabled: boolean
  priority: number
  credits_input_per_1m: number
  credits_output_per_1m: number
  credits_per_image: number
  credits_per_second: number
  credits_per_call: number
  custom_display_name: string
  custom_capabilities: string    // comma-separated: "text","image","image_edit","video","video_i2v","video_v2v"
  custom_billing_mode: string    // "per_token"|"per_image"|"per_second"|"per_call"
  custom_accepts_image: boolean
  custom_max_input_images: number
  custom_max_input_videos: number
  custom_image_edit_field: string
  custom_supported_params: string // JSON: ParamDef[]
  CreatedAt: string
  UpdatedAt: string
}

// CredField describes one credential input field for an adapter.
export interface CredField {
  key: string
  label: string
  hint?: string
  required: boolean
}

// AdapterDef describes a supported adapter — one set of credentials + one adapter implementation.
export interface AdapterDef {
  adapter_type: string
  display_name: string
  description: string
  default_base_url: string
  cred_fields: CredField[]
  supports_files_api: boolean  // true = provider has a Files API for pre-uploading media
  param_sets?: AdapterParamSet[]
}

// AdapterParamSet is the adapter-level default generation parameter schema for a capability.
export interface AdapterParamSet {
  capability: string
  params: ParamDef[]
}

// ModelPreset is a read-only admin UI template for quickly adding a model.
// Runtime routing and generation parameters never consult this list.
export interface ModelPreset {
  id: string
  model_id: string
  display_name: string
  capabilities: string[]
  billing_mode: 'per_token' | 'per_image' | 'per_second' | 'per_call'
  adapter_type: string
  accepts_image_input: boolean
  max_input_images: number
  max_input_videos: number
  image_edit_field?: string
  ref_input_usd_per_1m?: number
  ref_output_usd_per_1m?: number
  ref_usd_per_image?: number
  ref_usd_per_second?: number
}

// ParamDef describes a user-configurable generation parameter for a model.
export interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'boolean'
  options?: string[]
  default?: string | number | boolean
  min?: number
  max?: number
  step?: number
}

// PublicModel is the user-facing model representation.
export interface PublicModel {
  id: number
  credential_id: number        // parent AICredential ID (for admin inline edit)
  display_name: string
  provider_name: string        // credential display_name, e.g. "我的 OpenAI"
  capabilities: string[]       // e.g. ["text"], ["image"], ["video"], ["image_edit"]
  accepts_image_input: boolean // true for image_edit and i2v models
  is_default?: boolean         // true when admin-pinned as default for a feature
  model_def_id?: string
  model_id_override?: string   // actual model ID sent to API if overridden
  supported_params?: ParamDef[]
}

// FeatureConfig controls which AI models are available for each named feature.
export interface FeatureConfig {
  ID: number
  feature_key: string
  display_name: string
  description: string
  capability: 'text' | 'reasoning' | 'image' | 'image_edit' | 'video'
  is_enabled: boolean
  is_internal: boolean
  is_tool_feature: boolean
  input_slots: InputSlotDef[]
  allowed_model_ids: number[]
  default_model_id?: number
  allowed_roles: string[]
  // Business layer enrichment fields
  default_system_prompt: string
  system_prompt_override: string
  output_schema: string
  max_tokens: number
  max_tokens_override: number
  CreatedAt: string
  UpdatedAt: string
}

// InputSlotDef describes a typed media input required or accepted by a tool feature.
export interface InputSlotDef {
  key: string
  label: string
  accept: 'image' | 'video'
  required: boolean
  max_count: number
  requires_cap?: string // only show when model has this capability
}

// FeatureDef is the hardcoded business-layer definition of a product feature.
export interface FeatureDef {
  ID: string
  DisplayName: string
  Description: string
  RequiredCap: 'text' | 'reasoning' | 'image' | 'video'
  IsInternal: boolean
  IsToolFeature: boolean
  InputSlots: InputSlotDef[]
  SystemPrompt: string
  OutputSchema: string
  MaxTokens: number
  Temperature: number
}

export interface UserQuota {
  balance: number
  total_cost_this_month: number
  total_tokens_this_month: number
}

export interface UsageLog {
  ID: number
  user_id: number
  ai_model_config_id: number
  operation_type: 'text' | 'image' | 'video'
  input_tokens: number
  output_tokens: number
  duration_sec: number   // per_second billing
  image_count: number    // per_image billing
  cost: number
  CreatedAt: string
  user?: User
  ai_model_config?: AIModelConfig
}

export interface PaginatedResponse<T> {
  total: number
  items: T[]
  page: number
  page_size: number
}

export interface DebugHTTPExchange {
  success: boolean
  model_id: string
  endpoint: string
  method: string
  request_headers?: Record<string, string>
  request_body: string
  response_status: number
  response_body: string
  latency_ms: number
  error?: string
}

export interface DebugCallResult extends DebugHTTPExchange {
  // Job context (filled by worker before adapter call)
  job_type?: string
  job_model_def_id?: string
  job_resolved_prompt?: string
  job_input_resource_ids?: number[]
  // Every provider HTTP exchange for multi-step jobs. The inherited flat fields
  // mirror the latest call for compatibility.
  calls?: DebugHTTPExchange[]
}

export interface RawCallResult {
  url: string
  method: string
  request_headers: Record<string, string>
  request_body: string
  response_status: number
  response_body: string
  latency_ms: number
  error?: string
}

export interface GenJobDetail extends GenJob {
  debug_detail?: DebugCallResult
}

export interface GenJobStateTraceEntry {
  state: string
  status: 'running' | 'succeeded' | 'failed'
  message?: string
  error?: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

export interface ResourceFolder {
  ID: number
  owner_id: number
  owner?: { ID: number; username: string }
  name: string
  parent_id?: number
  storage_backend: string // "" = system default, "local", "tos", …
  is_shared: boolean
  resource_count: number
  CreatedAt: string
  UpdatedAt: string
}

export interface ResourceFolderPermission {
  ID: number
  folder_id: number
  user_id: number
  user?: { ID: number; username: string }
  permission: 'read' | 'write'
  CreatedAt: string
}

export interface RawResource {
  ID: number
  owner_id: number
  folder_id?: number
  type: 'image' | 'video' | 'audio' | 'text'
  name: string
  url: string
  size: number
  mime_type: string
  storage_backend?: string
  storage_key?: string
  is_shared?: boolean
  direct_url?: string // presigned URL for cloud-stored resources
  owner?: { ID: number; username: string }
}

export type GenJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface GenJob {
  ID: number
  user_id: number
  model_config_id: number
  model_config?: AIModelConfig
  provider_name?: string
  model_display?: string
  model_identifier?: string
  job_type: string  // image | image_edit | video | video_i2v | video_v2v
  feature_key?: string  // tool feature key e.g. ref_image_gen, ref_video_gen, canvas
  status: GenJobStatus
  prompt: string
  extra_params?: string // JSON: size, quality, style, etc.
  aspect_ratio?: string // e.g. "16:9", "9:16"
  duration?: number     // seconds; 0 = model default
  request_context?: string // JSON snapshot of model, input resources, and params at creation time
  input_resource_id?: number
  input_resource_ids?: string // JSON array e.g. "[1,2]"
  input_resources?: RawResource[]
  output_resource_id?: number
  output_resource?: RawResource
  provider_task_id?: string
  provider_task_kind?: string
  provider_task_status?: string
  provider_task_history?: string
  error_msg?: string
  debug_info?: string  // JSON-encoded DebugCallResult
  execution_state?: string
  state_trace?: string // JSON-encoded GenJobStateTraceEntry[]
  started_at?: string
  finished_at?: string
  project_id?: number
  CreatedAt: string
  UpdatedAt: string
}

// Canvas
export type MediaNodeType = 'text' | 'image' | 'video' | 'audio'
export type ToolNodeType = 'canvas' | 'ref_image_gen' | 'ref_video_gen' | 'multi_angle' | 'style_transfer' | 'motion_imitation'
export type SpecialNodeType = 'input' | 'output' | 'approval' | 'text_gen' | 'ai_gen' | 'group'
export type PluginNodeType = string & { readonly __pluginNodeType?: unique symbol }
export type NodeType = MediaNodeType | ToolNodeType | SpecialNodeType | PluginNodeType
export type NodeSource = 'upload' | 'ai' | 'manual'
export type CanvasTaskStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'
export type CanvasType = 'inspiration' | 'workflow'
export type CanvasParamType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'number' | 'boolean' | 'resource'
export type CanvasRunStatus = 'pending' | 'running' | 'done' | 'failed'

export type CanvasStage = 'script_analysis' | 'asset_prep' | 'storyboard' | 'generation' | 'editing'

export interface CanvasNodeData {
  source: NodeSource
  resourceId?: number
  resource?: RawResource
  prompt?: string
  modelDbId?: number   // AIModelConfig primary key (preferred routing)
  referencedCanvasId?: number                            // workflow canvas used by a canvas reference node
  inputResourceIds?: number[]                             // selected resource inputs for full tool cards
  status?: CanvasTaskStatus
  taskId?: number
  error?: string
  textContent?: string                                     // manual text nodes
  inputValue?: string                                      // input nodes
  paramName?: string                                       // input/output parameter name
  paramType?: CanvasParamType                              // input/output parameter type
  approvalStatus?: 'waiting' | 'approved' | 'rejected'    // approval nodes
  // ai_gen node fields
  refNodeIds?: string[]                                    // referenced node IDs for @mentions
  outputType?: 'image' | 'video' | 'text' | 'audio'       // what to auto-generate after
  // group node fields
  groupId?: string                                         // which group this node belongs to
  isGroup?: boolean                                        // true for group container nodes
  groupLabel?: string
  groupWidth?: number
  groupHeight?: number
  // display mode
  cardMode?: 'compact' | 'detail' | 'full'
  // injected at runtime by CanvasEditorPage (not persisted)
  canvasId?: string
  rfNodeId?: string
}

// Plugins
export interface Plugin {
  ID: number
  plugin_key: string
  name: string
  version: string
  description?: string
  manifest: string
  install_path?: string
  enabled: boolean
  trusted: boolean
  source: 'manifest' | 'local_path' | 'package' | 'builtin' | string
  Tools?: PluginTool[]
  CreatedAt: string
  UpdatedAt: string
}

export interface PluginRuntimeSpec {
  kind: 'none' | 'http' | string
  endpoint?: string
  method?: string
  timeout?: number
  config?: unknown
}

export interface PluginTool {
  ID: number
  plugin_id: number
  tool_key: string
  title: string
  description?: string
  input_schema?: string
  output_schema?: string
  permissions?: string
  runtime_kind?: string
  runtime?: string
  enabled: boolean
  plugin?: Plugin
}

export interface PluginCardContribution {
  plugin_id: number
  plugin_key: string
  id: string
  title?: string
  tool?: string
  view?: string
  schema?: unknown
  description?: string
}

export interface PluginCanvasNodeContribution {
  plugin_id: number
  plugin_key: string
  type: NodeType
  title: string
  description?: string
  tool?: string
  inputs?: string[]
  outputs?: string[]
  card?: string
  icon?: string
  category?: string
  defaultData?: Partial<CanvasNodeData>
}

export interface PluginInvocation {
  ID: number
  plugin_id: number
  tool_key: string
  user_id?: number
  project_id?: number
  canvas_id?: number
  canvas_node_id?: number
  status: 'running' | 'succeeded' | 'failed'
  input_json?: string
  output_json?: string
  error?: string
  started_at: string
  finished_at?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface CanvasNodeModel {
  ID: number
  canvas_id: number
  node_id: string
  type: NodeType
  label: string
  pos_x: number
  pos_y: number
  data: string // JSON of CanvasNodeData
}

export interface CanvasEdgeModel {
  ID: number
  canvas_id: number
  edge_id: string
  source: string
  target: string
}

export interface Canvas {
  ID: number
  owner_id: number
  name: string
  project_id?: number
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
  resource_id?: number
  resource?: RawResource
  CreatedAt: string
}

export interface CanvasRun {
  ID: number
  canvas_id: number
  status: CanvasRunStatus
  input_values?: string
  error?: string
  graph_snapshot?: string
  snapshot_hash?: string
  snapshot_node_count?: number
  snapshot_edge_count?: number
  started_at?: string
  finished_at?: string
  tasks?: CanvasTask[]
  CreatedAt: string
  UpdatedAt: string
}

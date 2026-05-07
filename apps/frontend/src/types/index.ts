export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: User
  status?: string
  total_episodes?: number
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

export type ReviewStatus = 'draft' | 'under_review' | 'approved' | 'revision'

export interface Script {
  ID: number
  project_id: number
  title: string
  description: string
  content: string // full script body text
  raw_source?: string
  script_type: string // user-defined category tag
  source_type?: 'raw' | 'adapted' | 'revised'
  version?: number
  parent_script_id?: number
  episode_id?: number
  assignee_id?: number
  assignee?: User
  author_id: number
  order: number // sort order
  // content management fields (内容管理)
  summary: string
  characters: string
  character_profiles?: string
  character_relationships?: string
  core_settings: string
  background: string
  scenes_desc: string
  hook: string        // 钩子
  plot_summary: string // 剧情推演总结
  script_points?: string // JSON array of structured script points
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

export interface AssetSlot {
  ID: number
  project_id: number
  production_id?: number | null
  owner_type?: string
  owner_id?: number | null
  creative_reference_id?: number | null
  creative_reference_state_id?: number | null
  kind?: 'image' | 'video' | 'audio' | 'text' | 'brand_pack' | 'reference' | string
  name: string
  slot_key?: string
  description?: string
  prompt_hint?: string
  priority?: 'low' | 'normal' | 'high' | 'critical' | string
  resource_id?: number | null
  resource?: RawResource
  locked_asset_slot_id?: number | null
  locked_asset_slot?: AssetSlot
  status?: 'missing' | 'candidate' | 'locked' | 'waived' | string
  metadata_json?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface AssetSlotCandidate {
  ID: number
  project_id: number
  asset_slot_id: number
  asset_slot?: AssetSlot
  candidate_asset_slot_id: number
  candidate_asset_slot?: AssetSlot
  source_type?: 'manual' | 'upload' | 'job' | 'canvas' | 'import' | string
  source_id?: number | null
  score?: number
  status?: 'candidate' | 'selected' | 'rejected' | string
  note?: string
  CreatedAt: string
  UpdatedAt: string
}

export type ArtifactKind = 'script' | 'asset_slot'

export interface ArtifactEntityContext {
  asset_slot_id?: number | null
}

export interface ArtifactRef {
  kind: ArtifactKind
  id: number
  title: string
  subtitle?: string
  status?: string
  entity_context: ArtifactEntityContext
  resource?: RawResource
  created_at: string
  updated_at: string
}

export interface User {
  ID: number
  username: string
  system_role: 'super_admin' | 'user'
}

export interface Organization {
  ID: number
  name: string
  slug: string
  join_code?: string
  is_personal: boolean
  created_by: number
  CreatedAt: string
  UpdatedAt: string
}

export interface OrganizationMember {
  ID: number
  org_id: number
  user_id: number
  role: 'owner' | 'admin' | 'member' | 'viewer'
  user?: User
  CreatedAt: string
}

export interface OrgMembership {
  org_id: number
  org_name: string
  org_slug: string
  is_personal: boolean
  plan?: 'personal' | 'team' | 'enterprise' | string
  status?: 'active' | 'trialing' | 'past_due' | 'suspended' | string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

export interface OrgInvitation {
  ID: number
  org_id: number
  token: string
  role: string
  note?: string
  created_by: number
  used_by?: number
  expires_at: string
  used_at?: string
  CreatedAt: string
}

export interface UserGroup {
  ID: number
  org_id: number
  name: string
  members?: UserGroupMember[]
}

export interface UserGroupMember {
  ID: number
  group_id: number
  user_id: number
  user?: User
}

export interface Progress {
  scripts: number
  asset_slots: number
  members: number
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
  short_name: string
  custom_capabilities: string    // comma-separated: "text","image","image_edit","video","video_i2v","video_v2v"
  custom_billing_mode: string    // "per_token"|"per_image"|"per_second"|"per_call"
  custom_accepts_image: boolean
  custom_max_input_images: number
  custom_max_input_videos: number
  custom_image_edit_field: string
  custom_supported_params: string // JSON: ParamDef[] or ModelParamProfile
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

export interface ModelParamProfile {
  allow?: string[]
  deny?: string[]
  override?: Record<string, ParamDef>
  add?: ParamDef[]
}

// PublicModel is the user-facing model representation.
export interface PublicModel {
  id: number
  credential_id: number        // parent AICredential ID (for admin inline edit)
  display_name: string
  short_name?: string
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
  prompt_name?: string
  system_prompt?: string
  user_prompt?: string
  compiled_prompt?: string
  prompt_messages?: Array<{ role: string; content: string }>
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

export interface JobDetail extends Job {
  debug_detail?: DebugCallResult
}

export interface JobStateTraceEntry {
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
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
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

export type ResourceBindingOwnerType =
  | 'script'
  | 'asset_slot'
  | 'script_version'
  | 'segment'
  | 'scene_moment'
  | 'storyboard_script'
  | 'storyboard_line'
  | 'content_unit'
  | 'keyframe'
  | 'delivery_version'
  | 'canvas'

export type ResourceBindingRole =
  | 'reference'
  | 'input'
  | 'output'
  | 'draft'
  | 'final'
  | 'thumbnail'
  | 'attachment'
  | 'source'

export type ResourceBindingStatus = 'draft' | 'selected' | 'rejected' | 'approved' | 'archived'
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

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface Job {
  ID: number
  user_id: number
  model_config_id: number
  model_config?: AIModelConfig
  provider_name?: string
  model_display?: string
  model_identifier?: string
  job_type: string  // image | image_edit | video | video_i2v | video_v2v
  feature_key?: string  // tool feature key e.g. ref_image_gen, ref_video_gen, canvas
  status: JobStatus
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
  state_trace?: string // JSON-encoded JobStateTraceEntry[]
  started_at?: string
  finished_at?: string
  project_id?: number
  CreatedAt: string
  UpdatedAt: string
}

// Canvas
export type MediaNodeType = 'text' | 'image' | 'video' | 'audio'
export type ToolNodeType = 'canvas' | 'ref_image_gen' | 'ref_video_gen' | 'multi_angle' | 'style_transfer' | 'motion_imitation' | 'video_edit'
export type CanvasEntityKind = 'script' | 'segment' | 'scene_moment' | 'creative_reference' | 'asset_slot' | 'content_unit'
export type SpecialNodeType = 'input' | 'output' | 'resource_sink' | 'approval' | 'text_gen' | 'ai_gen' | 'group' | 'plugin_card' | 'entity_card'
export type PluginNodeType = string & { readonly __pluginNodeType?: unique symbol }
export type NodeType = MediaNodeType | ToolNodeType | SpecialNodeType | PluginNodeType
export type NodeSource = 'upload' | 'ai' | 'manual'
export type CanvasTaskStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'
export type CanvasType = 'inspiration' | 'workflow'
export type CanvasParamType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'number' | 'boolean' | 'resource'
export type CanvasRunStatus = 'pending' | 'running' | 'done' | 'failed'
export type CanvasPortType = CanvasParamType

export interface CanvasPortDef {
  id: string
  aliases?: string[]
  label?: string
  labelKey?: string
  type: CanvasPortType
  required?: boolean
  maxCount?: number
  deprecated?: boolean
  description?: string
}

export interface EntityWorkflowField {
  readable: boolean
  writable: boolean
  portId: string
  aliases?: string[]
  required?: boolean
  maxCount?: number
}

export interface EntityWorkflowBinding {
  role: string
  slot: string
  isPrimary: boolean
  multiple: boolean
}

export interface EntitySemanticFieldIO {
  readable: boolean
  writable: boolean
  required?: boolean
  maxCount?: number
}

export interface EntitySemanticSchemaField {
  id: string
  aliases?: string[]
  deprecated?: boolean
  labelKey: string
  fallbackLabel: string
  valueType: CanvasPortType
  control: 'input' | 'textarea' | 'select' | 'number' | 'checkbox' | 'json_editor' | 'resource_picker' | 'resource_gallery' | 'related_entity_list' | 'readonly_text' | 'computed' | string
  readonly?: boolean
  layout?: {
    width?: string
    relation?: string
    nestedKind?: string
  }
  io: EntitySemanticFieldIO
  binding?: EntityWorkflowBinding
  validation?: {
    required?: boolean
    enum?: string[]
    min?: number
    max?: number
  }
}

export interface EntitySemanticSchemaSection {
  id: string
  labelKey: string
  fallbackLabel: string
  layout?: {
    variant?: string
    columns?: number
  }
  fields: EntitySemanticSchemaField[]
}

export interface EntitySemanticSchema {
  kind: CanvasEntityKind
  schemaVersion?: number
  projection?: string
  compatibility?: EntitySchemaCompatibility
  labelKey: string
  fallbackLabel: string
  layout?: {
    variant?: string
  }
  sections: EntitySemanticSchemaSection[]
}

export interface EntitySchemaCompatibility {
  currentVersion: number
  minCompatibleVersion: number
  fieldAliases?: Record<string, string[]>
  deprecatedFields?: string[]
  migrations?: EntitySchemaMigration[]
}

export interface EntitySchemaMigration {
  fromVersion: number
  toVersion: number
  kind: string
  fieldId?: string
  fromFieldId?: string
  toFieldId?: string
  description?: string
}

export interface EntitySchemaActionHint {
  kind: string
  fieldId?: string
  fromFieldId?: string
  toFieldId?: string
  description: string
}

export interface EntitySchemaMigrationReport {
  kind: CanvasEntityKind
  schemaVersion: number
  currentVersion: number
  minCompatibleVersion: number
  fieldAliases?: Record<string, string[]>
  deprecatedFields?: string[]
  migrations?: EntitySchemaMigration[]
  actions: EntitySchemaActionHint[]
}

export interface EntitySemanticValues {
  kind: CanvasEntityKind
  id: number
  schemaVersion: number
  values: Record<string, unknown>
}

export interface EntityWorkflowSchemaField {
  id: string
  aliases?: string[]
  deprecated?: boolean
  labelKey: string
  fallbackLabel: string
  valueType: CanvasPortType
  control: 'input' | 'textarea' | 'select' | 'number' | 'checkbox' | 'json_editor' | 'resource_picker' | 'resource_gallery' | 'readonly_text' | 'computed' | string
  readonly?: boolean
  layout?: {
    width?: string
    relation?: string
    nestedKind?: string
  }
  workflow: EntityWorkflowField
  binding?: EntityWorkflowBinding
  validation?: {
    required?: boolean
    enum?: string[]
    min?: number
    max?: number
  }
}

export interface EntityWorkflowSchemaSection {
  id: string
  labelKey: string
  fallbackLabel: string
  layout?: {
    variant?: string
    columns?: number
  }
  fields: EntityWorkflowSchemaField[]
}

export interface EntityWorkflowSchema {
  kind: CanvasEntityKind
  schemaVersion?: number
  projection?: string
  compatibility?: EntitySchemaCompatibility
  labelKey: string
  fallbackLabel: string
  layout?: {
    variant?: string
  }
  sections: EntityWorkflowSchemaSection[]
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

export type CanvasExecutableCapability = 'text' | 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v' | 'audio'

export interface CanvasExecutableSpec {
  executor: 'ai_model' | 'plugin_http'
  capability: CanvasExecutableCapability
  featureKey?: string
  modelDbId?: number
  pluginToolKey?: string
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
  // local plugin card fields
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
  // reusable project entity card fields
  entityKind?: CanvasEntityKind
  entityId?: number
  entityTitle?: string
  assetSlotKind?: string
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
  type: string
  title: string
  description?: string
  tool?: string
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
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
  source_handle?: string
  target_handle?: string
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
  snapshot_hash?: string
  snapshot_node_count?: number
  snapshot_edge_count?: number
  started_at?: string
  finished_at?: string
  tasks?: CanvasTask[]
  CreatedAt: string
  UpdatedAt: string
}

export interface CanvasEntityWriteAudit {
  ID: number
  canvas_id: number
  canvas_run_id?: number
  canvas_node_id?: string
  port_id: string
  entity_kind: CanvasEntityKind
  entity_id: number
  user_id?: number
  old_value_json?: string
  new_value_json?: string
  resource_binding_ids?: string
  CreatedAt: string
}

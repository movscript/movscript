import type { RawResource } from './resources'

// Canvas
export type MediaNodeType = 'text' | 'image' | 'video' | 'audio'
export type ToolNodeType = 'canvas' | 'reference_to_image' | 'reference_to_video'
export type SemanticEntityKind = 'script' | 'segment' | 'scene_moment' | 'setting' | 'asset_slot' | 'content_unit'
export type SpecialNodeType = 'input' | 'output' | 'resource_sink' | 'approval' | 'text_gen' | 'ai_gen' | 'group' | 'plugin_card'
export type PluginNodeType = string & { readonly __pluginNodeType?: unique symbol }
export type NodeType = MediaNodeType | ToolNodeType | SpecialNodeType | PluginNodeType
export type NodeSource = 'upload' | 'ai' | 'manual'
export type CanvasTaskStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'
export type CanvasType = 'inspiration' | 'workflow'
export type CanvasParamType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'number' | 'boolean' | 'resource'
export type CanvasResourceMediaType = 'image' | 'video' | 'audio' | 'text' | 'any'
export type CanvasResourceRole =
  | 'generic'
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'style_reference'
  | 'target_image'
  | 'target_video'
  | 'source_audio'
  | 'speech_audio'
  | 'voice_sample'
  | 'target_voice'
  | 'transcript'
  | 'mask'
export type CanvasRunStatus = 'pending' | 'running' | 'done' | 'failed'
export type CanvasPortType = CanvasParamType

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
  mediaType?: CanvasResourceMediaType
  acceptedMediaTypes?: CanvasResourceMediaType[]
  role?: CanvasResourceRole
  order?: number
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
  kind: SemanticEntityKind
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
  kind: SemanticEntityKind
  schemaVersion: number
  currentVersion: number
  minCompatibleVersion: number
  fieldAliases?: Record<string, string[]>
  deprecatedFields?: string[]
  migrations?: EntitySchemaMigration[]
  actions: EntitySchemaActionHint[]
}

export interface EntitySemanticValues {
  kind: SemanticEntityKind
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
  kind: SemanticEntityKind
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
  media_type?: CanvasResourceMediaType
  role?: CanvasResourceRole
  resource?: RawResource
  text?: string
  json?: unknown
  number?: number
  boolean?: boolean
}

export type CanvasStage = 'script_analysis' | 'asset_prep' | 'storyboard' | 'generation' | 'editing'

export type CanvasExecutableCapability = 'text_generation' | 'image_generation' | 'video_generation' | 'audio_generation'

export interface CanvasExecutableReferenceAsset {
  resource_id?: number
  media_type?: CanvasResourceMediaType
  role: CanvasResourceRole
}

export interface CanvasExecutableSpec {
  executor: 'ai_model' | 'plugin_http'
  capability: CanvasExecutableCapability
  operation?: string
  modelId?: string
  prompt?: string
  inputResourceIds?: number[]
  referenceAssets?: CanvasExecutableReferenceAsset[]
  aspectRatio?: string
  duration?: number
  params?: Record<string, unknown>
}

export interface CanvasNodeData {
  source: NodeSource
  resourceId?: number
  resource?: RawResource
  prompt?: string
  modelId?: string      // public logical model ID preferred for routing
  modelOperation?: string                               // canonical generation operation, e.g. text_to_image or first_last_frame_to_video
  referencedCanvasId?: number                            // workflow canvas used by a canvas reference node
  referencedCanvasName?: string                          // denormalized workflow name for reference card display
  inputResourceIds?: number[]                             // selected resource inputs for full tool cards
  params?: Record<string, unknown>                        // generation parameters for canvas AI nodes
  status?: CanvasTaskStatus
  taskId?: number
  error?: string
  runDiagnostics?: CanvasNodeModelDiagnostics                  // transient UI diagnostic, not persisted
  textContent?: string                                     // manual text nodes
  inputValue?: string                                      // input nodes
  paramName?: string                                       // input/output parameter name
  paramType?: CanvasParamType                              // input/output parameter type
  paramOrder?: number                                      // input/output parameter order
  approvalStatus?: 'waiting' | 'approved' | 'rejected'    // approval nodes
  // ai_gen node fields
  refNodeIds?: string[]                                    // referenced node IDs for @mentions
  outputType?: 'image' | 'video' | 'text'                 // what to auto-generate after
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
  // injected at runtime by CanvasEditorPage (not persisted)
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
  entity_kind: SemanticEntityKind
  entity_id: number
  user_id?: number
  old_value_json?: string
  new_value_json?: string
  resource_binding_ids?: string
  CreatedAt: string
}

import type { CanvasNodeData, CanvasPortDef } from './canvas'

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

export interface PublicModel {
  id: number
  name: string
  capability: string
}

export interface GenerateImageRequest {
  model_config_id: number
  prompt: string
  job_type?: 'image' | 'image_edit'
  feature_key?: string
  input_resource_ids?: number[]
  extra_params?: Record<string, unknown>
  aspect_ratio?: string
  timeout_ms?: number
}

export type ExecutableCapability =
  | 'text'
  | 'image'
  | 'image_edit'
  | 'video'
  | 'video_i2v'
  | 'video_v2v'
  | 'audio'

export interface ExecutableSpec {
  executor: 'ai_model'
  capability: ExecutableCapability
  featureKey?: string
  modelDbId?: number
  prompt?: string
  inputResourceIds?: number[]
  aspectRatio?: string
  duration?: number
  params?: Record<string, unknown>
}

export type CanvasPortType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'resource'
  | 'json'
  | 'number'
  | 'boolean'

export interface CanvasPortDef {
  /** Stable handle id used by canvas edges, e.g. "prompt" or "result". */
  id: string
  /** Human-readable label shown by the host UI. */
  label?: string
  /** Payload type accepted or produced by this port. */
  type: CanvasPortType
  /** Required input ports must be satisfied before execution. */
  required?: boolean
  /** Maximum resources/items accepted by this port. 0 or undefined means unlimited. */
  maxCount?: number
  /** Optional description for tooltips and inspectors. */
  description?: string
}

export interface PluginToolContribution {
  id: string
  title: string
  description?: string
  inputSchema?: PluginInputSchema
  outputSchema?: unknown
  permissions?: string[]
}

export interface PluginCardContribution {
  id: string
  title?: string
  tool?: string
  view?: string
  schema?: unknown
  description?: string
}

export interface CanvasNodeContribution {
  type: string
  title: string
  description?: string
  tool?: string
  /** ID of a workflow contribution from this plugin to invoke as a reusable workflow node. */
  workflow?: string
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  card?: string
  icon?: string
  category?: string
  defaultData?: Record<string, unknown>
}

export interface PluginWorkflowContribution {
  id: string
  title: string
  description?: string
  /** Stable public workflow key from the workflow market or registry. */
  workflowKey: string
  version?: string
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  tags?: string[]
}

export interface PluginContributions {
  tools?: PluginToolContribution[]
  cards?: PluginCardContribution[]
  canvasNodes?: CanvasNodeContribution[]
  workflows?: PluginWorkflowContribution[]
  commands?: Array<{ id: string; title: string; tool?: string }>
}

export interface McpTools {
  listProjects: () => Promise<unknown[]>
  getProject: (id: number) => Promise<unknown>
  createProject: (data: { name: string; description?: string }) => Promise<unknown>
  listScripts: (projectId: number) => Promise<unknown[]>
  getScript: (id: number) => Promise<unknown>
  updateScript: (id: number, data: Record<string, unknown>) => Promise<unknown>
  listEpisodes: (scriptId: number) => Promise<unknown[]>
  updateEpisode: (id: number, data: Record<string, unknown>) => Promise<unknown>
  listScenes: (projectId: number) => Promise<unknown[]>
  updateScene: (id: number, data: Record<string, unknown>) => Promise<unknown>
  createScene: (projectId: number, data: Record<string, unknown>) => Promise<unknown>
  listStoryboards: (sceneId: number) => Promise<unknown[]>
  createStoryboard: (sceneId: number, data: Record<string, unknown>) => Promise<unknown>
  updateStoryboard: (id: number, data: Record<string, unknown>) => Promise<unknown>
  listShots: (storyboardId: number) => Promise<unknown[]>
  createShot: (storyboardId: number, data: Record<string, unknown>) => Promise<unknown>
  updateShot: (id: number, data: Record<string, unknown>) => Promise<unknown>
  listAssets: (projectId: number) => Promise<unknown[]>
  createAsset: (projectId: number, data: Record<string, unknown>) => Promise<unknown>
  search: (projectId: number, query: string) => Promise<unknown>
}

export interface MovRuntime {
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
  patch<T = unknown>(path: string, body?: unknown): Promise<T>
  delete<T = unknown>(path: string): Promise<T>
  /** Fetch models filtered by capability (e.g. "image", "video"). */
  models(capability: string): Promise<PublicModel[]>
  /** Fetch all platform model configs — use this to let users pick a model. */
  modelConfigs(): Promise<PublicModel[]>
  resources(): Promise<unknown[]>
  generateImage(req: GenerateImageRequest): Promise<unknown>
  sleep(ms: number): Promise<void>
  mcp: McpTools
}

export interface ToolResult {
  content?: Array<{ type: string; text?: string }>
  data?: unknown
  isError?: boolean
}

export interface PluginInputProperty {
  type?: string
  title?: string
  description?: string
  default?: string | number | boolean
  enum?: Array<string | number | boolean>
  /** Render hint for the host UI: "model-selector" renders a model picker */
  'x-widget'?: string
  /** Capability filter for model-selector widget, e.g. "image" | "video" */
  'x-capability'?: string
}

export interface PluginInputSchema {
  type?: string
  properties?: Record<string, PluginInputProperty>
  required?: string[]
}

/** @deprecated Inline-script manifest. Use PluginWebview for new plugins. */
export interface PluginManifest {
  schema: 'movscript.clientPlugin.v1' | string
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  inputSchema?: PluginInputSchema
  contributes?: PluginContributions
  script: string
}

/** @deprecated Bundle manifest with inlined JS. Use PluginWebview for new plugins. */
export interface PluginBundle {
  schema: 'movscript.clientPlugin.v1' | string
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  inputSchema?: PluginInputSchema
  contributes?: PluginContributions
  /** Compiled JS source. Must export/define a `run(mov, args)` function. */
  bundle: string
  /** True when the bundle also exports/defines `compile(args)`. */
  hasCompile?: boolean
  /** Source URL this bundle was installed from. */
  sourceUrl?: string
}

/**
 * Webview plugin — the recommended format.
 *
 * The plugin is a compiled JS bundle hosted at `bundleUrl`. It runs inside a
 * sandboxed <iframe> and communicates with the platform via `window.mov`
 * (injected by the host, VSCode-webview style).
 *
 * The bundle can use any framework (React, Vue, vanilla). It is responsible for
 * rendering its own UI into `document.getElementById('root')`.
 *
 * Example entry point:
 *   const models = await window.mov.modelConfigs()
 *   document.getElementById('root').innerHTML = `<p>${models.length} models</p>`
 */
export interface PluginWebview {
  schema: 'movscript.clientPlugin.v2'
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  contributes?: PluginContributions
  /** URL of the compiled JS bundle to load inside the iframe. */
  bundleUrl: string
  /** Source URL this manifest was installed from. */
  sourceUrl?: string
}

/** Union of all installable formats. */
export type AnyPluginManifest = PluginManifest | PluginBundle | PluginWebview

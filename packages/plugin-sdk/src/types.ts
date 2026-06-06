export interface PublicModel {
  id: number
  model_id: string
  logical_model_id?: string
  name: string
  capability: string
}

export type GenerateMediaJobType = 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v'

export interface GenerateMediaRequest {
  model_id: string
  prompt: string
  job_type?: GenerateMediaJobType
  feature_key?: string
  input_resource_ids?: number[]
  extra_params?: Record<string, unknown>
  aspect_ratio?: string
  duration?: number
  timeout_ms?: number
}

export interface GenerationJob {
  id: number
  status: string
  error?: string
  outputResourceIds?: number[]
  raw?: unknown
}

export interface UploadResourceRequest {
  filename: string
  mime_type?: string
  data_base64?: string
  text?: string
  folder_id?: number
}

export type ExecutableCapability =
  | 'text'
  | 'image'
  | 'image_edit'
  | 'video'
  | 'video_i2v'
  | 'video_v2v'
  | 'audio'
  | 'audio_tts'
  | 'audio_transcribe'
  | 'subtitle_align'
  | 'render_video'

export interface CanvasExecutableSpec {
  executor: 'ai_model'
  capability: ExecutableCapability
  featureKey?: string
  modelId?: string
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

export interface AgentToolContribution {
  id: string
  title: string
  description?: string
  inputSchema?: PluginInputSchema
  outputSchema?: unknown
  permissions?: string[]
}

export interface AgentToolCall<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string
  args: TArgs
}

export interface AgentToolHandler<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  compile?: (args: TArgs) => CanvasExecutableSpec | Promise<CanvasExecutableSpec>
  run: (host: MovPluginHost, args: TArgs) => Promise<PluginRunResult> | PluginRunResult
}

export type AgentToolHandlers = Record<string, AgentToolHandler>

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
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  card?: string
  icon?: string
  category?: string
  defaultData?: Record<string, unknown>
}

export type PluginSkillContributionLoadMode = 'core' | 'on_demand' | 'manual'
export type PluginSkillContributionScope = 'turn' | 'run' | 'thread'

/**
 * Provider-visible skill contribution.
 *
 * Prefer the low-friction form:
 *   { "path": "plugin-skills/director-jiangwen" }
 *
 * The path must point to a directory containing SKILL.md, or directly to a
 * SKILL.md / *.skill.md file. The SKILL.md frontmatter should include at least
 * `name` and `description`; MovScript-specific fields here are optional
 * overrides for indexing, routing, and conflict management.
 */
export interface PluginSkillContribution {
  path: string
  id?: string
  tags?: string[]
  aliases?: string[]
  useWhen?: string[]
  load?: PluginSkillContributionLoadMode
  scope?: PluginSkillContributionScope
  dependencies?: string[]
  conflicts?: string[]
}

export interface PluginContributions {
  /** Provider/MCP-visible tools contributed by this plugin. Canvas nodes are declared separately. */
  tools?: AgentToolContribution[]
  cards?: PluginCardContribution[]
  canvasNodes?: CanvasNodeContribution[]
  skills?: PluginSkillContribution[]
  commands?: Array<{ id: string; title: string; tool?: string }>
}

export interface PluginGenerationHost {
  /** Fetch models filtered by capability (e.g. "image", "video"). */
  models(capability: string): Promise<PublicModel[]>
  /** Fetch all platform model configs. */
  modelConfigs(): Promise<PublicModel[]>
  /** Submit a generation job and return immediately with the backend job handle. */
  submit(req: GenerateMediaRequest): Promise<GenerationJob>
  /** Fetch the latest state for a submitted generation job. */
  getJob(id: number | string): Promise<GenerationJob>
}

export interface PluginResourceHost {
  list(): Promise<unknown[]>
  upload(req: UploadResourceRequest): Promise<unknown>
}

export interface PluginApiHost {
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
  patch<T = unknown>(path: string, body?: unknown): Promise<T>
  delete<T = unknown>(path: string): Promise<T>
}

export interface MovPluginHost {
  api: PluginApiHost
  generation: PluginGenerationHost
  resources: PluginResourceHost
  sleep(ms: number): Promise<void>
}

export interface PluginRunResult {
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

export interface PluginPackageManifest {
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
  /** Compiled JS source. Must export/define a `run(host, args)` function. */
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
 * (injected by the host).
 *
 * The bundle can use any framework (React, Vue, vanilla). It is responsible for
 * rendering its own UI into `document.getElementById('root')`.
 *
 * Example entry point:
 *   const models = await window.mov.generation.modelConfigs()
 *   document.getElementById('root').innerHTML = `<p>${models.length} models</p>`
 */
export interface PluginWebview {
  schema: 'movscript.clientPlugin.webview'
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
export type AnyPluginManifest = PluginPackageManifest | PluginWebview

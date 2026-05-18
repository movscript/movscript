import { api } from '@/lib/api'
import type { CanvasExecutableSpec, CanvasPortDef, PublicModel, RawResource } from '@/types'
import { createMcpTools, type McpTools } from '@/lib/mcpTools'
import { publicModelId } from '@/lib/modelDisplay'
import { localAgentClient, type AgentSkillBundleFile, type AgentSkillBundleInstallResult } from '@/lib/localAgentClient'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientPluginInputType = 'string' | 'number' | 'boolean'

export interface ClientPluginInputProperty {
  type?: ClientPluginInputType | string
  title?: string
  description?: string
  default?: string | number | boolean
  enum?: Array<string | number | boolean>
  /** Render hint: "model-selector" renders a ModelSelector dropdown */
  'x-widget'?: string
  /** Capability filter for model-selector widget, e.g. "image" | "video" */
  'x-capability'?: string
}

export interface ClientPluginInputSchema {
  type?: 'object' | string
  properties?: Record<string, ClientPluginInputProperty>
  required?: string[]
}

export interface ClientPluginCanvasNodeContribution {
  type: string
  title: string
  description?: string
  tool?: string
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  card?: string
  icon?: string
  category?: string
  defaultData?: Record<string, unknown>
}

export interface ClientPluginContributions {
  canvasNodes?: ClientPluginCanvasNodeContribution[]
  tools?: unknown[]
  cards?: unknown[]
  agentSkills?: Array<{
    path: string
    id?: string
    kind?: 'persona' | 'workflow' | 'policy' | 'expertise' | string
    tags?: string[]
    aliases?: string[]
    useWhen?: string[]
    load?: 'core' | 'on_demand' | 'manual' | string
    scope?: 'turn' | 'run' | 'thread' | string
    dependencies?: string[]
    conflicts?: string[]
  }>
  commands?: unknown[]
}

export interface ClientPluginManifest {
  schema: 'movscript.clientPlugin.v1' | 'movscript.clientPlugin.webview' | string
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  permissions?: string[]
  inputSchema?: ClientPluginInputSchema
  contributes?: ClientPluginContributions
  hasCompile?: boolean
  /** Inline script (legacy / simple plugins) */
  script?: string
  /** Compiled bundle source (installed from URL, v1) */
  bundle?: string
  /** URL of the compiled JS bundle to load in iframe (webview plugins) */
  bundleUrl?: string
  /** URL this plugin was installed from */
  sourceUrl?: string
  /** Logo as data URL (extracted from .movpkg assets/) */
  logoDataUrl?: string
  /** Result of installing bundled agent skills into the local agent catalog. */
  agentSkillInstall?: AgentSkillBundleInstallResult
  installedAt?: string
}

export interface ClientPluginResult {
  content?: Array<{ type: string; text?: string }>
  data?: unknown
  isError?: boolean
}

export type GenerateMediaJobType = 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v'

export interface GenerateMediaRequest {
  model_id?: string
  title?: string
  prompt: string
  job_type?: GenerateMediaJobType
  feature_key?: string
  input_resource_ids?: number[]
  extra_params?: Record<string, unknown>
  aspect_ratio?: string
  duration?: number
  timeout_ms?: number
}

export type GenerateImageRequest = GenerateMediaRequest & {
  job_type?: 'image' | 'image_edit'
}

export interface ClientPluginRuntime {
  get: <T = unknown>(path: string) => Promise<T>
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>
  patch: <T = unknown>(path: string, body?: unknown) => Promise<T>
  delete: <T = unknown>(path: string) => Promise<T>
  models: (capability: string) => Promise<PublicModel[]>
  modelConfigs: () => Promise<PublicModel[]>
  resources: () => Promise<RawResource[]>
  generateMedia: (req: GenerateMediaRequest) => Promise<unknown>
  generateImage: (req: GenerateImageRequest) => Promise<unknown>
  sleep: (ms: number) => Promise<void>
  mcp: McpTools
}

// ── IndexedDB storage ─────────────────────────────────────────────────────────

const DB_NAME = 'movscript-plugins'
const DB_VERSION = 1
const STORE_NAME = 'plugins'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadClientPlugins(): Promise<ClientPluginManifest[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve((req.result as ClientPluginManifest[]).filter(isClientPluginManifest))
    req.onerror = () => reject(req.error)
  })
}

export async function saveClientPlugin(plugin: ClientPluginManifest): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(plugin)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeClientPlugin(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── Migration from localStorage ───────────────────────────────────────────────

const LEGACY_KEY = 'movscript.clientPlugins.v1'

export async function migrateFromLocalStorage(): Promise<number> {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw)
    const plugins: ClientPluginManifest[] = Array.isArray(parsed) ? parsed.filter(isClientPluginManifest) : []
    for (const p of plugins) await saveClientPlugin(p)
    localStorage.removeItem(LEGACY_KEY)
    return plugins.length
  } catch {
    return 0
  }
}

// ── Install from URL ──────────────────────────────────────────────────────────

export async function installPluginFromURL(url: string): Promise<ClientPluginManifest> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)

  const contentType = res.headers.get('content-type') ?? ''
  let plugin: ClientPluginManifest

  if (contentType.includes('javascript') || url.endsWith('.js') || url.endsWith('.mjs')) {
    // JS bundle: execute it to extract the manifest
    const src = await res.text()
    plugin = extractBundleManifest(src, url)
  } else {
    // JSON manifest
    const json = await res.json()
    if (!isClientPluginManifest(json)) throw new Error('invalid plugin manifest')
    plugin = { ...json, sourceUrl: url, installedAt: new Date().toISOString() }
  }

  await saveClientPlugin(plugin)
  return plugin
}

// ── Install from File ─────────────────────────────────────────────────────────

export async function installPluginFromFile(file: File): Promise<ClientPluginManifest> {
  if (!file.name.endsWith('.movpkg')) {
    throw new Error('Only .movpkg files are supported. Use "movcli build" to create one.')
  }
  return installPluginFromMovpkg(file)
}

async function installPluginFromMovpkg(file: File): Promise<ClientPluginManifest> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('.movpkg is missing manifest.json')
  const manifestText = await manifestFile.async('text')
  const raw = JSON.parse(manifestText) as Record<string, unknown>

  const bundleFile = zip.file('bundle.js')
  if (!bundleFile) throw new Error('.movpkg is missing bundle.js')
  const bundle = await bundleFile.async('text')

  let logoDataUrl: string | undefined
  const logoFile = zip.file('assets/logo.png') ?? zip.file('assets/logo.svg') ?? zip.file('assets/logo.jpg')
  if (logoFile) {
    const ext = logoFile.name.split('.').pop() ?? 'png'
    const mimeMap: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
    const mime = mimeMap[ext] ?? 'image/png'
    const b64 = await logoFile.async('base64')
    logoDataUrl = `data:${mime};base64,${b64}`
  }

  const manifest: ClientPluginManifest = {
    schema: typeof raw.schema === 'string' ? raw.schema : 'movscript.clientPlugin.v1',
    id: typeof raw.id === 'string' ? raw.id : `pkg.${Date.now()}`,
    name: typeof raw.name === 'string' ? raw.name : file.name,
    version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    homepage: typeof raw.homepage === 'string' ? raw.homepage : undefined,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : undefined,
    inputSchema: raw.inputSchema as ClientPluginInputSchema | undefined,
    contributes: raw.contributes as ClientPluginContributions | undefined,
    bundle,
    ...(logoDataUrl ? { logoDataUrl } : {}),
    installedAt: new Date().toISOString(),
  }

  if (!isClientPluginManifest(manifest)) throw new Error('invalid plugin manifest in .movpkg')
  const agentSkillFiles = await extractMovpkgAgentSkillFiles(zip)
  if (manifest.contributes?.agentSkills?.length && agentSkillFiles.length === 0) {
    throw new Error('.movpkg declares contributes.agentSkills but does not include agent-skills/ files')
  }
  if (agentSkillFiles.length > 0) {
    await localAgentClient.ensureRunning()
    manifest.agentSkillInstall = await localAgentClient.installAgentSkillBundle({
      pluginId: manifest.id,
      files: agentSkillFiles,
    })
  }
  await saveClientPlugin(manifest)
  return manifest
}

async function extractMovpkgAgentSkillFiles(zip: {
  forEach: (callback: (relativePath: string, file: { dir: boolean; async: (type: 'text') => Promise<string> }) => void) => void
}): Promise<AgentSkillBundleFile[]> {
  const pending: Array<Promise<AgentSkillBundleFile>> = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    if (!relativePath.startsWith('agent-skills/')) return
    if (!/\.(md|json|txt)$/i.test(relativePath)) return
    pending.push(entry.async('text').then((content) => ({ path: relativePath, content })))
  })
  return (await Promise.all(pending)).sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * Execute a JS bundle in a sandboxed Function to extract the exported manifest.
 * The bundle must call `__movscript_register__(manifest)` or assign to
 * `globalThis.__movscript_plugin__`.
 */
function extractBundleManifest(src: string, sourceUrl: string): ClientPluginManifest {
  let captured: unknown = undefined
  const register = (m: unknown) => { captured = m }

  // Support two conventions:
  // 1. Bundle calls __movscript_register__({ id, name, ... , bundle: '...' })
  // 2. Bundle assigns globalThis.__movscript_plugin__ = { ... }
  const wrapper = new Function(
    '__movscript_register__',
    `${src}\n;if(typeof __movscript_plugin__!=='undefined')__movscript_register__(__movscript_plugin__);`
  )
  wrapper(register)

  if (!captured || typeof captured !== 'object') {
    // Fallback: treat the whole source as the bundle script
    captured = { bundle: src }
  }

  const raw = captured as Record<string, unknown>
  const manifest: ClientPluginManifest = {
    schema: typeof raw.schema === 'string' ? raw.schema : 'movscript.clientPlugin.v1',
    id: typeof raw.id === 'string' ? raw.id : `url.${Date.now()}`,
    name: typeof raw.name === 'string' ? raw.name : sourceUrl.split('/').pop() ?? 'Unknown Plugin',
    version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    homepage: typeof raw.homepage === 'string' ? raw.homepage : undefined,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : undefined,
    inputSchema: raw.inputSchema as ClientPluginInputSchema | undefined,
    contributes: raw.contributes as ClientPluginContributions | undefined,
    bundle: typeof raw.bundle === 'string' ? raw.bundle : src,
    script: typeof raw.script === 'string' ? raw.script : undefined,
    sourceUrl,
    installedAt: new Date().toISOString(),
  }

  if (!isClientPluginManifest(manifest)) throw new Error('bundle did not export a valid plugin manifest')
  return manifest
}

// ── Parse manifest from text ──────────────────────────────────────────────────

export function parseClientPluginManifest(raw: string): ClientPluginManifest {
  const parsed = JSON.parse(raw)
  if (!isClientPluginManifest(parsed)) throw new Error('invalid client plugin manifest')
  return parsed
}

// ── Run plugin ────────────────────────────────────────────────────────────────

export async function runClientPlugin(plugin: ClientPluginManifest, args: Record<string, unknown>): Promise<ClientPluginResult> {
  const runtime = createRuntime()
  const src = plugin.bundle ?? plugin.script ?? ''
  if (!src) throw new Error('plugin has no executable script or bundle')

  let runFn: (mov: ClientPluginRuntime, args: Record<string, unknown>) => Promise<ClientPluginResult>

  if (src.includes('export{') || src.includes('export {') || /export\s+\{/.test(src)) {
    // ESM bundle — use dynamic import via blob URL
    const blob = new Blob([src], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      const mod = await import(/* @vite-ignore */ url)
      runFn = mod.run
    } finally {
      URL.revokeObjectURL(url)
    }
  } else {
    // IIFE / script bundle — execute with new Function, expects `run` in scope
    const fn = new Function('mov', 'args', `"use strict";\n${src}\nreturn run(mov, args);`)
    const result = await fn(runtime, args)
    if (result && typeof result === 'object') return result as ClientPluginResult
    return { content: [{ type: 'text', text: String(result ?? '') }], data: result }
  }

  if (typeof runFn !== 'function') throw new Error('plugin bundle does not export a run() function')
  const result = await runFn(runtime, args)
  if (result && typeof result === 'object') return result as ClientPluginResult
  return { content: [{ type: 'text', text: String(result ?? '') }], data: result }
}

export async function compileClientPlugin(plugin: ClientPluginManifest, args: Record<string, unknown>): Promise<CanvasExecutableSpec | undefined> {
  const src = plugin.bundle ?? plugin.script ?? ''
  if (!src) return undefined

  let compileFn: ((args: Record<string, unknown>) => CanvasExecutableSpec | Promise<CanvasExecutableSpec>) | undefined

  if (src.includes('export{') || src.includes('export {') || /export\s+\{/.test(src)) {
    const blob = new Blob([src], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      const mod = await import(/* @vite-ignore */ url)
      compileFn = mod.compile
    } finally {
      URL.revokeObjectURL(url)
    }
  } else {
    const fn = new Function('args', `"use strict";\n${src}\nreturn typeof compile === 'function' ? compile(args) : undefined;`)
    const result = await fn(args)
    return isCanvasExecutableSpec(result) ? result : undefined
  }

  if (typeof compileFn !== 'function') return undefined
  const result = await compileFn(args)
  return isCanvasExecutableSpec(result) ? result : undefined
}

// ── Validation ────────────────────────────────────────────────────────────────

function isClientPluginManifest(value: unknown): value is ClientPluginManifest {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ClientPluginManifest>
  return (
    typeof item.id === 'string' && item.id.trim().length > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    typeof item.version === 'string' && item.version.trim().length > 0 &&
    (typeof item.script === 'string' || typeof item.bundle === 'string' || typeof item.bundleUrl === 'string')
  )
}

function isCanvasExecutableSpec(value: unknown): value is CanvasExecutableSpec {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CanvasExecutableSpec>
  return item.executor === 'ai_model' && typeof item.capability === 'string'
}

// ── Runtime ───────────────────────────────────────────────────────────────────

function createRuntime(): ClientPluginRuntime {
  return {
    get: (path) => api.get(path).then((r) => r.data),
    post: (path, body) => api.post(path, body).then((r) => r.data),
    patch: (path, body) => api.patch(path, body).then((r) => r.data),
    delete: (path) => api.delete(path).then((r) => r.data),
    models: (capability) => api.get(`/models?capability=${encodeURIComponent(capability)}`).then((r) => r.data),
    modelConfigs: () => api.get('/models?capability=image').then((r) => r.data),
    resources: () => api.get('/resources').then((r) => r.data),
    generateMedia: generateMediaViaRuntime,
    generateImage: generateImageViaRuntime,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    mcp: createMcpTools(),
  }
}

export async function generateImageViaRuntime(req: GenerateImageRequest): Promise<unknown> {
  return generateMediaViaRuntime(req)
}

export async function generateMediaViaRuntime(req: GenerateMediaRequest): Promise<unknown> {
  const inputIDs = req.input_resource_ids ?? []
  const jobType = req.job_type ?? (inputIDs.length > 0 ? 'image_edit' : 'image')
  const modelId = await resolveRuntimeModelId(req, jobType)
  const title = typeof req.title === 'string' && req.title.trim()
    ? req.title.trim()
    : defaultGenerationJobTitle(jobType)
  const created = await api.post('/jobs', {
    model_id: modelId,
    job_type: jobType,
    feature_key: req.feature_key ?? 'client_plugin',
    title,
    prompt: req.prompt,
    input_resource_ids: inputIDs,
    aspect_ratio: req.aspect_ratio,
    ...(req.duration !== undefined ? { duration: req.duration } : {}),
    extra_params: JSON.stringify(req.extra_params ?? {}),
  }).then((r) => r.data as { ID: number })

  const timeout = req.timeout_ms ?? (jobType.startsWith('video') ? 600_000 : 180_000)
  const started = Date.now()
  for (;;) {
    const job = await api.get(`/jobs/${created.ID}`).then((r) => r.data as { status: string; error_msg?: string })
    if (job.status === 'succeeded') return job
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error_msg || `generation job ${job.status}`)
    }
    if (Date.now() - started > timeout) throw new Error('generation job timed out')
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function resolveRuntimeModelId(req: GenerateMediaRequest, jobType: GenerateMediaJobType): Promise<string | undefined> {
  if (typeof req.model_id === 'string' && req.model_id.trim()) return req.model_id.trim()
  const legacyID = Number((req as { model_config_id?: unknown }).model_config_id)
  if (!Number.isInteger(legacyID) || legacyID <= 0) return undefined
  const capability = jobType === 'image_edit' ? 'image_edit' : jobType.startsWith('video') ? 'video' : 'image'
  const models = await api.get(`/models?capability=${encodeURIComponent(capability)}`).then((r) => r.data as PublicModel[])
  const model = models.find((item) => item.id === legacyID)
  return model ? publicModelId(model) : undefined
}

function defaultGenerationJobTitle(jobType: GenerateMediaJobType): string {
  const labels: Record<GenerateMediaJobType, string> = {
    image: '文生图',
    image_edit: '参考生图',
    video: '文生视频',
    video_i2v: '参考生视频',
    video_v2v: '视频迁移',
  }
  return `${labels[jobType]}-${Math.floor(1000 + Math.random() * 9000)}`
}

// ── Sample plugin ─────────────────────────────────────────────────────────────

export const SAMPLE_REF_IMAGE_PLUGIN = JSON.stringify({
  schema: 'movscript.clientPlugin.v1',
  id: 'local.ref-image-generator',
  name: '参考生图',
  version: '1.0.0',
  description: '参考插件：在前端调用后端模型网关创建图像生成任务。',
  permissions: ['model.image.generate', 'resource.read'],
  inputSchema: {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', title: '提示词', description: '描述要生成的画面' },
      model_id: { type: 'string', title: '模型', description: '可选。不填时自动选择可用图像模型', 'x-widget': 'model-selector', 'x-capability': 'image' },
      reference_resource_ids: { type: 'string', title: '参考资源 ID', description: '可选。多个 ID 用英文逗号分隔' },
      aspect_ratio: { type: 'string', title: '画幅', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      image_size: { type: 'string', title: '尺寸', default: '1024x1024' },
      quality: { type: 'string', title: '质量', enum: ['auto', 'standard', 'hd', 'high', 'medium', 'low'] },
    },
  },
  script: `async function run(mov, args) {
  const refIds = String(args.reference_resource_ids || '')
    .split(',').map((s) => Number(s.trim())).filter((id) => Number.isFinite(id) && id > 0)
  const capability = refIds.length > 0 ? 'image_edit' : 'image'
  const models = await mov.models(capability)
  const modelId = String(args.model_id || models[0]?.model_id || models[0]?.logical_model_id || '')
  if (!modelId) throw new Error('没有可用的图像模型配置')
  const job = await mov.generateImage({
    model_id: modelId,
    title: '参考生图-' + Math.floor(1000 + Math.random() * 9000),
    job_type: refIds.length > 0 ? 'image_edit' : 'image',
    feature_key: 'client_plugin.ref_image',
    prompt: String(args.prompt || ''),
    input_resource_ids: refIds,
    aspect_ratio: String(args.aspect_ratio || '1:1'),
    extra_params: {
      image_size: args.image_size || '1024x1024',
      ...(args.quality ? { quality: args.quality } : {}),
    },
  })
  return { content: [{ type: 'text', text: '图像生成完成' }], data: job }
}`,
}, null, 2)

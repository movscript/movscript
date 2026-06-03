import { api } from '@/shared/infrastructure/api'
import type { CanvasExecutableSpec, CanvasPortDef, PublicModel, RawResource } from '@/types'
import {
  agentCatalogPackStoreClient,
  type AgentCatalogPackFile,
  type AgentCatalogPackInstallResult,
} from './agentCatalogPackStoreClient'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'

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

export interface ClientPluginAgentToolContribution {
  id?: string
  name?: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  permissions?: string[]
}

export interface ClientPluginCanvasNodeContribution {
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

export interface ClientPluginContributions {
  canvasNodes?: ClientPluginCanvasNodeContribution[]
  tools?: ClientPluginAgentToolContribution[]
  cards?: unknown[]
  mcpServers?: Array<{
    id: string
    label?: string
    endpointEnv?: string
    builtin?: boolean
    tools?: Array<{
      name: string
      description?: string
    }>
    resources?: Array<{
      uri: string
      description?: string
    }>
  }>
  agentSkills?: Array<{
    path: string
    id?: string
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
  /** Compiled bundle source (installed from URL, v1) */
  bundle?: string
  /** URL of the compiled JS bundle to load in iframe (webview plugins) */
  bundleUrl?: string
  /** URL this plugin was installed from */
  sourceUrl?: string
  /** Logo as data URL (extracted from .movpkg assets/) */
  logoDataUrl?: string
  /** Result of installing contributed agent catalog files into the shared pack store. */
  agentCatalogPackInstall?: AgentCatalogPackInstallResult
  /** Bundled with MovScript and maintained by the application. */
  builtin?: boolean
  /** Explicitly false when a plugin should be visible but not removable. */
  uninstallable?: boolean
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

export interface ClientPluginHost {
  api: {
    get: <T = unknown>(path: string) => Promise<T>
    post: <T = unknown>(path: string, body?: unknown) => Promise<T>
    patch: <T = unknown>(path: string, body?: unknown) => Promise<T>
    delete: <T = unknown>(path: string) => Promise<T>
  }
  generation: {
    models: (capability: string) => Promise<PublicModel[]>
    modelConfigs: () => Promise<PublicModel[]>
    submit: (req: GenerateMediaRequest) => Promise<GenerationJob>
    getJob: (id: number | string) => Promise<GenerationJob>
  }
  resources: {
    list: () => Promise<RawResource[]>
    upload: (req: UploadResourceRequest) => Promise<RawResource>
  }
  sleep: (ms: number) => Promise<void>
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
  const existing = (await loadClientPlugins()).find((plugin) => plugin.id === id)
  if (existing && !isClientPluginRemovable(existing)) {
    throw new Error('plugin is managed by MovScript and cannot be removed')
  }
  if (existing && clientPluginContributesAgentCatalog(existing)) {
    await agentCatalogPackStoreClient.uninstallAgentCatalogPack({ pluginId: id })
  }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function clientPluginContributesAgentCatalog(plugin: ClientPluginManifest): boolean {
  return Boolean(
    plugin.agentCatalogPackInstall ||
    plugin.contributes?.agentSkills?.length
  )
}

export function isClientPluginRemovable(plugin: ClientPluginManifest): boolean {
  return plugin.builtin !== true && plugin.uninstallable !== false
}

export function isClientPluginRunnable(plugin: ClientPluginManifest): boolean {
  return Boolean(plugin.bundle || plugin.bundleUrl)
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
  const agentCatalogFiles = await extractMovpkgAgentCatalogFiles(zip)
  if (manifest.contributes?.agentSkills?.length && !agentCatalogFiles.some((file) => file.path.startsWith('agent-skills/'))) {
    throw new Error('.movpkg declares contributes.agentSkills but does not include agent-skills/ files')
  }
  if (agentCatalogFiles.length > 0) {
    manifest.agentCatalogPackInstall = await agentCatalogPackStoreClient.installAgentCatalogPack({
      pluginId: manifest.id,
      files: agentCatalogFiles,
    })
  }
  await saveClientPlugin(manifest)
  return manifest
}

async function extractMovpkgAgentCatalogFiles(zip: {
  forEach: (callback: (relativePath: string, file: { dir: boolean; async: (type: 'text') => Promise<string> }) => void) => void
}): Promise<AgentCatalogPackFile[]> {
  const pending: Array<Promise<AgentCatalogPackFile>> = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    if (!isMovpkgAgentCatalogFile(relativePath)) return
    pending.push(entry.async('text').then((content) => ({ path: relativePath, content })))
  })
  return (await Promise.all(pending)).sort((left, right) => left.path.localeCompare(right.path))
}

function isMovpkgAgentCatalogFile(relativePath: string): boolean {
  if (relativePath.startsWith('agent-skills/')) return /\.(md|json|txt)$/i.test(relativePath)
  if (relativePath.startsWith('agent-tools/')) return /\.tool\.json$/i.test(relativePath)
  if (relativePath.startsWith('agent-packs/')) return /\.json$/i.test(relativePath)
  if (relativePath.startsWith('agent-config-files/')) return /\.json$/i.test(relativePath)
  return false
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

export async function runClientPlugin(plugin: ClientPluginManifest, args: Record<string, unknown>, options: { toolName?: string } = {}): Promise<ClientPluginResult> {
  const host = createHost()
  const src = plugin.bundle ?? ''
  if (!src) throw new Error('plugin has no executable script or bundle')

  let runFn: (host: ClientPluginHost, args: Record<string, unknown>) => Promise<ClientPluginResult>

  if (src.includes('export{') || src.includes('export {') || /export\s+\{/.test(src)) {
    // ESM bundle — use dynamic import via blob URL
    const blob = new Blob([src], { type: 'text/javascript' })
    const url = createObjectUrl(blob)
    try {
      const mod = await import(/* @vite-ignore */ url)
      runFn = resolvePluginRunFunction(mod, options.toolName)
    } finally {
      revokeObjectUrl(url)
    }
  } else {
    // IIFE bundle — execute with new Function, expects runAgentTool/agentTools/run in scope.
    const fn = new Function('mov', 'args', 'toolName', `"use strict";\n${src}\nif (toolName && typeof runAgentTool === 'function') return runAgentTool(mov, { name: toolName, args });\nif (toolName && typeof agentTools !== 'undefined' && agentTools && agentTools[toolName] && typeof agentTools[toolName].run === 'function') return agentTools[toolName].run(mov, args);\nreturn run(mov, args);`)
    const result = await fn(host, args, options.toolName)
    if (result && typeof result === 'object') return result as ClientPluginResult
    return { content: [{ type: 'text', text: String(result ?? '') }], data: result }
  }

  if (typeof runFn !== 'function') throw new Error('plugin pack does not export a run() function')
  const result = await runFn(host, args)
  if (result && typeof result === 'object') return result as ClientPluginResult
  return { content: [{ type: 'text', text: String(result ?? '') }], data: result }
}

export async function compileClientPlugin(plugin: ClientPluginManifest, args: Record<string, unknown>, options: { toolName?: string } = {}): Promise<CanvasExecutableSpec | undefined> {
  const src = plugin.bundle ?? ''
  if (!src) return undefined

  let compileFn: ((args: Record<string, unknown>) => CanvasExecutableSpec | Promise<CanvasExecutableSpec>) | undefined

  if (src.includes('export{') || src.includes('export {') || /export\s+\{/.test(src)) {
    const blob = new Blob([src], { type: 'text/javascript' })
    const url = createObjectUrl(blob)
    try {
      const mod = await import(/* @vite-ignore */ url)
      compileFn = resolvePluginCompileFunction(mod, options.toolName)
    } finally {
      revokeObjectUrl(url)
    }
  } else {
    const fn = new Function('args', 'toolName', `"use strict";\n${src}\nif (toolName && typeof agentTools !== 'undefined' && agentTools && agentTools[toolName] && typeof agentTools[toolName].compile === 'function') return agentTools[toolName].compile(args);\nreturn typeof compile === 'function' ? compile(args) : undefined;`)
    const result = await fn(args, options.toolName)
    return isCanvasExecutableSpec(result) ? result : undefined
  }

  if (typeof compileFn !== 'function') return undefined
  const result = await compileFn(args)
  return isCanvasExecutableSpec(result) ? result : undefined
}

function resolvePluginRunFunction(mod: Record<string, unknown>, toolName?: string): (host: ClientPluginHost, args: Record<string, unknown>) => Promise<ClientPluginResult> {
  if (toolName && typeof mod.runAgentTool === 'function') {
    return (host, args) => (mod.runAgentTool as (host: ClientPluginHost, call: { name: string; args: Record<string, unknown> }) => Promise<ClientPluginResult>)(host, { name: toolName, args })
  }
  const agentTools = mod.agentTools
  if (toolName && agentTools && typeof agentTools === 'object') {
    const tool = (agentTools as Record<string, unknown>)[toolName]
    if (tool && typeof tool === 'object' && typeof (tool as { run?: unknown }).run === 'function') {
      return (tool as { run: (host: ClientPluginHost, args: Record<string, unknown>) => Promise<ClientPluginResult> }).run
    }
  }
  return mod.run as (host: ClientPluginHost, args: Record<string, unknown>) => Promise<ClientPluginResult>
}

function resolvePluginCompileFunction(mod: Record<string, unknown>, toolName?: string): ((args: Record<string, unknown>) => CanvasExecutableSpec | Promise<CanvasExecutableSpec>) | undefined {
  const agentTools = mod.agentTools
  if (toolName && agentTools && typeof agentTools === 'object') {
    const tool = (agentTools as Record<string, unknown>)[toolName]
    if (tool && typeof tool === 'object' && typeof (tool as { compile?: unknown }).compile === 'function') {
      return (tool as { compile: (args: Record<string, unknown>) => CanvasExecutableSpec | Promise<CanvasExecutableSpec> }).compile
    }
  }
  return typeof mod.compile === 'function'
    ? mod.compile as (args: Record<string, unknown>) => CanvasExecutableSpec | Promise<CanvasExecutableSpec>
    : undefined
}

// ── Validation ────────────────────────────────────────────────────────────────

function isClientPluginManifest(value: unknown): value is ClientPluginManifest {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ClientPluginManifest>
  const hasContributions = Boolean(
    item.contributes?.agentSkills?.length ||
    item.contributes?.mcpServers?.length ||
    item.contributes?.canvasNodes?.length ||
    item.contributes?.tools?.length ||
    item.contributes?.cards?.length ||
    item.contributes?.commands?.length
  )
  return (
    typeof item.id === 'string' && item.id.trim().length > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    typeof item.version === 'string' && item.version.trim().length > 0 &&
    (typeof item.bundle === 'string' || typeof item.bundleUrl === 'string' || hasContributions)
  )
}

function isCanvasExecutableSpec(value: unknown): value is CanvasExecutableSpec {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CanvasExecutableSpec>
  return item.executor === 'ai_model' && typeof item.capability === 'string'
}

// ── Runtime ───────────────────────────────────────────────────────────────────

function createHost(): ClientPluginHost {
  return {
    api: {
      get: (path) => api.get(path).then((r) => r.data),
      post: (path, body) => api.post(path, body).then((r) => r.data),
      patch: (path, body) => api.patch(path, body).then((r) => r.data),
      delete: (path) => api.delete(path).then((r) => r.data),
    },
    generation: {
      models: (capability) => api.get(`/models?capability=${encodeURIComponent(capability)}`).then((r) => r.data),
      modelConfigs: () => api.get('/models').then((r) => r.data),
      submit: submitGenerationJobViaHost,
      getJob: getGenerationJobViaHost,
    },
    resources: {
      list: () => api.get('/resources').then((r) => r.data),
      upload: uploadResourceViaRuntime,
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

export async function uploadResourceViaRuntime(req: UploadResourceRequest): Promise<RawResource> {
  if (!req.filename?.trim()) throw new Error('filename is required')
  if (!req.data_base64 && req.text === undefined) throw new Error('data_base64 or text is required')

  const mimeType = req.mime_type || 'application/octet-stream'
  const bytes = req.data_base64 ? base64ToUint8Array(req.data_base64) : undefined
  const blob = bytes ? new Blob([bytes], { type: mimeType }) : new Blob([req.text ?? ''], { type: mimeType })
  const fd = new FormData()
  fd.append('file', blob, req.filename)
  if (req.folder_id !== undefined) fd.append('folder_id', String(req.folder_id))
  return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
}

function base64ToUint8Array(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function submitGenerationJobViaHost(req: GenerateMediaRequest): Promise<GenerationJob> {
  const inputIDs = req.input_resource_ids ?? []
  const jobType = req.job_type ?? (inputIDs.length > 0 ? 'image_edit' : 'image')
  const modelId = await resolveRuntimeModelId(req, jobType)
  const title = typeof req.title === 'string' && req.title.trim()
    ? req.title.trim()
    : defaultGenerationJobTitle(jobType)
  const job = await api.post('/jobs', {
    model_id: modelId,
    job_type: jobType,
    feature_key: req.feature_key ?? 'client_plugin',
    title,
    prompt: req.prompt,
    input_resource_ids: inputIDs,
    aspect_ratio: req.aspect_ratio,
    ...(req.duration !== undefined ? { duration: req.duration } : {}),
    extra_params: JSON.stringify(req.extra_params ?? {}),
  }).then((r) => r.data)
  console.info('[client-plugin:generation.submit] backend job', {
    jobType,
    featureKey: req.feature_key ?? 'client_plugin',
    modelId,
    ...summarizeRawGenerationJob(job),
  })
  const normalized = normalizeGenerationJob(job)
  console.info('[client-plugin:generation.submit] normalized job', {
    jobType,
    id: normalized.id,
    status: normalized.status,
    outputResourceCount: normalized.outputResourceIds?.length ?? 0,
  })
  return normalized
}

export async function getGenerationJobViaHost(id: number | string): Promise<GenerationJob> {
  const jobId = Number(id)
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('generation job id is required')
  const job = await api.get(`/jobs/${jobId}`).then((r) => r.data)
  return normalizeGenerationJob(job)
}

async function resolveRuntimeModelId(req: GenerateMediaRequest, jobType: GenerateMediaJobType): Promise<string | undefined> {
  if (typeof req.model_id === 'string' && req.model_id.trim()) return req.model_id.trim()
  const capability = jobType === 'image_edit' ? 'image_edit' : jobType.startsWith('video') ? 'video' : 'image'
  const models = await api.get(`/models?capability=${encodeURIComponent(capability)}`).then((r) => r.data as PublicModel[])
  const model = models[0]
  return model ? (model.model_id || model.logical_model_id) : undefined
}

function normalizeGenerationJob(value: unknown): GenerationJob {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const id = Number(item.ID ?? item.id)
  return {
    id: Number.isInteger(id) && id > 0 ? id : 0,
    status: typeof item.status === 'string' ? item.status : 'submitted',
    error: typeof item.error === 'string' ? item.error : typeof item.error_msg === 'string' ? item.error_msg : undefined,
    outputResourceIds: Array.isArray(item.output_resource_ids)
      ? item.output_resource_ids.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0)
      : undefined,
    raw: value,
  }
}

function summarizeRawGenerationJob(value: unknown): Record<string, unknown> {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    rawID: item.ID,
    rawId: item.id,
    rawStatus: item.status,
    rawJobType: item.job_type,
    rawFeatureKey: item.feature_key,
    rawKeys: Object.keys(item),
  }
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

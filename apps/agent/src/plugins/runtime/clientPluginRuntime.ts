import type { JSONValue } from '../../shared/protocol/types.js'
import { isRecord } from '../../shared/json/jsonValue.js'

export interface AgentClientPluginManifest {
  id: string
  name: string
  version: string
  bundle?: string
  bundleUrl?: string
}

export interface AgentClientPluginRuntimeAuth {
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export interface AgentClientPluginRunInput {
  plugin: AgentClientPluginManifest
  args?: Record<string, unknown>
  toolName?: string
  auth?: AgentClientPluginRuntimeAuth
}

export interface AgentClientPluginResult {
  content?: Array<{ type: string; text?: string }>
  data?: unknown
  isError?: boolean
}

export interface AgentClientPluginHost {
  api: {
    get: <T = unknown>(path: string) => Promise<T>
    post: <T = unknown>(path: string, body?: unknown) => Promise<T>
    patch: <T = unknown>(path: string, body?: unknown) => Promise<T>
    delete: <T = unknown>(path: string) => Promise<T>
  }
  generation: {
    models: (capability: string) => Promise<unknown>
    modelConfigs: () => Promise<unknown>
    submit: (req: GenerateMediaRequest) => Promise<GenerationJob>
    getJob: (id: number | string) => Promise<GenerationJob>
  }
  resources: {
    list: () => Promise<unknown>
    upload: (req: UploadResourceRequest) => Promise<unknown>
  }
  sleep: (ms: number) => Promise<void>
}

export interface AgentClientPluginHostCallInput {
  method: string
  args?: unknown[]
  auth?: AgentClientPluginRuntimeAuth
}

type GenerateMediaJobType = 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v'

interface GenerateMediaRequest {
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

interface GenerationJob {
  id: number
  status: string
  error?: string
  outputResourceIds?: number[]
  raw?: unknown
}

interface UploadResourceRequest {
  filename?: string
  mime_type?: string
  data_base64?: string
  text?: string
  folder_id?: number
}

export async function runAgentClientPlugin(input: AgentClientPluginRunInput): Promise<AgentClientPluginResult> {
  const src = executablePluginBundle(input.plugin)
  const args = normalizeArgs(input.args)
  const host = createAgentClientPluginHost(input.auth)

  if (isESMPluginBundle(src)) {
    const mod = await importPluginModule(src)
    const runFn = resolvePluginRunFunction(mod, input.toolName)
    if (typeof runFn !== 'function') throw new Error('plugin pack does not export a run() function')
    return normalizePluginResult(await runFn(host, args))
  }

  const fn = new Function('mov', 'args', 'toolName', `"use strict";\n${src}\nif (toolName && typeof runAgentTool === 'function') return runAgentTool(mov, { name: toolName, args });\nif (toolName && typeof agentTools !== 'undefined' && agentTools && agentTools[toolName] && typeof agentTools[toolName].run === 'function') return agentTools[toolName].run(mov, args);\nreturn run(mov, args);`)
  return normalizePluginResult(await fn(host, args, input.toolName))
}

export async function compileAgentClientPlugin(input: AgentClientPluginRunInput): Promise<unknown | undefined> {
  const src = executablePluginBundle(input.plugin)
  const args = normalizeArgs(input.args)

  if (isESMPluginBundle(src)) {
    const mod = await importPluginModule(src)
    const compileFn = resolvePluginCompileFunction(mod, input.toolName)
    return typeof compileFn === 'function' ? compileFn(args) : undefined
  }

  const fn = new Function('args', 'toolName', `"use strict";\n${src}\nif (toolName && typeof agentTools !== 'undefined' && agentTools && agentTools[toolName] && typeof agentTools[toolName].compile === 'function') return agentTools[toolName].compile(args);\nreturn typeof compile === 'function' ? compile(args) : undefined;`)
  return await fn(args, input.toolName)
}

export async function dispatchAgentClientPluginHostCall(input: AgentClientPluginHostCallInput): Promise<unknown> {
  const host = createAgentClientPluginHost(input.auth)
  const args = Array.isArray(input.args) ? input.args : []
  switch (input.method) {
    case 'api.get':
      return host.api.get(String(args[0] ?? ''))
    case 'api.post':
      return host.api.post(String(args[0] ?? ''), args[1])
    case 'api.patch':
      return host.api.patch(String(args[0] ?? ''), args[1])
    case 'api.delete':
      return host.api.delete(String(args[0] ?? ''))
    case 'generation.models':
      return host.generation.models(String(args[0] ?? ''))
    case 'generation.modelConfigs':
      return host.generation.modelConfigs()
    case 'resources.list':
      return host.resources.list()
    case 'resources.upload':
      return host.resources.upload(isRecord(args[0]) ? args[0] as UploadResourceRequest : {})
    case 'generation.submit':
      return host.generation.submit(isRecord(args[0]) ? args[0] as unknown as GenerateMediaRequest : { prompt: '' })
    case 'generation.getJob':
      return host.generation.getJob(args[0] as number | string)
    case 'sleep':
      return host.sleep(Number(args[0] ?? 0))
    default:
      throw new Error(`unknown plugin host method: ${input.method}`)
  }
}

function executablePluginBundle(plugin: AgentClientPluginManifest): string {
  const src = typeof plugin.bundle === 'string' ? plugin.bundle : ''
  if (!src) throw new Error('plugin has no executable script or bundle')
  return src
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isESMPluginBundle(src: string): boolean {
  return src.includes('export{') || src.includes('export {') || /export\s+\{/.test(src)
}

async function importPluginModule(src: string): Promise<Record<string, unknown>> {
  const url = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`
  return await import(url) as Record<string, unknown>
}

function resolvePluginRunFunction(mod: Record<string, unknown>, toolName?: string): ((host: AgentClientPluginHost, args: Record<string, unknown>) => Promise<AgentClientPluginResult> | AgentClientPluginResult) | undefined {
  if (toolName && typeof mod.runAgentTool === 'function') {
    return (host, args) => (mod.runAgentTool as (host: AgentClientPluginHost, call: { name: string; args: Record<string, unknown> }) => Promise<AgentClientPluginResult> | AgentClientPluginResult)(host, { name: toolName, args })
  }
  const agentTools = mod.agentTools
  if (toolName && agentTools && typeof agentTools === 'object') {
    const tool = (agentTools as Record<string, unknown>)[toolName]
    if (tool && typeof tool === 'object' && typeof (tool as { run?: unknown }).run === 'function') {
      return (tool as { run: (host: AgentClientPluginHost, args: Record<string, unknown>) => Promise<AgentClientPluginResult> | AgentClientPluginResult }).run
    }
  }
  return typeof mod.run === 'function'
    ? mod.run as (host: AgentClientPluginHost, args: Record<string, unknown>) => Promise<AgentClientPluginResult> | AgentClientPluginResult
    : undefined
}

function resolvePluginCompileFunction(mod: Record<string, unknown>, toolName?: string): ((args: Record<string, unknown>) => unknown | Promise<unknown>) | undefined {
  const agentTools = mod.agentTools
  if (toolName && agentTools && typeof agentTools === 'object') {
    const tool = (agentTools as Record<string, unknown>)[toolName]
    if (tool && typeof tool === 'object' && typeof (tool as { compile?: unknown }).compile === 'function') {
      return (tool as { compile: (args: Record<string, unknown>) => unknown | Promise<unknown> }).compile
    }
  }
  return typeof mod.compile === 'function'
    ? mod.compile as (args: Record<string, unknown>) => unknown | Promise<unknown>
    : undefined
}

function normalizePluginResult(result: unknown): AgentClientPluginResult {
  if (isRecord(result)) return result as AgentClientPluginResult
  return { content: [{ type: 'text', text: String(result ?? '') }], data: result }
}

function createAgentClientPluginHost(auth?: AgentClientPluginRuntimeAuth): AgentClientPluginHost {
  return {
    api: {
      get: (path) => backendJSON('GET', path, undefined, auth),
      post: (path, body) => backendJSON('POST', path, body, auth),
      patch: (path, body) => backendJSON('PATCH', path, body, auth),
      delete: (path) => backendJSON('DELETE', path, undefined, auth),
    },
    generation: {
      models: (capability) => backendJSON('GET', `/models?capability=${encodeURIComponent(capability)}`, undefined, auth),
      modelConfigs: () => backendJSON('GET', '/models', undefined, auth),
      submit: (req) => submitGenerationJobViaHost(req, auth),
      getJob: (id) => getGenerationJobViaHost(id, auth),
    },
    resources: {
      list: () => backendJSON('GET', '/resources', undefined, auth),
      upload: (req) => uploadResourceViaRuntime(req, auth),
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

async function backendJSON<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, auth?: AgentClientPluginRuntimeAuth): Promise<T> {
  const baseURL = normalizeBackendBaseURL(auth)
  const url = `${baseURL}${normalizeBackendPath(path)}`
  const res = await fetch(url, {
    method,
    headers: {
      ...backendAuthHeaders(auth),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  const parsed = parseJSONText(text)
  if (!res.ok) throw new Error(`backend ${method} ${normalizeBackendPath(path)} failed: HTTP ${res.status}${text ? ` ${text}` : ''}`)
  return parsed as T
}

async function uploadResourceViaRuntime(req: UploadResourceRequest, auth?: AgentClientPluginRuntimeAuth): Promise<unknown> {
  if (!req.filename?.trim()) throw new Error('filename is required')
  if (!req.data_base64 && req.text === undefined) throw new Error('data_base64 or text is required')

  const mimeType = req.mime_type || 'application/octet-stream'
  const bytes = req.data_base64 ? Buffer.from(req.data_base64, 'base64') : undefined
  const blob = bytes ? new Blob([bytes], { type: mimeType }) : new Blob([req.text ?? ''], { type: mimeType })
  const formData = new FormData()
  formData.append('file', blob, req.filename)
  if (req.folder_id !== undefined) formData.append('folder_id', String(req.folder_id))

  const res = await fetch(`${normalizeBackendBaseURL(auth)}/resources/upload`, {
    method: 'POST',
    headers: backendAuthHeaders(auth),
    body: formData,
  })
  const text = await res.text()
  const parsed = parseJSONText(text)
  if (!res.ok) throw new Error(`backend POST /resources/upload failed: HTTP ${res.status}${text ? ` ${text}` : ''}`)
  return parsed
}

async function submitGenerationJobViaHost(req: GenerateMediaRequest, auth?: AgentClientPluginRuntimeAuth): Promise<GenerationJob> {
  const inputIDs = req.input_resource_ids ?? []
  const jobType = req.job_type ?? (inputIDs.length > 0 ? 'image_edit' : 'image')
  const modelId = await resolveRuntimeModelId(req, jobType, auth)
  const title = typeof req.title === 'string' && req.title.trim()
    ? req.title.trim()
    : defaultGenerationJobTitle(jobType)
  const job = await backendJSON('POST', '/jobs', {
    model_id: modelId,
    job_type: jobType,
    feature_key: req.feature_key ?? 'client_plugin',
    title,
    prompt: req.prompt,
    input_resource_ids: inputIDs,
    aspect_ratio: req.aspect_ratio,
    ...(req.duration !== undefined ? { duration: req.duration } : {}),
    extra_params: JSON.stringify(req.extra_params ?? {}),
  }, auth)
  return normalizeGenerationJob(job)
}

async function getGenerationJobViaHost(id: number | string, auth?: AgentClientPluginRuntimeAuth): Promise<GenerationJob> {
  const jobId = Number(id)
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('generation job id is required')
  return normalizeGenerationJob(await backendJSON('GET', `/jobs/${jobId}`, undefined, auth))
}

async function resolveRuntimeModelId(req: GenerateMediaRequest, jobType: GenerateMediaJobType, auth?: AgentClientPluginRuntimeAuth): Promise<string | undefined> {
  if (typeof req.model_id === 'string' && req.model_id.trim()) return req.model_id.trim()
  const capability = jobType === 'image_edit' ? 'image_edit' : jobType.startsWith('video') ? 'video' : 'image'
  const models = await backendJSON('GET', `/models?capability=${encodeURIComponent(capability)}`, undefined, auth)
  const model = Array.isArray(models) && isRecord(models[0]) ? models[0] : undefined
  return typeof model?.model_id === 'string'
    ? model.model_id
    : typeof model?.logical_model_id === 'string'
      ? model.logical_model_id
      : undefined
}

function normalizeGenerationJob(value: unknown): GenerationJob {
  const item = isRecord(value) ? value : {}
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

function normalizeBackendBaseURL(auth?: AgentClientPluginRuntimeAuth): string {
  const value = auth?.backendAPIBaseURL?.trim().replace(/\/+$/, '')
  if (!value) throw new Error('backendAPIBaseURL is required for plugin host backend access')
  return value
}

function normalizeBackendPath(path: string): string {
  const trimmed = path.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function backendAuthHeaders(auth?: AgentClientPluginRuntimeAuth): Record<string, string> {
  return auth?.backendAuthToken ? { Authorization: `Bearer ${auth.backendAuthToken}` } : {}
}

function parseJSONText(text: string): JSONValue | undefined {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
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

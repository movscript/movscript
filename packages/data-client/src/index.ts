import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspace/node'

export const DATA_SERVICE_NAME = 'movscript.data.service'
export const MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA = 'movscript.data-service-config.v1'
export const MOVSCRIPT_DATA_SERVICE_AUTH_SCHEMA = 'movscript.data-service-auth.v1'
export const MOVSCRIPT_DATA_SERVICE_CONFIG_FILE_NAME = 'config.json'
export const MOVSCRIPT_DATA_SERVICE_AUTH_FILE_NAME = 'auth.json'
export const MOVSCRIPT_DEFAULT_DATA_SERVICE_BASE_URL = 'http://localhost:8765'

export interface MovScriptWorkspaceRealm {
  kind: 'local' | 'cloud'
  id: string
}

export interface MovScriptDataServicePaths {
  workspaceDir: string
  controlDir: string
  dataServiceDir: string
  dataServiceRealmsDir: string
  configPath: string
  authPath: string
}

export interface MovScriptDataServiceConfig {
  schema: typeof MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA
  baseURL: string
  realm?: MovScriptWorkspaceRealm
  activeUserId?: string | number
  updatedAt: string
}

export interface MovScriptDataServiceGitCredential {
  provider: 'gitea'
  username: string
  token?: string
  maskedToken?: string
  status?: string
  lastError?: string
}

export interface MovScriptDataServiceAuth {
  schema: typeof MOVSCRIPT_DATA_SERVICE_AUTH_SCHEMA
  tokenType: 'Bearer'
  token: string
  realm?: MovScriptWorkspaceRealm
  gitCredential?: MovScriptDataServiceGitCredential
  user?: {
    id?: string | number
    username?: string
    displayName?: string
    primaryEmail?: string
    locale?: string
    systemRole?: string
  }
  expiresAt?: string
  updatedAt: string
}

export interface MovScriptDataServiceSession {
  workspaceDir: string
  baseURL: string
  apiBaseURL: string
  realm?: MovScriptWorkspaceRealm
  token?: string
  tokenType: 'Bearer'
  userId?: string
  user?: MovScriptDataServiceAuth['user']
  configPath: string
  authPath: string
}

export interface MovScriptDataServiceSessionInput {
  workspaceDir?: string
  server?: string
  token?: string
  userId?: string | number
  realm?: MovScriptWorkspaceRealm
}

export interface DataServiceBinaryProgress {
  path: string
  receivedBytes: number
  totalBytes?: number
  done: boolean
}

export interface DataServiceGetBinaryOptions {
  maxBytes?: number
  onProgress?: (progress: DataServiceBinaryProgress) => void
}

export interface DataServiceClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
}

export interface DataServiceDiscoveryOptions {
  baseUrl?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
}

export class DataServiceClient {
  readonly baseUrl: string
  private readonly env: NodeJS.ProcessEnv
  private readonly fetchImpl: typeof fetch

  constructor(options: DataServiceClientOptions) {
    const baseUrl = normalizeDataServiceBaseUrl(options.baseUrl)
    if (!baseUrl) throw new Error('data service baseUrl is required')
    this.baseUrl = baseUrl
    this.env = options.env ?? process.env
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  }

  async getBinary(path: string, options: DataServiceGetBinaryOptions = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
    const normalizedPath = normalizeDataServiceAPIPath(path)
    const response = await this.fetchImpl(dataServiceURL(this.baseUrl, normalizedPath), {
      headers: dataServiceHeaders({ env: this.env }),
    })
    if (!response.ok) {
      throw await DataServiceHTTPError.fromResponse('GET', normalizedPath, response)
    }
    const contentLengthHeader = response.headers.get('content-length')
    const contentLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader)
    if (options.maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      throw new Error(`data service GET ${normalizedPath} returned content-length ${contentLength}, above maxBytes=${options.maxBytes}`)
    }
    const bytes = await readBinaryResponse(normalizedPath, response, {
      maxBytes: options.maxBytes,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
      onProgress: options.onProgress,
    })
    if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
      throw new Error(`data service GET ${normalizedPath} returned ${bytes.length} bytes, above maxBytes=${options.maxBytes}`)
    }
    return {
      bytes,
      ...(response.headers.get('content-type') ? { contentType: response.headers.get('content-type') ?? undefined } : {}),
      ...(Number.isFinite(contentLength) ? { contentLength } : {}),
    }
  }

  async postMultipart(path: string, form: FormData, userId?: unknown): Promise<unknown> {
    const normalizedPath = normalizeDataServiceAPIPath(path)
    const response = await this.fetchImpl(dataServiceURL(this.baseUrl, normalizedPath), {
      method: 'POST',
      headers: dataServiceHeaders({ env: this.env, userId }),
      body: form,
    })
    if (!response.ok) {
      throw await DataServiceHTTPError.fromResponse('POST', normalizedPath, response)
    }
    return response.json()
  }
}

export class DataServiceHTTPError extends Error {
  readonly method: string
  readonly path: string
  readonly status: number
  readonly body: unknown
  readonly rawBody: string

  constructor(method: string, path: string, status: number, body: unknown, rawBody: string) {
    super(`data service ${method} ${path} failed with HTTP ${status}`)
    this.name = 'DataServiceHTTPError'
    this.method = method
    this.path = path
    this.status = status
    this.body = body
    this.rawBody = rawBody
  }

  static async fromResponse(method: string, path: string, response: Response): Promise<DataServiceHTTPError> {
    const rawBody = await response.text()
    let body: unknown = rawBody
    if (rawBody) {
      try {
        body = JSON.parse(rawBody)
      } catch {
        body = rawBody
      }
    }
    return new DataServiceHTTPError(method, path, response.status, body, rawBody)
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      method: this.method,
      path: this.path,
      status: this.status,
      body: this.body,
    }
  }
}

export function createDataServiceClientFromRuntime(options: DataServiceDiscoveryOptions = {}): DataServiceClient {
  const baseUrl = resolveDataServiceBaseUrl(options)
  if (!baseUrl) {
    throw new Error('movscript.data.service endpoint was not found; start the local runtime daemon with local data plane or set MOVSCRIPT_DATA_SERVICE_URL')
  }
  return new DataServiceClient({ baseUrl, env: options.env })
}

export function resolveDataServiceBaseUrl(options: DataServiceDiscoveryOptions = {}): string | undefined {
  const env = options.env ?? process.env
  const explicit = normalizeDataServiceBaseUrl(options.baseUrl)
    ?? normalizeDataServiceBaseUrl(env.MOVSCRIPT_DATA_SERVICE_URL)
    ?? normalizeDataServiceBaseUrl(env.MOVSCRIPT_DATA_SERVICE_BASE_URL)
  if (explicit) return explicit

  const homeDir = options.homeDir ?? resolveMovScriptHomeDir({ env })
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = findRuntimeEndpoint(snapshot, DATA_SERVICE_NAME)
    ?? findRuntimeService(snapshot, DATA_SERVICE_NAME)?.endpoint
  return normalizeDataServiceBaseUrl(endpointURL(endpoint))
}

export function normalizeDataServiceBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('data service baseUrl must use http or https')
  }
  return url.toString().replace(/\/+$/, '')
}

export function resolveMovScriptDataServicePaths(workspaceDir = process.cwd(), realm?: MovScriptWorkspaceRealm): MovScriptDataServicePaths {
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const controlDir = root.controlDir
  const dataServiceDir = join(controlDir, 'data-service')
  const dataServiceRealmsDir = join(dataServiceDir, 'realms')
  const authRealm = normalizeRealm(realm) ?? { kind: 'local' as const, id: 'local' }
  return {
    workspaceDir: root.workspaceDir,
    controlDir,
    dataServiceDir,
    dataServiceRealmsDir,
    configPath: join(dataServiceDir, MOVSCRIPT_DATA_SERVICE_CONFIG_FILE_NAME),
    authPath: join(dataServiceRealmsDir, ...dataServiceRealmPath(authRealm), MOVSCRIPT_DATA_SERVICE_AUTH_FILE_NAME),
  }
}

export function defaultMovScriptDataServiceConfig(baseURL = MOVSCRIPT_DEFAULT_DATA_SERVICE_BASE_URL): MovScriptDataServiceConfig {
  return {
    schema: MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA,
    baseURL: normalizeDataServiceRootBaseURL(baseURL),
    updatedAt: new Date().toISOString(),
  }
}

export function readMovScriptDataServiceConfig(workspaceDir = process.cwd()): MovScriptDataServiceConfig {
  const paths = resolveMovScriptDataServicePaths(workspaceDir)
  const parsed = readJSON(paths.configPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA) return defaultMovScriptDataServiceConfig()
  const baseURL = stringField(parsed.baseURL) ?? MOVSCRIPT_DEFAULT_DATA_SERVICE_BASE_URL
  const realm = normalizeRealm(parsed.realm)
  const activeUserId = idField(parsed.activeUserId)
  return {
    schema: MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA,
    baseURL: normalizeDataServiceRootBaseURL(baseURL),
    ...(realm ? { realm } : {}),
    ...(activeUserId !== undefined ? { activeUserId } : {}),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
  }
}

export function writeMovScriptDataServiceConfig(
  workspaceDir: string | undefined,
  config: Omit<MovScriptDataServiceConfig, 'schema' | 'updatedAt'> & Partial<MovScriptDataServiceConfig>,
): MovScriptDataServiceConfig {
  const paths = resolveMovScriptDataServicePaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const realm = normalizeRealm(config.realm)
  const next: MovScriptDataServiceConfig = {
    schema: MOVSCRIPT_DATA_SERVICE_CONFIG_SCHEMA,
    baseURL: normalizeDataServiceRootBaseURL(config.baseURL),
    ...(realm ? { realm } : {}),
    ...(config.activeUserId !== undefined ? { activeUserId: config.activeUserId } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.configPath, next)
  return next
}

export function readMovScriptDataServiceAuth(workspaceDir = process.cwd(), realmInput?: MovScriptWorkspaceRealm): MovScriptDataServiceAuth | undefined {
  const config = readMovScriptDataServiceConfig(workspaceDir)
  const requestedRealm = normalizeRealm(realmInput) ?? config.realm
  const paths = resolveMovScriptDataServicePaths(workspaceDir, requestedRealm)
  const parsed = readJSON(paths.authPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_DATA_SERVICE_AUTH_SCHEMA) return undefined
  const token = stringField(parsed.token)
  if (!token) return undefined
  const tokenType = parsed.tokenType === 'Bearer' ? 'Bearer' : undefined
  if (!tokenType) return undefined
  const user = normalizeAuthUser(parsed.user)
  const gitCredential = normalizeGitCredential(parsed.gitCredential ?? parsed.git_credential)
  const realm = normalizeRealm(parsed.realm) ?? requestedRealm
  return {
    schema: MOVSCRIPT_DATA_SERVICE_AUTH_SCHEMA,
    tokenType,
    token,
    ...(realm ? { realm } : {}),
    ...(gitCredential ? { gitCredential } : {}),
    ...(user ? { user } : {}),
    ...(stringField(parsed.expiresAt) ? { expiresAt: stringField(parsed.expiresAt) } : {}),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
  }
}

export function writeMovScriptDataServiceAuth(
  workspaceDir: string | undefined,
  auth: Omit<MovScriptDataServiceAuth, 'schema' | 'updatedAt' | 'tokenType'> & Partial<MovScriptDataServiceAuth>,
): MovScriptDataServiceAuth {
  const realm = normalizeRealm(auth.realm) ?? readMovScriptDataServiceConfig(workspaceDir).realm
  const paths = resolveMovScriptDataServicePaths(workspaceDir, realm)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const gitCredential = normalizeGitCredential(auth.gitCredential)
  const user = normalizeAuthUser(auth.user)
  const next: MovScriptDataServiceAuth = {
    schema: MOVSCRIPT_DATA_SERVICE_AUTH_SCHEMA,
    tokenType: 'Bearer',
    token: auth.token,
    ...(realm ? { realm } : {}),
    ...(gitCredential ? { gitCredential } : {}),
    ...(user ? { user } : {}),
    ...(auth.expiresAt ? { expiresAt: auth.expiresAt } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.authPath, next, 0o600)
  return next
}

export function clearMovScriptDataServiceAuth(workspaceDir = process.cwd()): void {
  const paths = resolveMovScriptDataServicePaths(workspaceDir, readMovScriptDataServiceConfig(workspaceDir).realm)
  rmSync(paths.authPath, { force: true })
}

export function resolveMovScriptDataServiceSession(input: MovScriptDataServiceSessionInput = {}): MovScriptDataServiceSession {
  const root = resolveMovScriptDataServicePaths(input.workspaceDir)
  const config = readMovScriptDataServiceConfig(root.workspaceDir)
  const realm = normalizeRealm(input.realm) ?? config.realm
  const paths = resolveMovScriptDataServicePaths(root.workspaceDir, realm)
  const auth = readMovScriptDataServiceAuth(paths.workspaceDir, realm)
  const token = stringField(input.token) ?? stringField(process.env.MOVSCRIPT_DATA_SERVICE_TOKEN) ?? auth?.token
  const userId = idField(input.userId)
    ?? idField(auth?.user?.id)
    ?? idField(config.activeUserId)
  const baseURL = normalizeDataServiceRootBaseURL(
    stringField(input.server)
      ?? stringField(process.env.MOVSCRIPT_DATA_SERVICE_URL)
      ?? config.baseURL,
  )
  return {
    workspaceDir: paths.workspaceDir,
    baseURL,
    apiBaseURL: normalizeDataServiceAPIBaseURL(baseURL),
    ...(realm ? { realm } : {}),
    ...(token ? { token } : {}),
    tokenType: 'Bearer',
    ...(userId !== undefined ? { userId: String(userId) } : {}),
    ...(auth?.user ? { user: auth.user } : {}),
    configPath: paths.configPath,
    authPath: paths.authPath,
  }
}

export function normalizeDataServiceRootBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  const withoutAPI = trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
  return withoutAPI || MOVSCRIPT_DEFAULT_DATA_SERVICE_BASE_URL
}

export function normalizeDataServiceAPIBaseURL(value: string): string {
  return `${normalizeDataServiceRootBaseURL(value)}/api/v1`
}

export function normalizeDataServiceAPIPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('data service path is required')
  const absolutePath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (absolutePath.startsWith('/api/v1/')) return absolutePath
  return `/api/v1${absolutePath}`
}

function dataServiceURL(baseUrl: string, apiPath: string): string {
  if (baseUrl.endsWith('/api/v1')) return `${baseUrl}${apiPath.replace(/^\/api\/v1/, '')}`
  return `${baseUrl}${apiPath}`
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function dataServiceRealmPath(realm: MovScriptWorkspaceRealm): string[] {
  if (realm.kind === 'local') return ['local']
  return ['cloud', String(realm.id)]
}

function dataServiceHeaders(input: {
  env: NodeJS.ProcessEnv
  userId?: unknown
}): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = stringEnv(input.env.MOVSCRIPT_DATA_SERVICE_TOKEN)
    ?? stringEnv(input.env.MOVSCRIPT_AUTH_TOKEN)
  if (token) headers.Authorization = `Bearer ${token}`
  const userId = typeof input.userId === 'number' || typeof input.userId === 'string'
    ? String(input.userId)
    : stringEnv(input.env.MOVSCRIPT_USER_ID)
  if (userId) headers['X-User-ID'] = userId
  return headers
}

async function readBinaryResponse(
  path: string,
  response: Response,
  options: {
    maxBytes?: number
    contentLength?: number
    onProgress?: (progress: DataServiceBinaryProgress) => void
  },
): Promise<Buffer> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer())
    options.onProgress?.({
      path,
      receivedBytes: bytes.length,
      ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
      done: true,
    })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    receivedBytes += value.byteLength
    if (options.maxBytes !== undefined && receivedBytes > options.maxBytes) {
      throw new Error(`data service GET ${path} returned more than maxBytes=${options.maxBytes}`)
    }
    chunks.push(value)
    options.onProgress?.({
      path,
      receivedBytes,
      ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
      done: false,
    })
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  options.onProgress?.({
    path,
    receivedBytes,
    ...(options.contentLength !== undefined ? { totalBytes: options.contentLength } : {}),
    done: true,
  })
  return bytes
}

function stringEnv(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function readJSON(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(filePath: string, value: unknown, mode?: number): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode })
  renameSync(tmpPath, filePath)
}

function normalizeAuthUser(value: unknown): MovScriptDataServiceAuth['user'] | undefined {
  if (!isRecord(value)) return undefined
  const id = idField(value.id)
  const username = stringField(value.username)
  const displayName = stringField(value.displayName) ?? stringField(value.display_name)
  const primaryEmail = stringField(value.primaryEmail) ?? stringField(value.primary_email)
  const locale = stringField(value.locale)
  const systemRole = stringField(value.systemRole) ?? stringField(value.system_role)
  const user = {
    ...(id !== undefined ? { id } : {}),
    ...(username ? { username } : {}),
    ...(displayName ? { displayName } : {}),
    ...(primaryEmail ? { primaryEmail } : {}),
    ...(locale ? { locale } : {}),
    ...(systemRole ? { systemRole } : {}),
  }
  return Object.keys(user).length > 0 ? user : undefined
}

function normalizeGitCredential(value: unknown): MovScriptDataServiceGitCredential | undefined {
  if (!isRecord(value)) return undefined
  const provider = stringField(value.provider)
  const username = stringField(value.username)
  if (provider !== 'gitea' || !username) return undefined
  const token = stringField(value.token)
  const maskedToken = stringField(value.maskedToken) ?? stringField(value.masked_token)
  const status = stringField(value.status)
  const lastError = stringField(value.lastError) ?? stringField(value.last_error)
  return {
    provider,
    username,
    ...(token ? { token } : {}),
    ...(maskedToken ? { maskedToken } : {}),
    ...(status ? { status } : {}),
    ...(lastError ? { lastError } : {}),
  }
}

function normalizeRealm(value: unknown): MovScriptWorkspaceRealm | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'local' || value.kind === 'cloud' ? value.kind : undefined
  if (!kind) return undefined
  if (kind === 'local') return { kind, id: 'local' }
  const id = idField(value.id)
  return id ? { kind, id: String(id) } : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

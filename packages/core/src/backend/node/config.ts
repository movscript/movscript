import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceRealm,
} from '../../workspace/node/paths.js'

export const MOVSCRIPT_BACKEND_CONFIG_SCHEMA = 'movscript.backend-config.v1'
export const MOVSCRIPT_BACKEND_AUTH_SCHEMA = 'movscript.backend-auth.v1'
export const MOVSCRIPT_BACKEND_CONFIG_FILE_NAME = 'config.json'
export const MOVSCRIPT_BACKEND_AUTH_FILE_NAME = 'auth.json'
export const MOVSCRIPT_DEFAULT_BACKEND_BASE_URL = 'http://localhost:8766'

export interface MovScriptBackendPaths {
  workspaceDir: string
  controlDir: string
  backendDir: string
  backendRealmsDir: string
  configPath: string
  authPath: string
}

export interface MovScriptBackendConfig {
  schema: typeof MOVSCRIPT_BACKEND_CONFIG_SCHEMA
  baseURL: string
  realm?: MovScriptWorkspaceRealm
  activeUserId?: string | number
  updatedAt: string
}

export interface MovScriptBackendAuth {
  schema: typeof MOVSCRIPT_BACKEND_AUTH_SCHEMA
  tokenType: 'Bearer'
  token: string
  realm?: MovScriptWorkspaceRealm
  gitCredential?: MovScriptBackendGitCredential
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

export interface MovScriptBackendGitCredential {
  provider: 'gitea'
  username: string
  token?: string
  maskedToken?: string
  status?: string
  lastError?: string
}

export interface MovScriptBackendSession {
  workspaceDir: string
  baseURL: string
  apiBaseURL: string
  token?: string
  tokenType: 'Bearer'
  userId?: string
  user?: MovScriptBackendAuth['user']
  configPath: string
  authPath: string
}

export interface MovScriptBackendSessionInput {
  workspaceDir?: string
  server?: string
  token?: string
  userId?: string | number
  realm?: MovScriptWorkspaceRealm
}

export function resolveMovScriptBackendPaths(workspaceDir = process.cwd(), realm?: MovScriptWorkspaceRealm): MovScriptBackendPaths {
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const backendRealmsDir = join(root.backendDir, 'realms')
  const authRealm = normalizeRealm(realm) ?? { kind: 'local' as const, id: 'local' }
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    backendDir: root.backendDir,
    backendRealmsDir,
    configPath: join(root.backendDir, MOVSCRIPT_BACKEND_CONFIG_FILE_NAME),
    authPath: join(backendRealmsDir, ...backendRealmPath(authRealm), MOVSCRIPT_BACKEND_AUTH_FILE_NAME),
  }
}

export function defaultMovScriptBackendConfig(baseURL = MOVSCRIPT_DEFAULT_BACKEND_BASE_URL): MovScriptBackendConfig {
  return {
    schema: MOVSCRIPT_BACKEND_CONFIG_SCHEMA,
    baseURL: normalizeBackendBaseURL(baseURL),
    updatedAt: new Date().toISOString(),
  }
}

export function readMovScriptBackendConfig(workspaceDir = process.cwd()): MovScriptBackendConfig {
  const paths = resolveMovScriptBackendPaths(workspaceDir)
  const parsed = readJSON(paths.configPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_BACKEND_CONFIG_SCHEMA) return defaultMovScriptBackendConfig()
  const baseURL = stringField(parsed.baseURL) ?? MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
  const realm = normalizeRealm(parsed.realm)
  const activeUserId = idField(parsed.activeUserId)
  return {
    schema: MOVSCRIPT_BACKEND_CONFIG_SCHEMA,
    baseURL: normalizeBackendBaseURL(baseURL),
    ...(realm ? { realm } : {}),
    ...(activeUserId !== undefined ? { activeUserId } : {}),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
  }
}

export function writeMovScriptBackendConfig(workspaceDir: string | undefined, config: Omit<MovScriptBackendConfig, 'schema' | 'updatedAt'> & Partial<MovScriptBackendConfig>): MovScriptBackendConfig {
  const paths = resolveMovScriptBackendPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const next: MovScriptBackendConfig = {
    schema: MOVSCRIPT_BACKEND_CONFIG_SCHEMA,
    baseURL: normalizeBackendBaseURL(config.baseURL),
    ...(normalizeRealm(config.realm) ? { realm: normalizeRealm(config.realm) } : {}),
    ...(config.activeUserId !== undefined ? { activeUserId: config.activeUserId } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.configPath, next)
  return next
}

export function readMovScriptBackendAuth(workspaceDir = process.cwd(), realmInput?: MovScriptWorkspaceRealm): MovScriptBackendAuth | undefined {
  const config = readMovScriptBackendConfig(workspaceDir)
  const requestedRealm = normalizeRealm(realmInput) ?? config.realm
  const paths = resolveMovScriptBackendPaths(workspaceDir, requestedRealm)
  const parsed = readJSON(paths.authPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_BACKEND_AUTH_SCHEMA) return undefined
  const token = stringField(parsed.token)
  if (!token) return undefined
  const tokenType = parsed.tokenType === 'Bearer' ? 'Bearer' : undefined
  if (!tokenType) return undefined
  const user = normalizeAuthUser(parsed.user)
  const gitCredential = normalizeGitCredential(parsed.gitCredential ?? parsed.git_credential)
  const realm = normalizeRealm(parsed.realm) ?? requestedRealm
  return {
    schema: MOVSCRIPT_BACKEND_AUTH_SCHEMA,
    tokenType,
    token,
    ...(realm ? { realm } : {}),
    ...(gitCredential ? { gitCredential } : {}),
    ...(user ? { user } : {}),
    ...(stringField(parsed.expiresAt) ? { expiresAt: stringField(parsed.expiresAt) } : {}),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
  }
}

export function writeMovScriptBackendAuth(workspaceDir: string | undefined, auth: Omit<MovScriptBackendAuth, 'schema' | 'updatedAt' | 'tokenType'> & Partial<MovScriptBackendAuth>): MovScriptBackendAuth {
  const realm = normalizeRealm(auth.realm) ?? readMovScriptBackendConfig(workspaceDir).realm
  const paths = resolveMovScriptBackendPaths(workspaceDir, realm)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const next: MovScriptBackendAuth = {
    schema: MOVSCRIPT_BACKEND_AUTH_SCHEMA,
    tokenType: 'Bearer',
    token: auth.token,
    ...(realm ? { realm } : {}),
    ...(normalizeGitCredential(auth.gitCredential) ? { gitCredential: normalizeGitCredential(auth.gitCredential) } : {}),
    ...(normalizeAuthUser(auth.user) ? { user: normalizeAuthUser(auth.user) } : {}),
    ...(auth.expiresAt ? { expiresAt: auth.expiresAt } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.authPath, next, 0o600)
  return next
}

export function clearMovScriptBackendAuth(workspaceDir = process.cwd()): void {
  const paths = resolveMovScriptBackendPaths(workspaceDir, readMovScriptBackendConfig(workspaceDir).realm)
  rmSync(paths.authPath, { force: true })
}

export function resolveMovScriptBackendSession(input: MovScriptBackendSessionInput = {}): MovScriptBackendSession {
  const root = resolveMovScriptBackendPaths(input.workspaceDir)
  const config = readMovScriptBackendConfig(root.workspaceDir)
  const realm = normalizeRealm(input.realm) ?? config.realm
  const paths = resolveMovScriptBackendPaths(root.workspaceDir, realm)
  const auth = readMovScriptBackendAuth(paths.workspaceDir, realm)
  const token = stringField(input.token) ?? stringField(process.env.MOVCLI_TOKEN) ?? auth?.token
  const userId = idField(input.userId)
    ?? idField(auth?.user?.id)
    ?? idField(config.activeUserId)
  const baseURL = normalizeBackendBaseURL(stringField(input.server) ?? stringField(process.env.MOVSCRIPT_API_BASE_URL) ?? config.baseURL)
  return {
    workspaceDir: paths.workspaceDir,
    baseURL,
    apiBaseURL: normalizeBackendAPIBaseURL(baseURL),
    ...(token ? { token } : {}),
    tokenType: 'Bearer',
    ...(userId !== undefined ? { userId: String(userId) } : {}),
    ...(auth?.user ? { user: auth.user } : {}),
    configPath: paths.configPath,
    authPath: paths.authPath,
  }
}

function backendRealmPath(realm: MovScriptWorkspaceRealm): string[] {
  if (realm.kind === 'local') return ['local']
  return ['cloud', String(realm.id)]
}

export function normalizeBackendBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  const withoutAPI = trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
  return withoutAPI || MOVSCRIPT_DEFAULT_BACKEND_BASE_URL
}

export function normalizeBackendAPIBaseURL(value: string): string {
  return `${normalizeBackendBaseURL(value)}/api/v1`
}

export async function loginMovScriptBackend(input: {
  workspaceDir?: string
  server?: string
  username: string
  password: string
}): Promise<{
  baseURL: string
  token: string
  tokenType: 'Bearer'
  expiresAt?: string
  user?: Record<string, unknown>
  gitCredential?: MovScriptBackendGitCredential
}> {
  const session = resolveMovScriptBackendSession({ workspaceDir: input.workspaceDir, server: input.server })
  const response = await backendPost(session, '/auth/login', {
    username: input.username,
    password: input.password,
  })
  const token = stringField(response.token)
  if (!token) throw new Error('auth login response did not include token')
  return {
    baseURL: session.baseURL,
    token,
    tokenType: 'Bearer',
    ...(stringField(response.expires_at) ? { expiresAt: stringField(response.expires_at) } : {}),
    ...(isRecord(response.user) ? { user: response.user } : {}),
    ...(normalizeGitCredential(response.git_credential) ? { gitCredential: normalizeGitCredential(response.git_credential) } : {}),
  }
}

export async function getMovScriptBackendMe(input: MovScriptBackendSessionInput = {}): Promise<Record<string, unknown>> {
  const session = resolveMovScriptBackendSession(input)
  return asRecord(await backendGet(session, '/auth/me'), 'auth me response')
}

async function backendGet(session: MovScriptBackendSession, path: string): Promise<unknown> {
  const res = await fetch(`${session.apiBaseURL}${path}`, { headers: backendHeaders(session) })
  if (!res.ok) throw new Error(await responseError('GET', path, res))
  return res.json()
}

async function backendPost(session: MovScriptBackendSession, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${session.apiBaseURL}${path}`, {
    method: 'POST',
    headers: backendHeaders(session, true),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await responseError('POST', path, res))
  return asRecord(await res.json(), `${path} response`)
}

function backendHeaders(session: MovScriptBackendSession, json = false): Record<string, string> {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {}
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  if (session.userId) headers['X-User-ID'] = session.userId
  return headers
}

async function responseError(method: string, path: string, res: Response): Promise<string> {
  const text = await res.text()
  return `${method} ${path} failed with ${res.status}${text.trim() ? `: ${text.trim()}` : ''}`
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

function normalizeAuthUser(value: unknown): MovScriptBackendAuth['user'] | undefined {
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

function normalizeGitCredential(value: unknown): MovScriptBackendGitCredential | undefined {
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

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

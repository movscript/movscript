import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureMovScriptWorkspaceRoot, resolveMovScriptWorkspaceRootPaths } from '../home/paths.js'

export const MOVSCRIPT_BACKEND_CONFIG_SCHEMA = 'movscript.backend-config.v1'
export const MOVSCRIPT_BACKEND_AUTH_SCHEMA = 'movscript.backend-auth.v1'
export const MOVSCRIPT_BACKEND_CONFIG_FILE_NAME = 'config.json'
export const MOVSCRIPT_BACKEND_AUTH_FILE_NAME = 'auth.json'
export const MOVSCRIPT_DEFAULT_BACKEND_BASE_URL = 'http://localhost:8765'

export interface MovScriptBackendPaths {
  workspaceDir: string
  controlDir: string
  backendDir: string
  configPath: string
  authPath: string
}

export interface MovScriptBackendConfig {
  schema: typeof MOVSCRIPT_BACKEND_CONFIG_SCHEMA
  baseURL: string
  activeUserId?: string | number
  updatedAt: string
}

export interface MovScriptBackendAuth {
  schema: typeof MOVSCRIPT_BACKEND_AUTH_SCHEMA
  tokenType: 'Bearer'
  token: string
  user?: {
    id?: string | number
    username?: string
    displayName?: string
  }
  expiresAt?: string
  updatedAt: string
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
}

export function resolveMovScriptBackendPaths(workspaceDir = process.cwd()): MovScriptBackendPaths {
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    backendDir: root.backendDir,
    configPath: join(root.backendDir, MOVSCRIPT_BACKEND_CONFIG_FILE_NAME),
    authPath: join(root.backendDir, MOVSCRIPT_BACKEND_AUTH_FILE_NAME),
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
  const activeUserId = idField(parsed.activeUserId)
  return {
    schema: MOVSCRIPT_BACKEND_CONFIG_SCHEMA,
    baseURL: normalizeBackendBaseURL(baseURL),
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
    ...(config.activeUserId !== undefined ? { activeUserId: config.activeUserId } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.configPath, next)
  return next
}

export function readMovScriptBackendAuth(workspaceDir = process.cwd()): MovScriptBackendAuth | undefined {
  const paths = resolveMovScriptBackendPaths(workspaceDir)
  const parsed = readJSON(paths.authPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_BACKEND_AUTH_SCHEMA) return undefined
  const token = stringField(parsed.token)
  if (!token) return undefined
  const tokenType = parsed.tokenType === 'Bearer' ? 'Bearer' : undefined
  if (!tokenType) return undefined
  const user = normalizeAuthUser(parsed.user)
  return {
    schema: MOVSCRIPT_BACKEND_AUTH_SCHEMA,
    tokenType,
    token,
    ...(user ? { user } : {}),
    ...(stringField(parsed.expiresAt) ? { expiresAt: stringField(parsed.expiresAt) } : {}),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
  }
}

export function writeMovScriptBackendAuth(workspaceDir: string | undefined, auth: Omit<MovScriptBackendAuth, 'schema' | 'updatedAt' | 'tokenType'> & Partial<MovScriptBackendAuth>): MovScriptBackendAuth {
  const paths = resolveMovScriptBackendPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  const next: MovScriptBackendAuth = {
    schema: MOVSCRIPT_BACKEND_AUTH_SCHEMA,
    tokenType: 'Bearer',
    token: auth.token,
    ...(normalizeAuthUser(auth.user) ? { user: normalizeAuthUser(auth.user) } : {}),
    ...(auth.expiresAt ? { expiresAt: auth.expiresAt } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeJSONAtomic(paths.authPath, next, 0o600)
  return next
}

export function clearMovScriptBackendAuth(workspaceDir = process.cwd()): void {
  const paths = resolveMovScriptBackendPaths(workspaceDir)
  rmSync(paths.authPath, { force: true })
}

export function resolveMovScriptBackendSession(input: MovScriptBackendSessionInput = {}): MovScriptBackendSession {
  const paths = resolveMovScriptBackendPaths(input.workspaceDir)
  const config = readMovScriptBackendConfig(paths.workspaceDir)
  const auth = readMovScriptBackendAuth(paths.workspaceDir)
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
  const displayName = stringField(value.displayName)
  const user = {
    ...(id !== undefined ? { id } : {}),
    ...(username ? { username } : {}),
    ...(displayName ? { displayName } : {}),
  }
  return Object.keys(user).length > 0 ? user : undefined
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

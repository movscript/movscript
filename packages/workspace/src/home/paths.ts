import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveMovScriptHomeDir as resolveRuntimeMovScriptHomeDir } from '@movscript/runtime-contracts'
export {
  MOVSCRIPT_DEFAULT_USER_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  MOVSCRIPT_WORKSPACE_BIN_DIR_NAME,
  MOVSCRIPT_WORKSPACE_CONFIG_TOML_FILE_NAME,
  MOVSCRIPT_WORKSPACE_LOGS_DIR_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  MOVSCRIPT_WORKSPACE_REALMS_DIR_NAME,
  type MovScriptWorkspaceRealm,
  type MovScriptWorkspaceRealmInput,
  type MovScriptWorkspaceContext,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceRootManifest,
  type MovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceScope,
} from './root.js'
import {
  MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  MOVSCRIPT_WORKSPACE_BIN_DIR_NAME,
  MOVSCRIPT_WORKSPACE_CONFIG_TOML_FILE_NAME,
  MOVSCRIPT_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_LOGS_DIR_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  MOVSCRIPT_WORKSPACE_REALMS_DIR_NAME,
  type MovScriptWorkspaceRealm,
  type MovScriptWorkspaceRealmInput,
  type MovScriptWorkspaceContext,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceRootManifest,
  type MovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceScope,
} from './root.js'

export interface MovScriptProjectWorkspacePaths {
  workspaceDir: string
  controlDir: string
  realm: MovScriptWorkspaceRealm
  realmDir: string
  projectCwd: string
  projectDir: string
}

export interface MovScriptUserHomeDirOptions {
  platform?: NodeJS.Platform
  userHomeDir?: string
  env?: NodeJS.ProcessEnv
}

export function resolveMovScriptWorkspaceRootPaths(workspaceDir?: string): MovScriptWorkspaceRootPaths {
  const rootDir = resolveMovScriptHomeDir(workspaceDir)
  const controlDir = rootDir
  const realmsDir = join(controlDir, MOVSCRIPT_WORKSPACE_REALMS_DIR_NAME)
  return {
    workspaceDir: rootDir,
    rootDir,
    controlDir,
    configTomlPath: join(controlDir, MOVSCRIPT_WORKSPACE_CONFIG_TOML_FILE_NAME),
    manifestPath: join(controlDir, MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME),
    realmsDir,
    providersDir: join(realmsDir, 'local', MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME),
    backendDir: join(controlDir, MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME),
    binDir: join(controlDir, MOVSCRIPT_WORKSPACE_BIN_DIR_NAME),
    logsDir: join(controlDir, MOVSCRIPT_WORKSPACE_LOGS_DIR_NAME),
  }
}

export function resolveMovScriptHomeDir(workspaceDir?: string): string {
  const input = workspaceDir?.trim()
  if (input) return resolve(input)
  const explicit = process.env.MOVSCRIPT_HOME?.trim()
  if (explicit) return resolve(explicit)
  const legacy = process.env.MOVSCRIPT_WORKSPACE_DIR?.trim()
  if (legacy) return resolve(legacy)
  return process.cwd()
}

export function ensureMovScriptWorkspaceRoot(paths: MovScriptWorkspaceRootPaths): MovScriptWorkspaceRootManifest {
  mkdirSync(paths.controlDir, { recursive: true })
  mkdirSync(paths.rootDir, { recursive: true })
  mkdirSync(paths.realmsDir, { recursive: true })
  mkdirSync(paths.providersDir, { recursive: true })
  mkdirSync(paths.backendDir, { recursive: true })
  mkdirSync(paths.binDir, { recursive: true })
  mkdirSync(paths.logsDir, { recursive: true })
  const current = readMovScriptWorkspaceRootManifest(paths.manifestPath)
  if (current) return current
  const manifest = defaultMovScriptWorkspaceRootManifest()
  writeMovScriptWorkspaceRootManifest(paths.manifestPath, manifest)
  return manifest
}

export function defaultMovScriptWorkspaceRootManifest(now = new Date()): MovScriptWorkspaceRootManifest {
  const timestamp = now.toISOString()
  return {
    schema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    workspaceId: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    layout: {
      providerConfigRoot: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
    },
  }
}

export function readMovScriptWorkspaceRootManifest(manifestPath: string): MovScriptWorkspaceRootManifest | undefined {
  const parsed = readJSON(manifestPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA) return undefined
  const workspaceId = stringField(parsed.workspaceId)
  if (!workspaceId) return undefined
  const backend = normalizeBackend(parsed.backend)
  const activeRealm = normalizeRealmRecord(parsed.activeRealm)
  const activeUserId = numberField(parsed.activeUserId)
  return {
    schema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    workspaceId,
    createdAt: stringField(parsed.createdAt) ?? new Date().toISOString(),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
    ...(backend ? { backend } : {}),
    ...(activeRealm ? { activeRealm } : {}),
    ...(activeUserId !== undefined ? { activeUserId } : {}),
    layout: normalizeWorkspaceLayout(parsed.layout),
  }
}

export function writeMovScriptWorkspaceRootManifest(
  manifestPath: string,
  manifest: MovScriptWorkspaceRootManifest,
): void {
  writeJSONAtomic(manifestPath, {
    ...manifest,
    schema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    updatedAt: manifest.updatedAt || new Date().toISOString(),
    layout: normalizeWorkspaceLayout(manifest.layout),
  })
}

export function normalizeMovScriptWorkspaceContext(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContext {
  const realm = normalizeMovScriptWorkspaceRealm(input)
  const scope = input.scope ?? inferredWorkspaceScope(input)
  const userId = input.userId === undefined ? undefined : safeIdSegment(input.userId)
  const orgId = input.orgId === undefined ? undefined : safeIdSegment(input.orgId)
  const projectId = input.projectId === undefined ? undefined : safeIdSegment(input.projectId)
  const projectDir = input.projectDir === undefined ? undefined : resolve(input.projectDir)
  if (scope === 'global') return { realm, scope, ...requiredOwnerContext({ userId, orgId }) }
  if (!projectDir) throw new Error('MovScript project workspace context requires projectDir')
  if (scope === 'project') return { realm, scope, ...requiredOwnerContext({ userId, orgId }), projectDir, ...(projectId ? { projectId } : {}) }
  return { realm, scope, ...requiredOwnerContext({ userId, orgId }), projectDir, ...(projectId ? { projectId } : {}) }
}

export function resolveMovScriptWorkspaceContextPaths(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContextPaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const context = normalizeMovScriptWorkspaceContext(input)
  const contextKey = [
    context.realm.kind,
    context.realm.id,
    context.orgId ? `org/${context.orgId}` : `user/${context.userId}`,
    context.projectDir ? `path/${context.projectDir}` : 'global',
  ].join('/')
  const realmDir = resolveMovScriptWorkspaceRealmDir(root.workspaceDir, context.realm)
  const ownerCwd = join(realmDir, ...workspaceOwnerPath(context))
  const projectCwd = context.projectDir ?? ownerCwd
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    scope: context.scope,
    context,
    contextKey,
    realmDir,
    projectCwd,
    providerSessionCwd: projectCwd,
  }
}

export function normalizeMovScriptWorkspaceRealm(input: Pick<MovScriptWorkspaceContextInput, 'realm' | 'realmKind' | 'realmId'> = {}): MovScriptWorkspaceRealm {
  if (typeof input.realm === 'string') {
    return normalizeMovScriptWorkspaceRealm({ realmId: input.realm })
  }
  const kind = input.realm?.kind ?? input.realmKind ?? (input.realm?.id || input.realmId ? 'cloud' : 'local')
  const rawId = input.realm?.id ?? input.realmId
  if (kind === 'cloud' && rawId === undefined) {
    throw new Error('MovScript cloud workspace realm requires realmId')
  }
  const id = kind === 'local' ? 'local' : safeIdSegment(rawId as string | number)
  return { kind, id }
}

export function resolveMovScriptWorkspaceRealmDir(
  workspaceDir = process.cwd(),
  realmInput: MovScriptWorkspaceRealmInput | string = { kind: 'local', id: 'local' },
): string {
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const realm = normalizeMovScriptWorkspaceRealm(typeof realmInput === 'string' ? { realmId: realmInput } : { realm: realmInput })
  if (realm.kind === 'local') return join(root.realmsDir, 'local')
  return join(root.realmsDir, 'cloud', realm.id)
}

export function fallbackUserMovScriptHomeDir(options: MovScriptUserHomeDirOptions = {}): string {
  return resolveRuntimeMovScriptHomeDir({
    env: fallbackOnlyEnv(options.env ?? process.env),
    platform: options.platform,
    userHomeDir: options.userHomeDir,
  })
}

export function ensureMovScriptWorkspaceContext(paths: MovScriptWorkspaceContextPaths): MovScriptWorkspaceContextPaths {
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  mkdirSync(paths.projectCwd, { recursive: true })
  return paths
}

function normalizeWorkspaceLayout(_value: unknown): MovScriptWorkspaceRootManifest['layout'] {
  return {
    providerConfigRoot: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  }
}

function fallbackOnlyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env }
  delete next.MOVSCRIPT_HOME
  delete next.MOVSCRIPT_WORKSPACE_DIR
  return next
}

function inferredWorkspaceScope(input: MovScriptWorkspaceContextInput): MovScriptWorkspaceScope {
  if (input.scope === 'production') return 'production'
  if (input.projectDir !== undefined || input.projectId !== undefined) return 'project'
  return 'global'
}

function workspaceOwnerPath(input: Pick<MovScriptWorkspaceContextInput, 'userId' | 'orgId'>): string[] {
  if (input.orgId !== undefined) return ['org', safeIdSegment(input.orgId)]
  if (input.userId !== undefined) return ['user', safeIdSegment(input.userId)]
  throw new Error('MovScript workspace owner requires userId or orgId')
}

function requiredOwnerContext(input: { userId?: string; orgId?: string }): Pick<MovScriptWorkspaceContext, 'userId' | 'orgId'> {
  if (input.orgId) return { orgId: input.orgId }
  if (input.userId) return { userId: input.userId }
  throw new Error('MovScript workspace context requires userId or orgId')
}

function normalizeBackend(value: unknown): MovScriptWorkspaceRootManifest['backend'] | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'local' || value.kind === 'cloud' || value.kind === 'custom' ? value.kind : undefined
  const baseURL = stringField(value.baseURL)
  return kind || baseURL ? { ...(kind ? { kind } : {}), ...(baseURL ? { baseURL } : {}) } : undefined
}

function normalizeRealmRecord(value: unknown): MovScriptWorkspaceRealm | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'local' || value.kind === 'cloud' ? value.kind : undefined
  if (!kind) return undefined
  if (kind === 'local') return { kind, id: 'local' }
  const id = stringField(value.id)
  return id ? { kind, id: safeIdSegment(id) } : undefined
}

function safeIdSegment(value: string | number): string {
  const raw = String(value).trim()
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(raw) || raw === '.' || raw === '..') {
    throw new Error(`invalid MovScript workspace id segment: ${String(value)}`)
  }
  return raw
}

function readJSON(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

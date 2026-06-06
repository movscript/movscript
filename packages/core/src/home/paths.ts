import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const MOVSCRIPT_WORKSPACE_DIR_NAME = '.movscript'
export const MOVSCRIPT_DEFAULT_USER_WORKSPACE_DIR_NAME = 'MovScript'
export const MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME = 'manifest.json'
export const MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA = 'movscript.workspace-root.v1'
export const MOVSCRIPT_WORKSPACE_PROJECTION_ROOT_DIR_NAME = 'data'
export const MOVSCRIPT_WORKSPACE_REVIEWS_DIR_NAME = 'reviews'
export const MOVSCRIPT_WORKSPACE_SYNC_DIR_NAME = 'sync'
export const MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME = 'providers'
export const MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME = 'backend'

export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'

export interface MovScriptWorkspaceContextInput {
  workspaceDir?: string
  scope?: MovScriptWorkspaceScope
  userId?: string | number
  projectId?: string | number
  productionId?: string | number
}

export interface MovScriptWorkspaceContext {
  scope: MovScriptWorkspaceScope
  userId?: string
  projectId?: string
  productionId?: string
}

export interface MovScriptWorkspaceRootPaths {
  workspaceDir: string
  rootDir: string
  controlDir: string
  manifestPath: string
  projectionRootDir: string
  reviewsDir: string
  syncDir: string
  providersDir: string
  backendDir: string
}

export interface MovScriptWorkspaceRootManifest {
  schema: typeof MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA
  workspaceId: string
  createdAt: string
  updatedAt: string
  backend?: {
    kind?: 'local' | 'cloud' | 'custom'
    baseURL?: string
  }
  activeUserId?: number
  layout: {
    projectionRoot: typeof MOVSCRIPT_WORKSPACE_PROJECTION_ROOT_DIR_NAME
    reviewsRoot: typeof MOVSCRIPT_WORKSPACE_REVIEWS_DIR_NAME
    syncRoot: typeof MOVSCRIPT_WORKSPACE_SYNC_DIR_NAME
    providerConfigRoot: typeof MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME
  }
}

export interface MovScriptWorkspaceContextPaths {
  workspaceDir: string
  controlDir: string
  scope: MovScriptWorkspaceScope
  context: MovScriptWorkspaceContext
  contextKey: string
  projectionBaseDir: string
  reviewsBaseDir: string
  syncBaseDir: string
  providerSessionCwd: string
}

export interface MovScriptProjectProjectionPaths {
  workspaceDir: string
  controlDir: string
  userDir: string
  projectDir: string
  projectFile: string
  standardsDir: string
  projectStandardsWorkspaceFile: string
  projectStandardsMetaFile: string
  settingsDir: string
  settingWorkspaceFile: string
  settingMetaFile: string
  scriptsDir: string
  productionsDir: string
  assetsDir: string
  assetWorkspaceFile: string
  assetMetaFile: string
}

export interface MovScriptScriptProjectionPaths {
  scriptDir: string
  scriptFile: string
  scriptMetaFile: string
  versionsDir: string
}

export interface MovScriptProductionProjectionPaths {
  productionDir: string
  productionWorkspaceFile: string
  productionMetaFile: string
}

export interface MovScriptContentUnitProjectionPaths {
  sceneMomentContentUnitsDir: string
  contentUnitDir?: string
  contentUnitWorkspaceFile: string
  contentUnitMetaFile: string
}

export function resolveMovScriptWorkspaceRootPaths(workspaceDir = process.cwd()): MovScriptWorkspaceRootPaths {
  const rootDir = resolve(workspaceDir)
  const controlDir = join(rootDir, MOVSCRIPT_WORKSPACE_DIR_NAME)
  return {
    workspaceDir: rootDir,
    rootDir,
    controlDir,
    manifestPath: join(controlDir, MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME),
    projectionRootDir: join(controlDir, MOVSCRIPT_WORKSPACE_PROJECTION_ROOT_DIR_NAME),
    reviewsDir: join(controlDir, MOVSCRIPT_WORKSPACE_REVIEWS_DIR_NAME),
    syncDir: join(controlDir, MOVSCRIPT_WORKSPACE_SYNC_DIR_NAME),
    providersDir: join(controlDir, MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME),
    backendDir: join(controlDir, MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME),
  }
}

export function ensureMovScriptWorkspaceRoot(paths: MovScriptWorkspaceRootPaths): MovScriptWorkspaceRootManifest {
  mkdirSync(paths.controlDir, { recursive: true })
  mkdirSync(paths.projectionRootDir, { recursive: true })
  mkdirSync(paths.reviewsDir, { recursive: true })
  mkdirSync(paths.syncDir, { recursive: true })
  mkdirSync(paths.providersDir, { recursive: true })
  mkdirSync(paths.backendDir, { recursive: true })
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
      projectionRoot: MOVSCRIPT_WORKSPACE_PROJECTION_ROOT_DIR_NAME,
      reviewsRoot: MOVSCRIPT_WORKSPACE_REVIEWS_DIR_NAME,
      syncRoot: MOVSCRIPT_WORKSPACE_SYNC_DIR_NAME,
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
  const activeUserId = numberField(parsed.activeUserId)
  return {
    schema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    workspaceId,
    createdAt: stringField(parsed.createdAt) ?? new Date().toISOString(),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
    ...(backend ? { backend } : {}),
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

export function resolveMovScriptProjectProjectionPaths(input: {
  workspaceDir?: string
  userId: string | number
  projectId: string | number
}): MovScriptProjectProjectionPaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const userSegment = safeIdSegment(input.userId)
  const projectSegment = safeIdSegment(input.projectId)
  const userDir = join(root.projectionRootDir, 'users', userSegment)
  const projectDir = join(userDir, 'projects', projectSegment)
  const standardsDir = join(projectDir, 'standards')
  const settingsDir = join(projectDir, 'settings')
  const scriptsDir = join(projectDir, 'scripts')
  const productionsDir = join(projectDir, 'productions')
  const assetsDir = join(projectDir, 'assets')
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    userDir,
    projectDir,
    projectFile: join(projectDir, 'project.json'),
    standardsDir,
    projectStandardsWorkspaceFile: join(standardsDir, 'project_standards.workspace.json'),
    projectStandardsMetaFile: join(standardsDir, 'project_standards.meta.json'),
    settingsDir,
    settingWorkspaceFile: join(settingsDir, 'setting.workspace.json'),
    settingMetaFile: join(settingsDir, 'setting.meta.json'),
    scriptsDir,
    productionsDir,
    assetsDir,
    assetWorkspaceFile: join(assetsDir, 'asset.workspace.json'),
    assetMetaFile: join(assetsDir, 'asset.meta.json'),
  }
}

export function normalizeMovScriptWorkspaceContext(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContext {
  const scope = input.scope ?? inferredWorkspaceScope(input)
  const userId = safeIdSegment(input.userId ?? 'local')
  if (scope === 'global') return { scope, userId }
  const projectId = input.projectId === undefined ? undefined : safeIdSegment(input.projectId)
  if (!projectId) throw new Error('MovScript project workspace context requires projectId')
  if (scope === 'project') return { scope, userId, projectId }
  const productionId = input.productionId === undefined ? undefined : safeIdSegment(input.productionId)
  if (!productionId) throw new Error('MovScript production workspace context requires productionId')
  return { scope, userId, projectId, productionId }
}

export function resolveMovScriptWorkspaceContextPaths(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContextPaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const context = normalizeMovScriptWorkspaceContext(input)
  if (context.scope === 'global') {
    const userId = context.userId ?? 'local'
    const userSegments = ['users', userId] as const
    return {
      workspaceDir: root.workspaceDir,
      controlDir: root.controlDir,
      scope: context.scope,
      context,
      contextKey: userSegments.join('/'),
      projectionBaseDir: join(root.projectionRootDir, ...userSegments),
      reviewsBaseDir: join(root.reviewsDir, ...userSegments),
      syncBaseDir: join(root.syncDir, ...userSegments),
      providerSessionCwd: join(root.projectionRootDir, ...userSegments),
    }
  }
  const userId = context.userId
  const projectId = context.projectId
  if (!userId || !projectId) throw new Error('MovScript project workspace context requires userId and projectId')
  const projectSegments = ['users', userId, 'projects', projectId] as const
  const productionId = context.scope === 'production' ? context.productionId : undefined
  if (context.scope === 'production' && !productionId) throw new Error('MovScript production workspace context requires productionId')
  const contextKey = productionId
    ? `users/${userId}/projects/${projectId}/productions/${productionId}`
    : `users/${userId}/projects/${projectId}`
  const scopedSegments = productionId
    ? [...projectSegments, 'productions', productionId] as const
    : projectSegments
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    scope: context.scope,
    context,
    contextKey,
    projectionBaseDir: join(root.projectionRootDir, ...scopedSegments),
    reviewsBaseDir: join(root.reviewsDir, ...scopedSegments),
    syncBaseDir: join(root.syncDir, ...scopedSegments),
    providerSessionCwd: join(root.projectionRootDir, ...scopedSegments),
  }
}

export function ensureMovScriptWorkspaceContext(paths: MovScriptWorkspaceContextPaths): MovScriptWorkspaceContextPaths {
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  mkdirSync(paths.projectionBaseDir, { recursive: true })
  mkdirSync(paths.reviewsBaseDir, { recursive: true })
  mkdirSync(paths.syncBaseDir, { recursive: true })
  mkdirSync(paths.providerSessionCwd, { recursive: true })
  return paths
}

export function resolveMovScriptScriptProjectionPaths(
  projectPaths: Pick<MovScriptProjectProjectionPaths, 'scriptsDir'>,
  scriptId: string | number,
): MovScriptScriptProjectionPaths {
  const scriptDir = join(projectPaths.scriptsDir, safeIdSegment(scriptId))
  return {
    scriptDir,
    scriptFile: join(scriptDir, 'script.md'),
    scriptMetaFile: join(scriptDir, 'script.meta.json'),
    versionsDir: join(scriptDir, 'versions'),
  }
}

export function resolveMovScriptProductionProjectionPaths(
  projectPaths: Pick<MovScriptProjectProjectionPaths, 'productionsDir'>,
  productionId: string | number,
): MovScriptProductionProjectionPaths {
  const productionDir = join(projectPaths.productionsDir, safeIdSegment(productionId))
  return {
    productionDir,
    productionWorkspaceFile: join(productionDir, 'production.workspace.json'),
    productionMetaFile: join(productionDir, 'production.meta.json'),
  }
}

export function resolveMovScriptContentUnitProjectionPaths(
  productionPaths: Pick<MovScriptProductionProjectionPaths, 'productionDir'>,
  input: {
    sceneMomentId: string | number
    contentUnitId?: string | number
  },
): MovScriptContentUnitProjectionPaths {
  const sceneMomentContentUnitsDir = join(productionPaths.productionDir, 'scene_moments', safeIdSegment(input.sceneMomentId), 'content_units')
  if (input.contentUnitId !== undefined) {
    const contentUnitDir = join(sceneMomentContentUnitsDir, safeIdSegment(input.contentUnitId))
    return {
      sceneMomentContentUnitsDir,
      contentUnitDir,
      contentUnitWorkspaceFile: join(contentUnitDir, 'content_unit.workspace.json'),
      contentUnitMetaFile: join(contentUnitDir, 'content_unit.meta.json'),
    }
  }
  return {
    sceneMomentContentUnitsDir,
    contentUnitWorkspaceFile: join(sceneMomentContentUnitsDir, 'content_units.workspace.json'),
    contentUnitMetaFile: join(sceneMomentContentUnitsDir, 'content_units.meta.json'),
  }
}

function normalizeWorkspaceLayout(value: unknown): MovScriptWorkspaceRootManifest['layout'] {
  return {
    projectionRoot: MOVSCRIPT_WORKSPACE_PROJECTION_ROOT_DIR_NAME,
    reviewsRoot: MOVSCRIPT_WORKSPACE_REVIEWS_DIR_NAME,
    syncRoot: MOVSCRIPT_WORKSPACE_SYNC_DIR_NAME,
    providerConfigRoot: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  }
}

function inferredWorkspaceScope(input: MovScriptWorkspaceContextInput): MovScriptWorkspaceScope {
  if (input.productionId !== undefined) return 'production'
  if (input.projectId !== undefined) return 'project'
  return 'global'
}

function normalizeBackend(value: unknown): MovScriptWorkspaceRootManifest['backend'] | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'local' || value.kind === 'cloud' || value.kind === 'custom' ? value.kind : undefined
  const baseURL = stringField(value.baseURL)
  return kind || baseURL ? { ...(kind ? { kind } : {}), ...(baseURL ? { baseURL } : {}) } : undefined
}

function safeIdSegment(value: string | number): string {
  const raw = String(value).trim()
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(raw) || raw === '.' || raw === '..') {
    throw new Error(`invalid MovScript workspace projection id segment: ${String(value)}`)
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

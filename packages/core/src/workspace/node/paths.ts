import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
export {
  MOVSCRIPT_DEFAULT_USER_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  MOVSCRIPT_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  type MovScriptWorkspaceContext,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceRootManifest,
  type MovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceScope,
} from '../root.js'
import {
  MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME,
  MOVSCRIPT_WORKSPACE_DIR_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  type MovScriptWorkspaceContext,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceRootManifest,
  type MovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceScope,
} from '../root.js'

export interface MovScriptProjectWorkspacePaths {
  workspaceDir: string
  controlDir: string
  projectDir: string
  projectFile: string
  editDir: string
  buildDir: string
  standardsDir: string
  projectStandardsFile: string
  settingDir: string
  scriptsDir: string
  productionsDir: string
  assetsDir: string
}

export interface MovScriptScriptWorkspacePaths {
  scriptDir: string
  scriptFile: string
}

export interface MovScriptProductionWorkspacePaths {
  productionDir: string
  productionFile: string
}

export interface MovScriptContentUnitWorkspacePaths {
  contentUnitsDir: string
  contentUnitFile?: string
}

export function resolveMovScriptWorkspaceRootPaths(workspaceDir = process.cwd()): MovScriptWorkspaceRootPaths {
  const rootDir = resolve(workspaceDir)
  const controlDir = join(rootDir, MOVSCRIPT_WORKSPACE_DIR_NAME)
  const buildDir = join(rootDir, '.build')
  return {
    workspaceDir: rootDir,
    rootDir,
    controlDir,
    manifestPath: join(controlDir, MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME),
    editDir: join(rootDir, 'edit'),
    buildDir,
    buildCurrentDir: join(buildDir, 'current'),
    buildIndexesDir: join(buildDir, 'indexes'),
    buildReviewsDir: join(buildDir, 'reviews'),
    buildManifestsDir: join(buildDir, 'manifests'),
    providersDir: join(controlDir, MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME),
    backendDir: join(controlDir, MOVSCRIPT_WORKSPACE_BACKEND_DIR_NAME),
  }
}

export function ensureMovScriptWorkspaceRoot(paths: MovScriptWorkspaceRootPaths): MovScriptWorkspaceRootManifest {
  mkdirSync(paths.controlDir, { recursive: true })
  mkdirSync(paths.editDir, { recursive: true })
  mkdirSync(paths.buildCurrentDir, { recursive: true })
  mkdirSync(paths.buildIndexesDir, { recursive: true })
  mkdirSync(paths.buildReviewsDir, { recursive: true })
  mkdirSync(paths.buildManifestsDir, { recursive: true })
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
      editableRoot: 'edit',
      buildRoot: '.build',
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

export function resolveMovScriptProjectWorkspacePaths(input: {
  workspaceDir?: string
  userId?: string | number
  projectId?: string | number
} = {}): MovScriptProjectWorkspacePaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const editDir = root.editDir
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    projectDir: root.rootDir,
    projectFile: join(root.rootDir, 'project.json'),
    editDir,
    buildDir: root.buildDir,
    standardsDir: join(editDir, 'standards'),
    projectStandardsFile: join(editDir, 'standards', 'project_standards.json'),
    settingDir: join(editDir, 'setting'),
    scriptsDir: join(editDir, 'scripts'),
    productionsDir: join(editDir, 'productions'),
    assetsDir: join(editDir, 'assets'),
  }
}

export function normalizeMovScriptWorkspaceContext(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContext {
  const scope = input.scope ?? inferredWorkspaceScope(input)
  const userId = input.userId === undefined ? undefined : safeIdSegment(input.userId)
  const projectId = input.projectId === undefined ? undefined : safeIdSegment(input.projectId)
  const productionId = input.productionId === undefined ? undefined : safeIdSegment(input.productionId)
  if (scope === 'global') return { scope, ...(userId ? { userId } : {}) }
  if (scope === 'project') return { scope, ...(userId ? { userId } : {}), ...(projectId ? { projectId } : {}) }
  if (!productionId) throw new Error('MovScript production workspace context requires productionId')
  return { scope, ...(userId ? { userId } : {}), ...(projectId ? { projectId } : {}), productionId }
}

export function resolveMovScriptWorkspaceContextPaths(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContextPaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const context = normalizeMovScriptWorkspaceContext(input)
  const contextKey = context.productionId ? `production/${context.productionId}` : context.projectId ? `project/${context.projectId}` : 'project'
  const editableBaseDir = context.productionId
    ? join(root.editDir, 'productions', `production_${context.productionId}`)
    : root.editDir
  const buildBaseDir = context.productionId
    ? join(root.buildCurrentDir, 'productions', `production_${context.productionId}`)
    : root.buildCurrentDir
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    scope: context.scope,
    context,
    contextKey,
    editableBaseDir,
    buildBaseDir,
    providerSessionCwd: root.rootDir,
  }
}

export function ensureMovScriptWorkspaceContext(paths: MovScriptWorkspaceContextPaths): MovScriptWorkspaceContextPaths {
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  mkdirSync(paths.editableBaseDir, { recursive: true })
  mkdirSync(paths.buildBaseDir, { recursive: true })
  return paths
}

export function resolveMovScriptScriptWorkspacePaths(
  projectPaths: Pick<MovScriptProjectWorkspacePaths, 'scriptsDir'>,
  scriptId: string | number,
): MovScriptScriptWorkspacePaths {
  const scriptDir = join(projectPaths.scriptsDir, `script_${safeIdSegment(scriptId)}`)
  return {
    scriptDir,
    scriptFile: join(scriptDir, 'script.md'),
  }
}

export function resolveMovScriptProductionWorkspacePaths(
  projectPaths: Pick<MovScriptProjectWorkspacePaths, 'productionsDir'>,
  productionId: string | number,
): MovScriptProductionWorkspacePaths {
  const productionDir = join(projectPaths.productionsDir, `production_${safeIdSegment(productionId)}`)
  return {
    productionDir,
    productionFile: join(productionDir, 'production.json'),
  }
}

export function resolveMovScriptContentUnitWorkspacePaths(
  productionPaths: Pick<MovScriptProductionWorkspacePaths, 'productionDir'>,
  input: {
    contentUnitId?: string | number
  },
): MovScriptContentUnitWorkspacePaths {
  const contentUnitsDir = join(productionPaths.productionDir, 'content_units')
  return {
    contentUnitsDir,
    ...(input.contentUnitId !== undefined
      ? { contentUnitFile: join(contentUnitsDir, `content_unit_${safeIdSegment(input.contentUnitId)}.json`) }
      : {}),
  }
}

function normalizeWorkspaceLayout(_value: unknown): MovScriptWorkspaceRootManifest['layout'] {
  return {
    editableRoot: 'edit',
    buildRoot: '.build',
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

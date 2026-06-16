import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  MOVSCRIPT_INTERPRET_DIR,
  entityPathSlug,
} from '../layout/index.js'
import {
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
  type MovScriptSourceWorkspaceRootPaths,
} from '../root.js'

export interface MovScriptProjectWorkspacePaths {
  workspaceDir: string
  controlDir: string
  projectDir: string
  projectFile: string
  sourceDir: string
  interpretDir: string
  standardsDir: string
  projectStandardsFile: string
  settingDir: string
  scriptsDir: string
  productionsDir: string
  contentUnitsDir: string
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
  const interpretDir = join(rootDir, MOVSCRIPT_INTERPRET_DIR)
  return {
    workspaceDir: rootDir,
    rootDir,
    controlDir,
    manifestPath: join(controlDir, MOVSCRIPT_WORKSPACE_MANIFEST_FILE_NAME),
    interpretDir,
    interpretCurrentDir: join(interpretDir, 'current'),
    interpretIndexesDir: join(interpretDir, 'indexes'),
    interpretReviewsDir: join(interpretDir, 'reviews'),
    interpretManifestsDir: join(interpretDir, 'manifests'),
    providersDir: join(controlDir, MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME),
  }
}

export function resolveMovScriptSourceWorkspaceRootPaths(workspaceDir = process.cwd()): MovScriptSourceWorkspaceRootPaths {
  return resolveMovScriptWorkspaceRootPaths(workspaceDir)
}

export function ensureMovScriptWorkspaceRoot(paths: MovScriptWorkspaceRootPaths): MovScriptWorkspaceRootManifest {
  mkdirSync(paths.controlDir, { recursive: true })
  mkdirSync(paths.rootDir, { recursive: true })
  mkdirSync(paths.interpretCurrentDir, { recursive: true })
  mkdirSync(paths.interpretIndexesDir, { recursive: true })
  mkdirSync(paths.interpretReviewsDir, { recursive: true })
  mkdirSync(paths.interpretManifestsDir, { recursive: true })
  mkdirSync(paths.providersDir, { recursive: true })
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
    project_id: 'movscript_project',
    title: 'MovScript Project',
    createdAt: timestamp,
    updatedAt: timestamp,
    layout: {
      editableRoot: '.',
      interpretRoot: MOVSCRIPT_INTERPRET_DIR,
      providerConfigRoot: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
    },
  }
}

export function readMovScriptWorkspaceRootManifest(manifestPath: string): MovScriptWorkspaceRootManifest | undefined {
  const parsed = readJSON(manifestPath)
  if (!isRecord(parsed) || parsed.schema !== MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA) return undefined
  const projectId = stringField(parsed.project_id)
  const title = stringField(parsed.title)
  if (!projectId || !title) return undefined
  return {
    schema: MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
    project_id: projectId,
    title,
    createdAt: stringField(parsed.createdAt) ?? new Date().toISOString(),
    updatedAt: stringField(parsed.updatedAt) ?? new Date().toISOString(),
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
  projectDir?: string
} = {}): MovScriptProjectWorkspacePaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.projectDir ?? input.workspaceDir)
  const projectDir = root.rootDir
  const sourceDir = projectDir
  const interpretDir = root.interpretDir
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    projectDir,
    projectFile: join(projectDir, 'project.json'),
    sourceDir,
    interpretDir,
    standardsDir: join(sourceDir, 'project_standards'),
    projectStandardsFile: join(sourceDir, 'project_standards.json'),
    settingDir: join(sourceDir, 'settings'),
    scriptsDir: join(sourceDir, 'scripts'),
    productionsDir: join(sourceDir, 'productions'),
    contentUnitsDir: join(sourceDir, 'content_units'),
  }
}

export function normalizeMovScriptWorkspaceContext(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContext {
  const scope = input.scope ?? inferredWorkspaceScope(input)
  const productionId = input.productionId === undefined ? undefined : safeIdSegment(input.productionId)
  if (scope === 'global' || scope === 'project') return { scope }
  if (!productionId) throw new Error('MovScript production workspace context requires productionId')
  return { scope, productionId }
}

export function resolveMovScriptWorkspaceContextPaths(input: MovScriptWorkspaceContextInput = {}): MovScriptWorkspaceContextPaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const context = normalizeMovScriptWorkspaceContext(input)
  const contextKey = context.productionId ? `production/${context.productionId}` : 'project'
  const projectPaths = context.scope === 'global'
    ? undefined
    : resolveMovScriptProjectWorkspacePaths({
        workspaceDir: root.workspaceDir,
      })
  const editableRoot = projectPaths?.sourceDir ?? root.rootDir
  const buildCurrentRoot = projectPaths ? join(projectPaths.interpretDir, 'current') : root.interpretCurrentDir
  const editableBaseDir = context.productionId
    ? join(editableRoot, 'productions', context.productionId)
    : editableRoot
  const interpretBaseDir = context.productionId
    ? join(buildCurrentRoot, 'productions', context.productionId)
    : buildCurrentRoot
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    scope: context.scope,
    context,
    contextKey,
    editableBaseDir,
    interpretBaseDir,
    providerSessionCwd: projectPaths?.projectDir ?? root.rootDir,
  }
}

export function ensureMovScriptWorkspaceContext(paths: MovScriptWorkspaceContextPaths): MovScriptWorkspaceContextPaths {
  ensureMovScriptWorkspaceRoot(resolveMovScriptWorkspaceRootPaths(paths.workspaceDir))
  mkdirSync(paths.editableBaseDir, { recursive: true })
  mkdirSync(paths.interpretBaseDir, { recursive: true })
  return paths
}

export function resolveMovScriptScriptWorkspacePaths(
  projectPaths: Pick<MovScriptProjectWorkspacePaths, 'scriptsDir'>,
  scriptId: string | number,
): MovScriptScriptWorkspacePaths {
  const scriptDir = join(projectPaths.scriptsDir, entityPathSlug(safeIdSegment(scriptId), 'script'))
  return {
    scriptDir,
    scriptFile: join(scriptDir, 'script.md'),
  }
}

export function resolveMovScriptProductionWorkspacePaths(
  projectPaths: Pick<MovScriptProjectWorkspacePaths, 'productionsDir'>,
  productionId: string | number,
): MovScriptProductionWorkspacePaths {
  const productionDir = join(projectPaths.productionsDir, entityPathSlug(safeIdSegment(productionId), 'production'))
  return {
    productionDir,
    productionFile: join(productionDir, 'production.json'),
  }
}

export function resolveMovScriptContentUnitWorkspacePaths(
  projectPaths: Pick<MovScriptProjectWorkspacePaths, 'contentUnitsDir'>,
  input: {
    contentUnitId?: string | number
  },
): MovScriptContentUnitWorkspacePaths {
  const contentUnitsDir = projectPaths.contentUnitsDir
  return {
    contentUnitsDir,
    ...(input.contentUnitId !== undefined
      ? { contentUnitFile: join(contentUnitsDir, entityPathSlug(safeIdSegment(input.contentUnitId), 'content_unit'), 'content_unit.json') }
      : {}),
  }
}

function normalizeWorkspaceLayout(_value: unknown): MovScriptWorkspaceRootManifest['layout'] {
  return {
    editableRoot: '.',
    interpretRoot: MOVSCRIPT_INTERPRET_DIR,
    providerConfigRoot: MOVSCRIPT_WORKSPACE_PROVIDER_CONFIGS_DIR_NAME,
  }
}

function inferredWorkspaceScope(input: MovScriptWorkspaceContextInput): MovScriptWorkspaceScope {
  if (input.productionId !== undefined) return 'production'
  return 'project'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

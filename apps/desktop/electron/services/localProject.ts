import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createProjectServiceClientFromRuntime } from '@movscript/project'
import type {
  ElectronLocalProjectBindInput,
  ElectronLocalProjectCreateInput,
  ElectronLocalProjectInspectInput,
  ElectronLocalProjectInspection,
  ElectronLocalProjectOpenInput,
  ElectronLocalProjectResult,
} from '../../src/shared/contracts/electronApi'

const LOCAL_CONFIG_PATH = '.movscript/config.json'

export async function inspectLocalMovScriptProject(input: ElectronLocalProjectInspectInput): Promise<ElectronLocalProjectInspection> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const projectStat = await stat(projectDir).catch(() => undefined)
  const exists = Boolean(projectStat)
  const isDirectory = Boolean(projectStat?.isDirectory())
  const workspace = await readJSON(resolve(projectDir, 'workspace.json'))
  const project = await readJSON(resolve(projectDir, 'project.json'))
  const localConfig = await readJSON(resolve(projectDir, LOCAL_CONFIG_PATH))
  const movscriptStat = await stat(resolve(projectDir, '.movscript')).catch(() => undefined)
  const metadata = await resolveProjectMetadata(projectDir)
  const hasWorkspaceManifest = isRecord(workspace)
  const hasProjectFile = isRecord(project)
  const hasLocalConfig = isRecord(localConfig)
  const hasMovScriptDir = Boolean(movscriptStat?.isDirectory())
  const impacts = projectImpacts({
    exists,
    isDirectory,
    hasWorkspaceManifest,
    hasProjectFile,
    hasLocalConfig,
    hasMovScriptDir,
  })
  return {
    projectDir,
    exists,
    isDirectory,
    hasWorkspaceManifest,
    hasProjectFile,
    hasLocalConfig,
    hasMovScriptDir,
    ...metadata,
    backendProjectId: numberValue(isRecord(localConfig) ? localConfig.backend_project_id ?? localConfig.backendProjectId : undefined),
    scopeKind: scopeKindValue(isRecord(localConfig) ? localConfig.scope_kind ?? localConfig.scopeKind : undefined),
    scopeId: stringValue(isRecord(localConfig) ? localConfig.scope_id ?? localConfig.scopeId : undefined),
    canCreateClean: (!exists || isDirectory) && !hasWorkspaceManifest && !hasProjectFile && !hasLocalConfig && !hasMovScriptDir,
    canOpen: isDirectory && Boolean(metadata.projectUid),
    impacts,
  }
}

export async function createLocalMovScriptProject(input: ElectronLocalProjectCreateInput): Promise<ElectronLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  await mkdir(projectDir, { recursive: true })
  const inspection = await inspectLocalMovScriptProject({ projectDir })
  if (!input.overwrite && !inspection.canCreateClean) {
    throw new Error(`Project directory is not empty for MovScript initialization: ${inspection.impacts.join('; ') || 'existing files may be affected'}`)
  }
  const title = stringValue(input.title) ?? (basename(projectDir) || 'MovScript Project')
  const result = await projectService().lifecycleCommand({
    projectDir,
    command: 'createProject',
    input: {
      title,
      ...(stringValue(input.projectId) ? { projectId: stringValue(input.projectId) } : {}),
      ...(stringValue(input.description) ? { description: stringValue(input.description) } : {}),
      ...(input.overwrite !== undefined ? { overwrite: input.overwrite } : {}),
    },
  })
  return localProjectResultFromService(projectDir, result.result, {
    title,
    description: stringValue(input.description),
  })
}

export async function openLocalMovScriptProject(input: ElectronLocalProjectOpenInput): Promise<ElectronLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const result = await projectService().lifecycleCommand({
    projectDir,
    command: 'openProject',
  })
  const localConfig = await readJSON(resolve(projectDir, LOCAL_CONFIG_PATH))
  return localProjectResultFromService(projectDir, result.result, {
    backendProjectId: numberValue(isRecord(localConfig) ? localConfig.backend_project_id ?? localConfig.backendProjectId : undefined),
  })
}

export async function bindLocalMovScriptProject(input: ElectronLocalProjectBindInput): Promise<ElectronLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const projectUid = stringValue(input.projectUid)
  if (!projectUid) throw new Error('projectUid is required')
  if (!Number.isInteger(input.backendProjectId) || input.backendProjectId <= 0) throw new Error('backendProjectId must be a positive integer')
  const scopeKind = scopeKindValue(input.scopeKind)
  if (!scopeKind) throw new Error('scopeKind must be user or org')
  const scopeId = stringValue(input.scopeId)
  if (!scopeId) throw new Error('scopeId is required')
  const configPath = resolve(projectDir, LOCAL_CONFIG_PATH)
  const existing = await readJSON(configPath)
  const now = new Date().toISOString()
  await mkdir(resolve(projectDir, '.movscript'), { recursive: true })
  await writeFile(configPath, `${JSON.stringify({
    ...(isRecord(existing) ? existing : {}),
    schema: 'movscript.local_project_config.v1',
    project_uid: projectUid,
    backend_project_id: input.backendProjectId,
    scope_kind: scopeKind,
    scope_id: scopeId,
    bound_at: now,
    updated_at: now,
  }, null, 2)}\n`, 'utf8')
  return openLocalMovScriptProject({ projectDir })
}

async function resolveProjectMetadata(projectDir: string): Promise<{ projectId?: string; projectUid?: string; title?: string; description?: string; updatedAt?: string }> {
  const result = await projectService().resolveLocator({ projectDir })
  return {
    projectId: stringValue(result.locator.projectId),
    projectUid: stringValue(result.locator.projectUid),
    title: stringValue(result.locator.projectTitle),
    description: stringValue(result.locator.description),
  }
}

function projectImpacts(input: {
  exists: boolean
  isDirectory: boolean
  hasWorkspaceManifest: boolean
  hasProjectFile: boolean
  hasLocalConfig: boolean
  hasMovScriptDir: boolean
}): string[] {
  const impacts: string[] = []
  if (!input.exists) return impacts
  if (!input.isDirectory) return ['路径已存在但不是文件夹']
  if (input.hasWorkspaceManifest) impacts.push('workspace.json 已存在，强制创建会改写项目身份文件')
  if (input.hasProjectFile) impacts.push('project.json 已存在，强制创建会改写项目标题/描述文件')
  if (input.hasLocalConfig) impacts.push('.movscript/config.json 已存在，强制创建会改写本机后端绑定')
  if (input.hasMovScriptDir && !input.hasLocalConfig) impacts.push('.movscript 目录已存在，可能包含本地项目配置')
  return impacts
}

function localProjectResult(
  projectDir: string,
  metadata: { projectId?: string; projectUid?: string; title?: string; description?: string; updatedAt?: string; initializedFiles?: string[]; backendProjectId?: number },
): ElectronLocalProjectResult {
  const now = new Date().toISOString()
  const project = {
    ID: metadata.backendProjectId ?? 0,
    owner_id: 0,
    name: metadata.title || basename(projectDir) || 'Local Project',
    description: metadata.description || projectDir,
    ...(metadata.projectUid ? { project_uid: metadata.projectUid } : {}),
    workspace_path: projectDir,
    project_path: projectDir,
    local: true as const,
    CreatedAt: metadata.updatedAt || now,
    UpdatedAt: metadata.updatedAt || now,
  }
  return {
    projectDir,
    projectPath: projectDir,
    ...(metadata.projectUid ? { projectUid: metadata.projectUid } : {}),
    ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
    project,
    ...(metadata.initializedFiles ? { initializedFiles: metadata.initializedFiles } : {}),
  }
}

function localProjectResultFromService(
  projectDir: string,
  value: unknown,
  fallback: { title?: string; description?: string; backendProjectId?: number } = {},
): ElectronLocalProjectResult {
  const result = isRecord(value) ? value : {}
  const project = isRecord(result.project) ? result.project : {}
  const locator = isRecord(result.locator) ? result.locator : {}
  const initializedFiles = Array.isArray(result.initializedFiles)
    ? result.initializedFiles
      .map((file) => isRecord(file) ? stringValue(file.path) : stringValue(file))
      .filter((file): file is string => Boolean(file))
    : undefined
  return localProjectResult(projectDir, {
    projectId: stringValue(result.projectId ?? result.project_id ?? locator.projectId ?? locator.project_id ?? project.id),
    projectUid: stringValue(result.projectUid ?? result.project_uid ?? locator.projectUid ?? locator.project_uid ?? project.projectUid ?? project.project_uid ?? project.uid),
    title: stringValue(project.name ?? project.title ?? result.title) ?? fallback.title,
    description: stringValue(project.description ?? result.description) ?? fallback.description,
    updatedAt: stringValue(project.updatedAt ?? project.updated_at ?? result.updatedAt ?? result.updated_at),
    initializedFiles,
    backendProjectId: fallback.backendProjectId,
  })
}

function normalizeProjectDir(value: unknown): string {
  const projectDir = stringValue(value)
  if (!projectDir) throw new Error('Project directory is required')
  return resolve(projectDir)
}

async function readJSON(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function scopeKindValue(value: unknown): 'user' | 'org' | undefined {
  return value === 'user' || value === 'org' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function projectService() {
  return createProjectServiceClientFromRuntime({ env: process.env })
}

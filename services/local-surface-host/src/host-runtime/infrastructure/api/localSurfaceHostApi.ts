import type {
  SurfaceHostApi,
  SurfaceHostLocalProjectBindInput,
  SurfaceHostLocalProjectCreateInput,
  SurfaceHostLocalProjectInspectInput,
  SurfaceHostLocalProjectInspection,
  SurfaceHostLocalProjectOpenInput,
  SurfaceHostLocalProjectResult,
} from '@movscript/shared'
import { mergeLocalSurfaceHostAPI } from '../../../adapters/localContentSurfaceHostApi.js'

const LOCAL_PROJECT_LIFECYCLE_ENDPOINT = '/v1/project/lifecycle/command'
const LOCAL_PROJECT_LOCATOR_ENDPOINT = '/v1/project/locator/resolve'

mergeLocalSurfaceHostAPI({
  openDirectory: async () => {
    const value = window.prompt('输入本地 MovScript 项目目录路径')
    const projectDir = value?.trim()
    return projectDir || null
  },
  inspectLocalMovScriptProject,
  createLocalMovScriptProject,
  openLocalMovScriptProject,
  bindLocalMovScriptProject,
} satisfies SurfaceHostApi)

async function inspectLocalMovScriptProject(input: SurfaceHostLocalProjectInspectInput): Promise<SurfaceHostLocalProjectInspection> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const locatorResponse = await postLocalProjectService(LOCAL_PROJECT_LOCATOR_ENDPOINT, { projectDir })
  const locator = recordValue(locatorResponse.locator ?? locatorResponse)
  const status = stringValue(locator.status)
  const projectUid = stringValue(locator.projectUid ?? locator.project_uid)
  const projectId = stringValue(locator.projectId ?? locator.project_id)
  const title = stringValue(locator.projectTitle ?? locator.title)
  const description = stringValue(locator.description)
  const hasMetadata = status === 'ready' || Boolean(projectUid || projectId)

  return {
    projectDir,
    exists: hasMetadata,
    isDirectory: true,
    hasWorkspaceManifest: hasMetadata,
    hasProjectFile: hasMetadata,
    hasLocalConfig: false,
    hasMovScriptDir: false,
    ...(projectUid ? { projectUid } : {}),
    ...(projectId ? { projectId } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    canCreateClean: !hasMetadata,
    canOpen: Boolean(projectUid),
    impacts: hasMetadata ? ['workspace.json 已存在，强制创建会改写项目身份文件'] : [],
  }
}

async function createLocalMovScriptProject(input: SurfaceHostLocalProjectCreateInput): Promise<SurfaceHostLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const title = stringValue(input.title) ?? basename(projectDir) ?? 'MovScript Project'
  const result = await postLocalProjectService(LOCAL_PROJECT_LIFECYCLE_ENDPOINT, {
    projectDir,
    command: 'createProject',
    input: {
      title,
      ...(stringValue(input.description) ? { description: stringValue(input.description) } : {}),
      ...(stringValue(input.projectId) ? { projectId: stringValue(input.projectId) } : {}),
      ...(input.overwrite !== undefined ? { overwrite: input.overwrite } : {}),
    },
  })
  return localProjectResultFromService(projectDir, result, {
    title,
    description: stringValue(input.description),
  })
}

async function openLocalMovScriptProject(input: SurfaceHostLocalProjectOpenInput): Promise<SurfaceHostLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const result = await postLocalProjectService(LOCAL_PROJECT_LIFECYCLE_ENDPOINT, {
    projectDir,
    command: 'openProject',
  })
  return localProjectResultFromService(projectDir, result)
}

async function bindLocalMovScriptProject(input: SurfaceHostLocalProjectBindInput): Promise<SurfaceHostLocalProjectResult> {
  const opened = await openLocalMovScriptProject({ projectDir: input.projectDir })
  return {
    ...opened,
    projectUid: input.projectUid || opened.projectUid,
    project: {
      ...opened.project,
      ID: input.backendProjectId,
      project_uid: input.projectUid || opened.project.project_uid,
    },
  }
}

async function postLocalProjectService(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = recordValue(payload)
    const message = stringValue(record.message) ?? stringValue(record.error) ?? `Project runtime request failed: ${response.status}`
    throw new Error(message)
  }
  return recordValue(recordValue(payload).result ?? payload)
}

function localProjectResultFromService(
  projectDir: string,
  value: unknown,
  fallback: { title?: string; description?: string; backendProjectId?: number } = {},
): SurfaceHostLocalProjectResult {
  const result = recordValue(value)
  const project = recordValue(result.project)
  const locator = recordValue(result.locator)
  const now = new Date().toISOString()
  const projectUid = stringValue(result.projectUid ?? result.project_uid ?? locator.projectUid ?? locator.project_uid ?? project.projectUid ?? project.project_uid ?? project.uid)
  const projectId = stringValue(result.projectId ?? result.project_id ?? locator.projectId ?? locator.project_id ?? project.id)
  const title = stringValue(project.name ?? project.title ?? result.title) ?? fallback.title ?? basename(projectDir) ?? 'Local Project'
  const description = stringValue(project.description ?? result.description) ?? fallback.description ?? projectDir
  const updatedAt = stringValue(project.updatedAt ?? project.updated_at ?? result.updatedAt ?? result.updated_at) ?? now
  const initializedFiles = Array.isArray(result.initializedFiles)
    ? result.initializedFiles
      .map((file) => stringValue(recordValue(file).path ?? file))
      .filter((file): file is string => Boolean(file))
    : undefined

  return {
    projectDir,
    projectPath: projectDir,
    ...(projectUid ? { projectUid } : {}),
    ...(projectId ? { projectId } : {}),
    project: {
      ID: fallback.backendProjectId ?? numberValue(project.ID ?? project.id) ?? 0,
      owner_id: 0,
      name: title,
      description,
      ...(projectUid ? { project_uid: projectUid } : {}),
      workspace_path: projectDir,
      project_path: projectDir,
      local: true,
      CreatedAt: stringValue(project.CreatedAt ?? project.createdAt ?? project.created_at) ?? updatedAt,
      UpdatedAt: updatedAt,
    },
    ...(initializedFiles ? { initializedFiles } : {}),
  }
}

function normalizeProjectDir(value: unknown): string {
  const projectDir = stringValue(value)
  if (!projectDir) throw new Error('Project directory is required')
  return projectDir
}

function basename(pathname: string): string | undefined {
  return pathname.split(/[\\/]/).filter(Boolean).pop()
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

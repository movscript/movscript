import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createNodeMovScriptWorkspaceService } from '@movscript/workspace/node'
import type {
  ElectronLocalProjectCreateInput,
  ElectronLocalProjectOpenInput,
  ElectronLocalProjectResult,
} from '../../src/shared/contracts/electronApi'

export async function createLocalMovScriptProject(input: ElectronLocalProjectCreateInput): Promise<ElectronLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  await mkdir(projectDir, { recursive: true })
  const title = stringValue(input.title) ?? (basename(projectDir) || 'MovScript Project')
  const service = createNodeMovScriptWorkspaceService({ projectDir })
  const initialized = await service.initializeProject({
    title,
    projectId: stringValue(input.projectId) ?? safeProjectId(title),
    ...(input.overwrite !== undefined ? { overwrite: input.overwrite } : {}),
  })
  return localProjectResult(projectDir, {
    title,
    description: stringValue(input.description),
    updatedAt: new Date().toISOString(),
    initializedFiles: initialized.files.map((file) => file.path),
  })
}

export async function openLocalMovScriptProject(input: ElectronLocalProjectOpenInput): Promise<ElectronLocalProjectResult> {
  const projectDir = normalizeProjectDir(input.projectDir)
  const projectStat = await stat(projectDir).catch(() => undefined)
  if (!projectStat?.isDirectory()) throw new Error('Project path must be an existing directory')
  const metadata = await readProjectMetadata(projectDir)
  return localProjectResult(projectDir, metadata)
}

async function readProjectMetadata(projectDir: string): Promise<{ title?: string; description?: string; updatedAt?: string }> {
  const candidates = ['project.json', 'workspace.json']
  for (const candidate of candidates) {
    const parsed = await readJSON(resolve(projectDir, candidate))
    if (!isRecord(parsed)) continue
    return {
      title: stringValue(parsed.title ?? parsed.name),
      description: stringValue(parsed.description),
      updatedAt: stringValue(parsed.updated_at ?? parsed.updatedAt),
    }
  }
  return {}
}

function localProjectResult(
  projectDir: string,
  metadata: { title?: string; description?: string; updatedAt?: string; initializedFiles?: string[] },
): ElectronLocalProjectResult {
  const now = new Date().toISOString()
  const project = {
    ID: -stablePositiveHash(projectDir),
    owner_id: 0,
    name: metadata.title || basename(projectDir) || 'Local Project',
    description: metadata.description || projectDir,
    workspace_path: projectDir,
    project_path: projectDir,
    local: true as const,
    CreatedAt: metadata.updatedAt || now,
    UpdatedAt: metadata.updatedAt || now,
  }
  return {
    projectDir,
    projectPath: projectDir,
    project,
    ...(metadata.initializedFiles ? { initializedFiles: metadata.initializedFiles } : {}),
  }
}

function normalizeProjectDir(value: unknown): string {
  const projectDir = stringValue(value)
  if (!projectDir) throw new Error('Project directory is required')
  return resolve(projectDir)
}

function safeProjectId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return id || 'movscript_project'
}

async function readJSON(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function stablePositiveHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import { backendList, backendPost } from '../../../../backend/node/client.js'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createNodeMovScriptWorkspaceService } from '@movscript/workspace/node'
import { getOptionalNumeric, getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import { summarizeProject } from './summaries.js'

export async function listProjects(args: Record<string, unknown>): Promise<unknown> {
  const limit = getOptionalNumeric(args, 'limit') ?? 100
  const projects = await backendList('/projects')
  return {
    count: projects.length,
    projects: projects.slice(0, limit).map(summarizeProject),
  }
}

export async function createProject(args: Record<string, unknown>): Promise<unknown> {
  const name = getOptionalString(args, 'name') ?? ''
  if (!name) throw new Error('name is required')
  const payload: Record<string, unknown> = { name }
  const description = getOptionalString(args, 'description') ?? ''
  const totalEpisodes = getOptionalNumeric(args, 'total_episodes')
  if (description) payload.description = description
  if (totalEpisodes !== undefined) payload.total_episodes = totalEpisodes

  const project = await backendPost('/projects', payload)
  const summary = summarizeProject(project)
  return {
    status: 'created',
    project: summary,
    message: isRecord(summary) && typeof summary.id === 'number'
      ? `项目「${name}」已创建（project#${summary.id}）。`
      : `项目「${name}」已创建。`,
  }
}

export async function initLocalProject(args: Record<string, unknown>): Promise<unknown> {
  const projectDir = normalizeProjectDir(args)
  await mkdir(projectDir, { recursive: true })
  const title = getOptionalString(args, 'title') ?? (basename(projectDir) || 'MovScript Project')
  const projectId = getOptionalString(args, 'projectId') ?? getOptionalString(args, 'project_id') ?? safeProjectId(title)
  const service = createNodeMovScriptWorkspaceService({ projectDir })
  const initialized = await service.initializeProject({
    title,
    projectId,
    ...(getOptionalString(args, 'language') ? { language: getOptionalString(args, 'language') } : {}),
    ...(typeof args.overwrite === 'boolean' ? { overwrite: args.overwrite } : {}),
  })
  return {
    status: 'initialized',
    projectDir,
    projectPath: projectDir,
    projectId: initialized.projectId,
    project: localProjectSummary(projectDir, {
      projectId: initialized.projectId,
      title,
      updatedAt: new Date().toISOString(),
    }),
    initializedFiles: initialized.files.map((file) => ({
      path: file.path,
      status: file.status,
    })),
    locator: {
      projectDir,
      projectId: initialized.projectId,
    },
    message: `MovScript 项目已初始化：${projectDir}`,
  }
}

export async function fetchLocalProject(args: Record<string, unknown>): Promise<unknown> {
  const projectDir = normalizeProjectDir(args)
  const projectStat = await stat(projectDir).catch(() => undefined)
  if (!projectStat?.isDirectory()) throw new Error('Project directory must be an existing directory')
  const metadata = await readProjectMetadata(projectDir)
  return {
    status: metadata.hasMetadata ? 'ready' : 'missing_metadata',
    projectDir,
    projectPath: projectDir,
    projectId: metadata.projectId,
    project: localProjectSummary(projectDir, metadata),
    locator: {
      projectDir,
      ...(metadata.projectId !== undefined ? { projectId: metadata.projectId } : {}),
    },
    message: metadata.hasMetadata
      ? `MovScript 项目已打开：${projectDir}`
      : `目录已打开但没有找到 MovScript 项目元数据：${projectDir}`,
  }
}

async function readProjectMetadata(
  projectDir: string,
): Promise<{ hasMetadata: boolean; projectId?: string; title?: string; description?: string; updatedAt?: string }> {
  for (const candidate of ['project.json', 'workspace.json']) {
    const parsed = await readJSON(resolve(projectDir, candidate))
    if (!isRecord(parsed)) continue
    return {
      hasMetadata: true,
      projectId: getStringField(parsed.project_id ?? parsed.projectId ?? parsed.id),
      title: getStringField(parsed.title ?? parsed.name),
      description: getStringField(parsed.description),
      updatedAt: getStringField(parsed.updated_at ?? parsed.updatedAt),
    }
  }
  return { hasMetadata: false }
}

function localProjectSummary(
  projectDir: string,
  metadata: { projectId?: string; title?: string; description?: string; updatedAt?: string },
): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    id: metadata.projectId,
    name: metadata.title || basename(projectDir) || 'Local Project',
    description: metadata.description || projectDir,
    projectDir,
    projectPath: projectDir,
    workspacePath: projectDir,
    local: true,
    updatedAt: metadata.updatedAt || now,
  }
}

function normalizeProjectDir(args: Record<string, unknown>): string {
  const projectDir = getOptionalString(args, 'projectDir') ?? getOptionalString(args, 'project_dir') ?? getOptionalString(args, 'cwd')
  if (!projectDir) throw new Error('projectDir is required')
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

function getStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

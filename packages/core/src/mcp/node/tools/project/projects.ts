import { backendList, backendPost } from '../../../../backend/node/client.js'
import {
  createProjectServiceClientFromRuntime,
  type ProjectLifecycleCommandName,
} from '@movscript/project'
import { resolve } from 'node:path'
import { getOptionalNumeric, getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import { requireMCPBackendBoundProject } from './localProjectBinding.js'
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
  const result = await runProjectLifecycleCommand('createProject', args)
  const backendBinding = await requireBackendBindingForLifecycleResult(result)
  return {
    ...result,
    backendProject: backendBinding.backendProject,
    projectDataSpace: backendBinding.projectDataSpace,
    message: `MovScript 项目已初始化：${stringField(result.projectDir)}`,
  }
}

export async function fetchLocalProject(args: Record<string, unknown>): Promise<unknown> {
  const result = await runProjectLifecycleCommand('openProject', args)
  const backendBinding = stringField(result.projectUid)
    ? await requireBackendBindingForLifecycleResult(result)
    : undefined
  return {
    ...result,
    ...(backendBinding ? {
      backendProject: backendBinding.backendProject,
      projectDataSpace: backendBinding.projectDataSpace,
    } : {}),
    message: stringField(result.projectUid)
      ? `MovScript 项目已打开：${stringField(result.projectDir)}`
      : `目录已打开但没有找到 MovScript 项目元数据：${stringField(result.projectDir)}`,
  }
}

async function runProjectLifecycleCommand(
  command: ProjectLifecycleCommandName,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const projectDir = normalizeProjectDir(args)
  const response = await createProjectServiceClientFromRuntime().lifecycleCommand({
    projectDir,
    command,
    input: lifecycleInputFromArgs(args),
  })
  if (!isRecord(response.result)) {
    throw new Error(`Project Service lifecycle command ${command} returned an invalid result`)
  }
  return response.result
}

function lifecycleInputFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const localProjectId = getOptionalString(args, 'localProjectId')
    ?? getOptionalString(args, 'local_project_id')
    ?? getOptionalString(args, 'projectId')
    ?? getOptionalString(args, 'project_id')
  return {
    ...(getOptionalString(args, 'title') ? { title: getOptionalString(args, 'title') } : {}),
    ...(localProjectId ? {
      localProjectId,
      local_project_id: localProjectId,
      projectId: localProjectId,
      project_id: localProjectId,
    } : {}),
    ...(getOptionalString(args, 'projectUid') ? { projectUid: getOptionalString(args, 'projectUid') } : {}),
    ...(getOptionalString(args, 'project_uid') ? { project_uid: getOptionalString(args, 'project_uid') } : {}),
    ...(getOptionalString(args, 'language') ? { language: getOptionalString(args, 'language') } : {}),
    ...(isRecord(args.standards) ? { standards: args.standards } : {}),
    ...(typeof args.overwrite === 'boolean' ? { overwrite: args.overwrite } : {}),
  }
}

function normalizeProjectDir(args: Record<string, unknown>): string {
  const projectDir = getOptionalString(args, 'projectDir') ?? getOptionalString(args, 'project_dir') ?? getOptionalString(args, 'cwd')
  if (!projectDir) throw new Error('projectDir is required')
  return resolve(projectDir)
}

async function requireBackendBindingForLifecycleResult(result: Record<string, unknown>) {
  const projectDir = stringField(result.projectDir)
  const projectUid = stringField(result.projectUid)
  if (!projectDir || !projectUid) {
    throw new Error('Project Service lifecycle result must include projectDir and projectUid for MCP backend binding')
  }
  return requireMCPBackendBoundProject({ projectDir, projectUid })
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

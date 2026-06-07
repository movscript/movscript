import { backendList, backendPost } from '../../../../backend/node/client.js'
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

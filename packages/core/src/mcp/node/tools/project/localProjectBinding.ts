import { createProjectServiceClientFromRuntime } from '@movscript/project'
import { backendPost } from '../../../../backend/node/client.js'
import { isRecord } from '../../../tools/shared/record.js'
import { resolveMCPProjectWorkspaceLocator, type MCPResolvedProjectWorkspaceLocator } from '../workspace/locator.js'

export type MCPBackendBoundProjectLocator = MCPResolvedProjectWorkspaceLocator & {
  projectUid: string
  projectTitle?: string
  backendProject: unknown
  projectDataSpace: unknown
  description?: string
}

const ensuredProjectBindings = new Map<string, Promise<MCPBackendBoundProjectLocator>>()
const ENSURED_PROJECT_BINDING_LIMIT = 500

export async function requireMCPBackendBoundProject(
  args: Record<string, unknown> | MCPResolvedProjectWorkspaceLocator,
): Promise<MCPBackendBoundProjectLocator> {
  const locator = isResolvedProjectWorkspaceLocator(args)
    ? args
    : resolveMCPProjectWorkspaceLocator(args)
  const resolvedLocator = await resolveMCPProjectBindingLocator(locator)
  const projectUid = stringField(resolvedLocator.projectUid)
  if (!projectUid) {
    throw new Error('MovScript project requires project_uid. Open or initialize the project before using project-scoped write tools.')
  }
  const projectTitle = resolvedLocator.projectTitle ?? projectTitleFromDir(resolvedLocator.projectDir)
  const key = [
    resolvedLocator.workspaceDir,
    resolvedLocator.projectDir,
    projectUid,
    projectTitle,
  ].join('\u001f')
  const cached = ensuredProjectBindings.get(key)
  if (cached) return cached
  const pending = ensureBackendBinding({
    ...resolvedLocator,
    projectUid,
    ...(projectTitle ? { projectTitle } : {}),
    ...(resolvedLocator.description ? { description: resolvedLocator.description } : {}),
  }).catch((err) => {
    ensuredProjectBindings.delete(key)
    throw err
  })
  rememberEnsuredProjectBinding(key, pending)
  return pending
}

export async function resolveMCPProjectBindingLocator(
  args: Record<string, unknown> | MCPResolvedProjectWorkspaceLocator,
): Promise<MCPResolvedProjectWorkspaceLocator & {
  projectTitle?: string
  description?: string
}> {
  const locator = isResolvedProjectWorkspaceLocator(args)
    ? args
    : resolveMCPProjectWorkspaceLocator(args)
  return resolveProjectBindingLocator(locator)
}

function isResolvedProjectWorkspaceLocator(value: unknown): value is MCPResolvedProjectWorkspaceLocator {
  return isRecord(value) && typeof value.projectDir === 'string'
}

async function resolveProjectBindingLocator(locator: MCPResolvedProjectWorkspaceLocator): Promise<MCPResolvedProjectWorkspaceLocator & {
  projectTitle?: string
  description?: string
}> {
  const response = await createProjectServiceClientFromRuntime().resolveLocator({
    projectDir: locator.projectDir,
    workspaceDir: locator.workspaceDir,
    ...(locator.projectUid ? { projectUid: locator.projectUid } : {}),
  })
  const projectLocator = response.locator
  return {
    workspaceDir: projectLocator.workspaceDir ?? locator.workspaceDir,
    projectDir: projectLocator.projectDir,
    ...(projectLocator.projectUid ?? locator.projectUid ? { projectUid: projectLocator.projectUid ?? locator.projectUid } : {}),
    ...(projectLocator.projectTitle ? { projectTitle: projectLocator.projectTitle } : {}),
    ...(projectLocator.description ? { description: projectLocator.description } : {}),
  }
}

async function ensureBackendBinding(input: MCPResolvedProjectWorkspaceLocator & {
  projectUid: string
  projectTitle?: string
  description?: string
}): Promise<MCPBackendBoundProjectLocator> {
  const backendProjectResponse = await backendPost('/projects/ensure', {
    project_uid: input.projectUid,
    name: input.projectTitle ?? projectTitleFromDir(input.projectDir),
    description: input.description ?? input.projectDir,
  })
  const projectDataSpace = await backendPost('/project-data/spaces', {
    project_uid: input.projectUid,
    title: input.projectTitle ?? projectTitleFromDir(input.projectDir),
  })
  return {
    ...input,
    backendProject: isRecord(backendProjectResponse) ? backendProjectResponse.project : undefined,
    projectDataSpace,
  }
}

function projectTitleFromDir(projectDir: string): string {
  const parts = projectDir.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || 'Local Project'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function rememberEnsuredProjectBinding(key: string, pending: Promise<MCPBackendBoundProjectLocator>): void {
  ensuredProjectBindings.set(key, pending)
  if (ensuredProjectBindings.size <= ENSURED_PROJECT_BINDING_LIMIT) return
  const oldest = ensuredProjectBindings.keys().next().value
  if (oldest) ensuredProjectBindings.delete(oldest)
}

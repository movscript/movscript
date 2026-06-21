import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { backendPost } from '../../../../backend/node/client.js'
import { isRecord } from '../../../tools/shared/record.js'
import { resolveMCPProjectWorkspaceLocator, type MCPResolvedProjectWorkspaceLocator } from '../workspace/locator.js'

export type MCPBackendBoundProjectLocator = MCPResolvedProjectWorkspaceLocator & {
  projectUid: string
  projectTitle?: string
  backendProject: unknown
  projectDataSpace: unknown
}

type ProjectManifest = {
  projectUid?: string
  projectTitle?: string
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
  const manifest = await readProjectManifest(locator.projectDir)
  const projectUid = stringField(locator.projectUid) ?? manifest.projectUid
  if (!projectUid) {
    throw new Error('MovScript project requires project_uid. Open or initialize the project before using project-scoped write tools.')
  }
  const projectTitle = manifest.projectTitle ?? projectTitleFromDir(locator.projectDir)
  const key = [
    locator.workspaceDir,
    locator.projectDir,
    projectUid,
    projectTitle,
  ].join('\u001f')
  const cached = ensuredProjectBindings.get(key)
  if (cached) return cached
  const pending = ensureBackendBinding({
    ...locator,
    projectUid,
    ...(projectTitle ? { projectTitle } : {}),
    ...(manifest.description ? { description: manifest.description } : {}),
  }).catch((err) => {
    ensuredProjectBindings.delete(key)
    throw err
  })
  rememberEnsuredProjectBinding(key, pending)
  return pending
}

function isResolvedProjectWorkspaceLocator(value: unknown): value is MCPResolvedProjectWorkspaceLocator {
  return isRecord(value) && typeof value.projectDir === 'string'
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

async function readProjectManifest(projectDir: string): Promise<ProjectManifest> {
  for (const name of ['workspace.json', 'project.json']) {
    try {
      const parsed = JSON.parse(await readFile(resolve(projectDir, name), 'utf8')) as unknown
      if (!isRecord(parsed)) continue
      return {
        projectUid: stringField(parsed.project_uid ?? parsed.projectUid),
        projectTitle: stringField(parsed.title ?? parsed.name),
        description: stringField(parsed.description),
      }
    } catch {
      // Try the next metadata file.
    }
  }
  return {}
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

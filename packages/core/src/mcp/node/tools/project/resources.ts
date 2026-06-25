import { createProjectServiceClientFromRuntime, type ProjectResourceViewKind } from '@movscript/project'
import { resourceContent } from '../../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../../protocol/types.js'
import { getMCPContextSnapshot } from '../focus/store.js'
import { resolveMCPProjectWorkspaceLocator } from '../workspace/locator.js'
import { listProjects } from './projects.js'
import { summarizeResource } from './summaries.js'

export function listProjectResources(): MCPResource[] {
  const snapshot = getMCPContextSnapshot()
  const resources: MCPResource[] = [
    {
      uri: 'movscript://projects',
      name: 'Projects',
      description: 'All visible MovScript projects.',
      mimeType: 'text/markdown',
    },
  ]

  if (snapshot.project) {
    const id = snapshot.project.id
    resources.push(
      resource(`movscript://project/${id}/summary`, 'Project summary'),
      resource(`movscript://project/${id}/scripts`, 'Scripts'),
      resource(`movscript://project/${id}/settings`, 'Settings'),
      resource(`movscript://project/${id}/assets`, 'Assets'),
      resource(`movscript://project/${id}/episodes`, 'Episodes'),
      resource(`movscript://project/${id}/scenes`, 'Scenes'),
      resource(`movscript://project/${id}/storyboards`, 'Storyboards'),
      resource(`movscript://project/${id}/content-units`, 'Content units'),
    )
  }

  return resources
}

export const projectResourceReaders = [
  readProjectResource,
]

async function readProjectResource(uri: string): Promise<MCPJSONValue | null> {
  if (uri === 'movscript://projects') return resourceContent(uri, await listProjects({}))

  const projectResource = parseProjectResourceURI(uri)
  if (!projectResource) return null

  const data = await readWorkspaceProjectResource(projectResource.projectId, projectResource.kind)
  return resourceContent(uri, summarizeResource(data))
}

function resource(uri: string, name: string): MCPResource {
  return { uri, name, mimeType: 'text/markdown' }
}

async function readWorkspaceProjectResource(projectId: number, kind: string): Promise<unknown[]> {
  const snapshot = getMCPContextSnapshot()
  const projectDir = snapshot.project && snapshot.project.id === projectId
    ? snapshot.project.projectDir ?? snapshot.project.projectPath ?? snapshot.project.workspacePath ?? snapshot.project.project_path ?? snapshot.project.workspace_path
    : undefined
  const locator = resolveMCPProjectWorkspaceLocator({ projectDir })
  const response = await createProjectServiceClientFromRuntime().resourceView({
    projectDir: locator.projectDir,
    kind: projectResourceViewKind(kind),
  })
  return response.items
}

function projectResourceViewKind(kind: string): ProjectResourceViewKind {
  switch (kind) {
    case 'summary':
      return 'summary'
    case 'assets':
    case 'assests':
      return 'assets'
    case 'episodes':
    case 'productions':
      return 'episodes'
    case 'scenes':
    case 'segments':
      return 'scenes'
    case 'storyboards':
      return 'storyboards'
    case 'content-units':
      return 'content-units'
    case 'settings':
      return 'settings'
    case 'scripts':
      return 'scripts'
    default:
      throw new Error(`Unsupported project resource kind: ${kind}`)
  }
}

function parseProjectResourceURI(uri: string): { projectId: number; kind: string } | null {
  const match = uri.match(/^movscript:\/\/project\/(\d+)\/([a-z-]+)$/)
  if (!match) return null
  return {
    projectId: Number(match[1]),
    kind: match[2] ?? '',
  }
}

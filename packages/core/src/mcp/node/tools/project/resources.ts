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
      resource(`movscript://project/${id}/settings`, 'Settings', 'Legacy setting source records with namespace projection fields.'),
      resource(`movscript://project/${id}/setting-states`, 'Setting states', 'Legacy setting-state alias; prefer setting-namespaces for namespace-aware work.'),
      resource(`movscript://project/${id}/assets`, 'Assets', 'System primitive asset records.'),
      resource(`movscript://project/${id}/namespace-vocabulary`, 'Namespace vocabulary', 'Project namespace vocabulary, templates, aliases, and diagnostics.'),
      resource(`movscript://project/${id}/timeline-namespaces`, 'Timeline namespaces', 'Canonical timeline namespace nodes using project vocabulary.'),
      resource(`movscript://project/${id}/setting-namespaces`, 'Setting namespaces', 'Canonical setting namespace nodes using project vocabulary.'),
      resource(`movscript://project/${id}/system-primitives`, 'System primitives', 'Scene moments, expression units, storyboards, keyframes, audio cues, assets, and assemblies.'),
      resource(`movscript://project/${id}/domain-nodes`, 'Domain nodes', 'All normalized MovScript domain nodes.'),
      resource(`movscript://project/${id}/domain-edges`, 'Domain edges', 'Normalized parent, scope, target, uses, and selection edges.'),
      resource(`movscript://project/${id}/episodes`, 'Episodes', 'Legacy production alias; prefer timeline-namespaces for new namespace-aware work.'),
      resource(`movscript://project/${id}/scenes`, 'Scenes', 'Legacy segment alias; prefer timeline-namespaces and system-primitives for new work.'),
      resource(`movscript://project/${id}/storyboards`, 'Storyboards', 'System primitive storyboard records.'),
      resource(`movscript://project/${id}/content-units`, 'Content units', 'Production tasks, candidates, and generation target refs.'),
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

function resource(uri: string, name: string, description?: string): MCPResource {
  return { uri, name, ...(description ? { description } : {}), mimeType: 'text/markdown' }
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
    case 'namespace-vocabulary':
      return 'namespace-vocabulary'
    case 'timeline-namespaces':
      return 'timeline-namespaces'
    case 'setting-namespaces':
      return 'setting-namespaces'
    case 'system-primitives':
      return 'system-primitives'
    case 'domain-nodes':
      return 'domain-nodes'
    case 'domain-edges':
      return 'domain-edges'
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
    case 'setting-states':
    case 'states':
      return 'setting-states'
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

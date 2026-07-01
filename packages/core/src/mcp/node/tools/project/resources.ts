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
    const key = projectResourceKey(snapshot.project)
    resources.push(
      resource(`movscript://project/${key}/summary`, 'Project summary'),
      resource(`movscript://project/${key}/scripts`, 'Scripts'),
      resource(`movscript://project/${key}/settings`, 'Settings', 'Legacy setting source records with namespace projection fields.'),
      resource(`movscript://project/${key}/setting-states`, 'Setting states', 'Legacy setting-state alias; prefer setting-namespaces for namespace-aware work.'),
      resource(`movscript://project/${key}/assets`, 'Assets', 'System primitive asset records.'),
      resource(`movscript://project/${key}/project-context`, 'Project context', 'Project standards, namespace vocabulary, hash, and agent guidance from Project Service.'),
      resource(`movscript://project/${key}/namespace-vocabulary`, 'Namespace vocabulary', 'Project namespace vocabulary, templates, aliases, and diagnostics.'),
      resource(`movscript://project/${key}/timeline-namespaces`, 'Timeline namespaces', 'Canonical timeline namespace nodes using project vocabulary.'),
      resource(`movscript://project/${key}/setting-namespaces`, 'Setting namespaces', 'Canonical setting namespace nodes using project vocabulary.'),
      resource(`movscript://project/${key}/system-primitives`, 'System primitives', 'Scene moments, expression units, storyboards, keyframes, audio cues, assets, and assemblies.'),
      resource(`movscript://project/${key}/domain-nodes`, 'Domain nodes', 'All normalized MovScript domain nodes.'),
      resource(`movscript://project/${key}/domain-edges`, 'Domain edges', 'Normalized parent, scope, target, uses, and selection edges.'),
      resource(`movscript://project/${key}/episodes`, 'Episodes', 'Legacy production alias; prefer timeline-namespaces for new namespace-aware work.'),
      resource(`movscript://project/${key}/scenes`, 'Scenes', 'Legacy segment alias; prefer timeline-namespaces and system-primitives for new work.'),
      resource(`movscript://project/${key}/storyboards`, 'Storyboards', 'System primitive storyboard records.'),
      resource(`movscript://project/${key}/content-units`, 'Content units', 'Production tasks, candidates, and generation target refs.'),
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

  const data = await readWorkspaceProjectResource(projectResource.projectKey, projectResource.kind)
  return resourceContent(uri, summarizeResource(data))
}

function resource(uri: string, name: string, description?: string): MCPResource {
  return { uri, name, ...(description ? { description } : {}), mimeType: 'text/markdown' }
}

async function readWorkspaceProjectResource(projectKey: string, kind: string): Promise<unknown[]> {
  const snapshot = getMCPContextSnapshot()
  const projectDir = snapshot.project && projectResourceMatches(snapshot.project, projectKey)
    ? projectDirectoryFromContextProject(snapshot.project)
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
    case 'project-context':
      return 'project-context'
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

function parseProjectResourceURI(uri: string): { projectKey: string; kind: string } | null {
  const match = uri.match(/^movscript:\/\/project\/([^/]+)\/([a-z-]+)$/)
  if (!match) return null
  return {
    projectKey: decodeURIComponent(match[1] ?? ''),
    kind: match[2] ?? '',
  }
}

function projectResourceKey(project: NonNullable<ReturnType<typeof getMCPContextSnapshot>['project']>): string {
  const key = stringValue(project.projectKey)
    ?? stringValue(project.project_key)
    ?? stringValue(project.routeProjectKey)
    ?? stringValue(project.route_project_key)
    ?? stringValue(project.projectUid)
    ?? stringValue(project.project_uid)
    ?? stringValue(project.uid)
    ?? stringValue(project.id)
    ?? stringValue(project.backendProjectId)
    ?? stringValue(project.backend_project_id)
    ?? 'current'
  return encodeURIComponent(key)
}

function projectResourceMatches(project: NonNullable<ReturnType<typeof getMCPContextSnapshot>['project']>, key: string): boolean {
  if (key === 'current') return true
  const values = [
    project.projectKey,
    project.project_key,
    project.routeProjectKey,
    project.route_project_key,
    project.projectUid,
    project.project_uid,
    project.uid,
    project.id,
    project.backendProjectId,
    project.backend_project_id,
  ].flatMap((value) => {
    const stringified = stringValue(value)
    return stringified ? [stringified] : []
  })
  return values.includes(key)
}

function projectDirectoryFromContextProject(project: NonNullable<ReturnType<typeof getMCPContextSnapshot>['project']>): string | undefined {
  return project.projectDir
    ?? project.projectPath
    ?? project.workspacePath
    ?? project.project_path
    ?? project.workspace_path
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

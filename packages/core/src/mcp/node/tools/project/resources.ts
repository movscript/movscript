import type { SemanticEntityKind } from '@movscript/language/domain'
import { resourceContent } from '../../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../../protocol/types.js'
import { getMCPContextSnapshot } from '../focus/store.js'
import { createMovScriptDomainRuntime } from '../domain/runtime.js'
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
      resource(`movscript://project/${id}/shots`, 'Shots'),
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
  const runtime = createMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator({ projectId }))
  if (kind === 'scripts') {
    const scripts = await runtime.queryEntities({ entityKind: 'script' })
    return Promise.all(scripts.map(async (entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
      source: await runtime.readScriptSource({ record: entity.record, entity }),
    })))
  }

  const entityKind = projectResourceEntityKind(kind)
  if (entityKind === 'project') {
    return (await runtime.queryEntities({ entityKind, limit: 1 })).map((entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
    }))
  }

  return (await runtime.queryEntities({ entityKind })).map((entity) => ({
    ...entity.record,
    entityKind: entity.entityKind,
    path: entity.path,
  }))
}

function projectResourceEntityKind(kind: string): SemanticEntityKind {
  switch (kind) {
    case 'summary':
      return 'project'
    case 'assets':
    case 'assests':
      return 'asset'
    case 'episodes':
    case 'productions':
      return 'production'
    case 'scenes':
    case 'segments':
      return 'segment'
    case 'storyboards':
      return 'storyboard'
    case 'shots':
    case 'content-units':
      return 'content_unit'
    case 'settings':
      return 'setting'
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

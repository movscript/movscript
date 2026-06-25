import type { QueryClient } from '@tanstack/react-query'

import {
  invalidateAgentSessionOutputMutationEvent,
  type AgentSessionOutputMutationEvent,
} from '@/features/agent/application/agentSessionOutputMutationInvalidation'
import { agentBrowserKeys } from '@/features/agent/application/agentQueryKeys'
import {
  invalidateMovScriptWorkspaceMutationEvent,
  type MovScriptWorkspaceMutationEvent,
} from '@/features/agent/application/movScriptWorkspaceMutationInvalidation'
import { agentSessionOutputKeys } from '@/features/agent/application/agentSessionOutputQueryKeys'
import { movScriptWorkspaceKeys } from '@/features/agent/application/movScriptWorkspaceQueryKeys'
import {
  invalidateCanvasMutationEvent,
  type CanvasMutationEvent,
} from '@movscript/canvas-surface/data'
import { contentCanvasKeys } from '@movscript/project-surface/data'
import {
  invalidateContentCanvasMutationEvent,
  type ContentCanvasMutationEvent,
} from '@movscript/project-surface/data'
import {
  invalidateJobMutationEvent,
  type JobMutationEvent,
} from '@/features/jobs/application/jobMutationInvalidation'
import {
  invalidateOrganizationMutationEvent,
  type OrganizationMutationEvent,
} from '@/features/organization/application/organizationMutationInvalidation'
import {
  invalidateProjectMutationEvent,
  type ProjectMutationEvent,
} from '@movscript/project-surface/data'
import { resourceCandidateKeys } from '@movscript/resource-surface/data'
import {
  invalidateResourceMutationEvent,
  type ResourceMutationEvent,
} from '@movscript/resource-surface/data'
import {
  invalidateScriptMutationEvent,
  type ScriptMutationEvent,
} from '@movscript/project-surface/data'
import {
  invalidateShotLibraryMutationEvent,
  type ShotLibraryMutationEvent,
} from '@movscript/shot-library-surface/data'
import {
  invalidateSemanticEntityMutationEvent,
  type SemanticEntityMutationEvent,
} from '@/shared/application/semanticEntityMutationInvalidation'
import { semanticEntityKeys } from '@/shared/application/semanticEntityQueryKeys'
import type { SemanticEntityConfig } from '@/shared/infrastructure/api/semanticEntities'
import { subscribeAppEvents, type AppEvent } from './appEvents'

const PROJECT_WORKSPACE_ENTITY_KINDS = [
  'settings',
  'assetSlots',
  'productions',
  'sceneMoments',
  'contentUnits',
] as const satisfies readonly SemanticEntityConfig['kind'][]

export function installAppEventQueryInvalidationBridge(queryClient: QueryClient): () => void {
  return subscribeAppEvents((event) => {
    if (event.source === 'query-invalidation') return
    if (event.delivery !== 'cross-surface') return
    invalidateAppEventQueries(queryClient, event)
  })
}

export function invalidateAppEventQueries(queryClient: QueryClient, event: AppEvent): void {
  switch (event.topic) {
    case 'resource.mutation':
      invalidateResourceMutationEvent(queryClient, event.payload as ResourceMutationEvent)
      return
    case 'script.mutation':
      invalidateScriptMutationEvent(queryClient, event.payload as ScriptMutationEvent)
      invalidateAgentBrowserNavigationFromScript(queryClient, event.payload as ScriptMutationEvent)
      return
    case 'canvas.mutation':
      invalidateCanvasMutationEvent(queryClient, event.payload as CanvasMutationEvent)
      return
    case 'job.mutation':
      invalidateJobMutationEvent(queryClient, event.payload as JobMutationEvent)
      return
    case 'organization.mutation':
      invalidateOrganizationMutationEvent(queryClient, event.payload as OrganizationMutationEvent)
      return
    case 'shot-library.mutation':
      invalidateShotLibraryMutationEvent(queryClient, event.payload as ShotLibraryMutationEvent)
      return
    case 'agent-output.mutation':
      void invalidateAgentSessionOutputMutationEvent(queryClient, event.payload as AgentSessionOutputMutationEvent)
      return
    case 'workspace-files.mutation':
      invalidateMovScriptWorkspaceMutationEvent(queryClient, event.payload as MovScriptWorkspaceMutationEvent)
      return
    case 'semantic-entity.mutation':
      invalidateSemanticEntityMutationEvent(queryClient, event.payload as SemanticEntityMutationEvent)
      invalidateAgentBrowserNavigationFromSemanticEntity(queryClient, event.payload as SemanticEntityMutationEvent)
      return
    case 'project.mutation':
      invalidateProjectMutationEvent(queryClient, event.payload as ProjectMutationEvent)
      return
    case 'content-canvas.mutation':
      invalidateContentCanvasMutationEvent(queryClient, event.payload as ContentCanvasMutationEvent)
      return
    case 'project.workspace.updated':
      invalidateProjectWorkspaceUpdated(queryClient, event.payload)
      return
    default:
      return
  }
}

function invalidateProjectWorkspaceUpdated(queryClient: QueryClient, payload: unknown): void {
  const projectId = positiveProjectId(
    payload && typeof payload === 'object'
      ? (payload as { projectId?: unknown; project_id?: unknown }).projectId
        ?? (payload as { projectId?: unknown; project_id?: unknown }).project_id
      : undefined,
  )
  void queryClient.invalidateQueries({ queryKey: movScriptWorkspaceKeys.filesScope })
  if (!projectId) return
  void queryClient.invalidateQueries({ queryKey: contentCanvasKeys.projectScope(projectId) })
  void queryClient.invalidateQueries({ queryKey: agentSessionOutputKeys.contentWorkspace(projectId) })
  void queryClient.invalidateQueries({ queryKey: agentBrowserKeys.navigationProject(projectId) })
  void queryClient.invalidateQueries({ queryKey: resourceCandidateKeys.targetsForProject(projectId) })
  void queryClient.invalidateQueries({ queryKey: resourceCandidateKeys.generatedTargets(projectId) })
  for (const kind of PROJECT_WORKSPACE_ENTITY_KINDS) {
    void queryClient.invalidateQueries({ queryKey: semanticEntityKeys.list(kind, projectId) })
    void queryClient.invalidateQueries({ queryKey: agentBrowserKeys.navigationEntity(projectId, kind) })
  }
}

function invalidateAgentBrowserNavigationFromScript(queryClient: QueryClient, event: ScriptMutationEvent): void {
  if (!event.projectId) return
  void queryClient.invalidateQueries({ queryKey: agentBrowserKeys.navigationScriptsScope(event.projectId) })
}

function invalidateAgentBrowserNavigationFromSemanticEntity(queryClient: QueryClient, event: SemanticEntityMutationEvent): void {
  if (!event.projectId) return
  void queryClient.invalidateQueries({ queryKey: agentBrowserKeys.navigationEntity(event.projectId, event.kind) })
}

function positiveProjectId(value: unknown): number | undefined {
  const projectId = Number(value)
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

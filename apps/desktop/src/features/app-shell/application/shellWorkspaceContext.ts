import { agentWorkspaceContextFromProject } from '@/features/agent/presentation/agentComposerWorkspaceModel'
import type { AppRouteSurface } from '@/routes/appRouteModel'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { Project } from '@/types'

export type AppShellWorkspaceContext = MovScriptWorkspaceContext & {
  userId?: string
  orgId?: string
}

export function shellWorkspaceContextForRoute(input: {
  routeSurface: AppRouteSurface
  routeChrome?: AppRouteSurface
  currentProject: Project | null
  userId?: string
}): AppShellWorkspaceContext {
  const userId = input.userId || undefined
  if ((input.routeSurface === 'project' || input.routeSurface === 'agent') && input.currentProject?.ID) {
    return {
      ...agentWorkspaceContextFromProject(input.currentProject),
      userId,
    }
  }
  return {
    scope: 'global',
    userId,
  }
}

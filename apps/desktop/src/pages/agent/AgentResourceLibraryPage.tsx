import { Navigate, useLocation } from 'react-router-dom'
import { AgentResourceLibrarySurface, type AgentResourceLibraryRenderProps } from '@movscript/resource-surface/react'
import { ResourceLibraryView } from '@movscript/resource-surface/pages'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'

export default function AgentResourceLibraryPage() {
  const location = useLocation()
  const proxy = useAgentMcpApiProxy()

  if (location.pathname === ROUTES.codexResources) {
    return <Navigate to={`${ROUTES.agentResources}${location.search}${location.hash}`} replace />
  }

  return (
    <AgentResourceLibrarySurface
      ready={proxy.ready}
      params={proxy.params}
      renderLibrary={(props: AgentResourceLibraryRenderProps) => (
        <ResourceLibraryView
          variant="page"
          initialSearch={props.initialSearch}
          initialType={props.initialType}
          initialScope={props.initialScope}
          focusResourceId={props.focusResourceId}
          agentReferenceActions={props.agentReferenceActions}
        />
      )}
    />
  )
}

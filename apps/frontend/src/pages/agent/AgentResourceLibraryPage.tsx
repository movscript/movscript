import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ResourceLibraryView } from '@/features/resources/components/ResourcesPage'
import { ROUTES } from '@/routes/projectRoutes'
import { setAgentBrowserAPIV1BaseURL } from '@/shared/infrastructure/api'

export default function AgentResourceLibraryPage() {
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const mcpApiBaseURL = params.get('mcpApiBaseURL')?.trim() ?? ''
  const [configuredAPIBaseURL, setConfiguredAPIBaseURL] = useState('')

  useEffect(() => {
    setConfiguredAPIBaseURL('')
    if (!mcpApiBaseURL) return
    setAgentBrowserAPIV1BaseURL(mcpApiBaseURL)
    setConfiguredAPIBaseURL(mcpApiBaseURL)
    return () => {
      setAgentBrowserAPIV1BaseURL(null)
      setConfiguredAPIBaseURL('')
    }
  }, [mcpApiBaseURL])

  if (location.pathname === ROUTES.codexResources) {
    return <Navigate to={`${ROUTES.agentResources}${location.search}${location.hash}`} replace />
  }

  if (!mcpApiBaseURL || configuredAPIBaseURL !== mcpApiBaseURL) {
    return <div className="resource-page__status">Preparing resource library...</div>
  }

  return <ResourceLibraryView variant="page" />
}

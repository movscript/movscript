import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { setAgentBrowserAPIV1BaseURL } from '@/shared/infrastructure/api'

export function useAgentMcpApiProxy() {
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

  return {
    params,
    mcpApiBaseURL,
    ready: Boolean(mcpApiBaseURL && configuredAPIBaseURL === mcpApiBaseURL),
  }
}

import { useCallback } from 'react'
import { toastMCPStatus } from '@/lib/mcpStatus'

export function useAgentMCPReadiness() {
  return useCallback(async () => {
    const getMCPStatus = typeof window === 'undefined' ? undefined : window.api?.getMCPStatus
    if (!getMCPStatus) return
    const status = await getMCPStatus()
    if (status.ok) return
    toastMCPStatus(status)
    throw new Error(status.error || `MCP server is not available at ${status.endpoint}`)
  }, [])
}

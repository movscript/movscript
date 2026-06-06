import { useEffect, useMemo, useRef } from 'react'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'

const DEFAULT_SESSION_LEASE_TTL_MS = 30_000
const DEFAULT_SESSION_LEASE_HEARTBEAT_MS = 10_000

export interface UseProviderSessionLeaseInput {
  enabled?: boolean
  sessionId?: string
  workspaceDir?: string
  holder: string
}

export function useProviderSessionLease({
  enabled = true,
  sessionId,
  workspaceDir,
  holder,
}: UseProviderSessionLeaseInput): void {
  const leaseIdRef = useRef<string | undefined>(undefined)
  const trimmedSessionId = sessionId?.trim()
  const trimmedWorkspaceDir = workspaceDir?.trim()
  const providerSessionLeaseClient = useMemo(() => trimmedSessionId
    ? providerSessionClient.forSession({
      sessionId: trimmedSessionId,
      ...(trimmedWorkspaceDir ? { workspaceDir: trimmedWorkspaceDir } : {}),
    })
    : undefined,
  [trimmedSessionId, trimmedWorkspaceDir])

  useEffect(() => {
    if (!enabled || !trimmedSessionId || !providerSessionLeaseClient) return undefined
    const leaseId = leaseIdRef.current ?? makeProviderSessionLeaseId(holder)
    leaseIdRef.current = leaseId
    let disposed = false
    let heartbeatTimer: number | undefined
    const heartbeat = async () => {
      try {
        await providerSessionLeaseClient.ensureRunning()
        if (disposed) return
        await providerSessionLeaseClient.acquireProviderSessionLease({
          leaseId,
          ttlMs: DEFAULT_SESSION_LEASE_TTL_MS,
          holder,
        })
      } catch {
        // The next visible provider-session request will surface the error; lease heartbeat retries quietly.
      }
    }
    void heartbeat()
    heartbeatTimer = window.setInterval(() => void heartbeat(), DEFAULT_SESSION_LEASE_HEARTBEAT_MS)
    return () => {
      disposed = true
      if (heartbeatTimer) window.clearInterval(heartbeatTimer)
      void providerSessionLeaseClient.releaseProviderSessionLease(leaseId).catch(() => undefined)
    }
  }, [enabled, holder, providerSessionLeaseClient, trimmedSessionId])
}

function makeProviderSessionLeaseId(holder: string): string {
  const prefix = holder.trim().replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 48) || 'ui'
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

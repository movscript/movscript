import { useEffect, useMemo, useRef } from 'react'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

const DEFAULT_SESSION_LEASE_TTL_MS = 30_000
const DEFAULT_SESSION_LEASE_HEARTBEAT_MS = 10_000

export interface UseAgentRuntimeSessionLeaseInput {
  enabled?: boolean
  sessionId?: string
  workspaceDir?: string
  holder: string
}

export function useAgentRuntimeSessionLease({
  enabled = true,
  sessionId,
  workspaceDir,
  holder,
}: UseAgentRuntimeSessionLeaseInput): void {
  const leaseIdRef = useRef<string | undefined>(undefined)
  const trimmedSessionId = sessionId?.trim()
  const trimmedWorkspaceDir = workspaceDir?.trim()
  const runtimeClient = useMemo(() => trimmedSessionId
    ? localAgentClient.forSession({
      sessionId: trimmedSessionId,
      ...(trimmedWorkspaceDir ? { workspaceDir: trimmedWorkspaceDir } : {}),
    })
    : undefined,
  [trimmedSessionId, trimmedWorkspaceDir])

  useEffect(() => {
    if (!enabled || !trimmedSessionId || !runtimeClient) return undefined
    const leaseId = leaseIdRef.current ?? makeRuntimeSessionLeaseId(holder)
    leaseIdRef.current = leaseId
    let disposed = false
    let heartbeatTimer: number | undefined
    const heartbeat = async () => {
      try {
        await runtimeClient.ensureRunning()
        if (disposed) return
        await runtimeClient.acquireRuntimeSessionLease({
          leaseId,
          ttlMs: DEFAULT_SESSION_LEASE_TTL_MS,
          holder,
        })
      } catch {
        // The next visible runtime request will surface the error; lease heartbeat retries quietly.
      }
    }
    void heartbeat()
    heartbeatTimer = window.setInterval(() => void heartbeat(), DEFAULT_SESSION_LEASE_HEARTBEAT_MS)
    return () => {
      disposed = true
      if (heartbeatTimer) window.clearInterval(heartbeatTimer)
      void runtimeClient.releaseRuntimeSessionLease(leaseId).catch(() => undefined)
    }
  }, [enabled, holder, runtimeClient, trimmedSessionId])
}

function makeRuntimeSessionLeaseId(holder: string): string {
  const prefix = holder.trim().replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 48) || 'ui'
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

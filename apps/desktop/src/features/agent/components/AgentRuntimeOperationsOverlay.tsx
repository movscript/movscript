import { useEffect, useMemo, useState } from 'react'

import {
  subscribeCrossPageNotifications,
  type CrossPageNotificationEvent,
} from '@/shared/application/crossPageNotifications'
import {
  AgentRuntimeOperationsDialog,
} from '@/features/agent/components/AgentsPageParts'
import type { ClaudeRuntimeDownloadState } from '@/features/agent/application/useAgentsPageController'

interface TrayRuntimeOperationPayload {
  kind: 'agent-runtime-operation'
  key: string
  label: string
  packageName: string
  packageVersion?: string
  phase: ClaudeRuntimeDownloadState['phase']
  message?: string
}

export function AgentRuntimeOperationsOverlay() {
  const [operations, setOperations] = useState<Record<string, ClaudeRuntimeDownloadState>>({})

  useEffect(() => {
    return subscribeCrossPageNotifications((event) => {
      const payload = trayRuntimeOperationPayload(event)
      if (!payload) return
      setOperations((current) => ({
        ...current,
        [payload.key]: {
          phase: payload.phase,
          label: payload.label,
          packageName: payload.packageName,
          ...(payload.packageVersion ? { packageVersion: payload.packageVersion } : {}),
          ...(payload.message ? { message: payload.message } : {}),
        } as ClaudeRuntimeDownloadState,
      }))
    })
  }, [])

  const items = useMemo(() => Object.entries(operations).map(([id, state]) => ({
    id,
    state,
    onDismiss: state.phase === 'installing'
      ? undefined
      : () => setOperations((current) => {
        const next = { ...current }
        delete next[id]
        return next
      }),
  })), [operations])

  return <AgentRuntimeOperationsDialog items={items} runtimeLabel="Agent" />
}

function trayRuntimeOperationPayload(event: CrossPageNotificationEvent): TrayRuntimeOperationPayload | undefined {
  const payload = event.payload as Partial<TrayRuntimeOperationPayload> | undefined
  if (payload?.kind !== 'agent-runtime-operation') return undefined
  if (!payload.key || !payload.label || !payload.packageName || !payload.phase) return undefined
  if (payload.phase !== 'installing' && payload.phase !== 'success' && payload.phase !== 'error') return undefined
  return {
    kind: 'agent-runtime-operation',
    key: payload.key,
    label: payload.label,
    packageName: payload.packageName,
    ...(payload.packageVersion ? { packageVersion: payload.packageVersion } : {}),
    phase: payload.phase,
    ...(payload.message ? { message: payload.message } : {}),
  }
}

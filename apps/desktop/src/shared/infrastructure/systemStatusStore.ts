import { create } from 'zustand'

import { publishAppEvent } from '@/shared/application/appEvents'
import type { BackendBootStatus } from './backendBoot'

export type SystemConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'

export interface SystemStatusSnapshot {
  backend: BackendBootStatus | null
  systemMessages: {
    status: SystemConnectionStatus
    url?: string
    lastMessageAt?: string
    error?: string
  }
  auth: {
    sessionExpired: boolean
    expiredAt?: string
  }
  workspace: {
    lastUpdatedAt?: string
    projectId?: number
  }
}

interface SystemStatusStore extends SystemStatusSnapshot {
  setBackendStatus: (status: BackendBootStatus | null) => void
  setSystemMessagesStatus: (patch: Partial<SystemStatusSnapshot['systemMessages']>) => void
  markSystemMessageReceived: (at?: string) => void
  markAuthSessionExpired: (at?: string) => void
  markWorkspaceUpdated: (projectId?: number, at?: string) => void
  resetSystemStatus: () => void
}

const INITIAL_SYSTEM_STATUS: SystemStatusSnapshot = {
  backend: null,
  systemMessages: {
    status: 'idle',
  },
  auth: {
    sessionExpired: false,
  },
  workspace: {},
}

export const useSystemStatusStore = create<SystemStatusStore>((set, get) => ({
  ...INITIAL_SYSTEM_STATUS,
  setBackendStatus: (backend) => {
    set({ backend })
    publishSystemStatusChanged({ backend })
  },
  setSystemMessagesStatus: (patch) => {
    const systemMessages = { ...get().systemMessages, ...patch }
    set({ systemMessages })
    publishSystemStatusChanged({ systemMessages })
  },
  markSystemMessageReceived: (at = new Date().toISOString()) => {
    const systemMessages = { ...get().systemMessages, status: 'connected' as const, lastMessageAt: at }
    set({ systemMessages })
    publishSystemStatusChanged({ systemMessages })
  },
  markAuthSessionExpired: (at = new Date().toISOString()) => {
    const auth = { sessionExpired: true, expiredAt: at }
    set({ auth })
    publishSystemStatusChanged({ auth })
  },
  markWorkspaceUpdated: (projectId, at = new Date().toISOString()) => {
    const workspace = {
      lastUpdatedAt: at,
      ...(projectId !== undefined ? { projectId } : {}),
    }
    set({ workspace })
    publishSystemStatusChanged({ workspace })
  },
  resetSystemStatus: () => {
    set(INITIAL_SYSTEM_STATUS)
    publishSystemStatusChanged(INITIAL_SYSTEM_STATUS)
  },
}))

function publishSystemStatusChanged(payload: Partial<SystemStatusSnapshot>): void {
  publishAppEvent({
    topic: 'system.status.changed',
    scope: { kind: 'system' },
    source: 'system-status-store',
    payload,
  })
}

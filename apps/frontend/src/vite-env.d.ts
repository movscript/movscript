/// <reference types="vite/client" />

import type { AppSettings } from '@/lib/config'

type BackendStatus = {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

type MCPServerStatus = {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  error?: string
}

declare global {
  interface Window {
    api?: {
      openFile?: () => Promise<string | null>
      saveFile?: (defaultPath?: string) => Promise<string | null>
      updateMCPContext?: (snapshot: unknown) => Promise<void>
      getMCPStatus?: () => Promise<MCPServerStatus>
      setAppSettings?: (settings: AppSettings) => Promise<void>
      onBackendStatus?: (handler: (status: BackendStatus) => void) => () => void
      getBackendStatus?: () => Promise<BackendStatus>
      ensureAgentRuntime?: (input?: { baseURL?: string }) => Promise<{
        ok: boolean
        running: boolean
        managed: boolean
        started: boolean
        baseURL: string
        pid?: number
        error?: string
      }>
      onMCPOpenRoute?: (handler: (route: string) => void) => () => void
    }
  }
}

export {}

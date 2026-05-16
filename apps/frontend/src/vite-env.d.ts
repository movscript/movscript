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
      openAdminConsole?: (input?: { baseURL?: string; path?: string }) => Promise<{ url: string }>
      clipVideo?: (input: {
        sourceData?: ArrayBuffer | Uint8Array
        sourcePath?: string
        sourceName?: string
        startMs: number
        endMs: number
        outputName?: string
        mode?: 'fast' | 'accurate'
      }) => Promise<{
        ok: boolean
        outputPath?: string
        outputName?: string
        mode?: 'fast' | 'accurate'
        fallbackApplied?: boolean
        data?: Uint8Array
        size?: number
        mimeType?: string
        error?: string
        code?: string
      }>
      getVideoClipStatus?: () => Promise<{
        available: boolean
        path?: string
        version?: string
        error?: string
        expectedBundledPath?: string
        platform?: string
        arch?: string
      }>
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

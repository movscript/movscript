/// <reference types="vite/client" />

interface Window {
  api?: {
    openFile?: () => Promise<string | null>
    saveFile?: (defaultPath?: string) => Promise<string | null>
    updateMCPContext?: (snapshot: unknown) => Promise<void>
    ensureProductionRuntime?: (input?: { baseURL?: string }) => Promise<{
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

export type BackendLaunchPolicy = 'spawn' | 'external' | 'cloud' | 'disabled'

export type BackendStatusState = 'idle' | 'starting' | 'ready' | 'stopped' | 'error'

export interface BackendStatus {
  state: BackendStatusState
  baseURL: string
  pid?: number
  message?: string
  logPath?: string
  recentOutput?: string
}

export type BackendStatusListener = (status: BackendStatus) => void

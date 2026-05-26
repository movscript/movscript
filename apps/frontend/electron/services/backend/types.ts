export type BackendLaunchPolicy = 'external' | 'spawn' | 'cloud'

export interface BackendStatus {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

export type BackendStatusListener = (status: BackendStatus) => void

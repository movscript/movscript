export interface AppSettings {
  apiBaseURL: string
  launchMode: 'cloud' | 'local'
  workMode: 'detail' | 'agent'
  onboardingCompleted: boolean
  localDisplayName?: string
  shotLibrarySources?: ShotLibrarySourceConfig[]
  defaultShotLibrarySourceId?: string
}

export interface ShotLibrarySourceConfig {
  id: string
  name: string
  baseURL: string
  enabled?: boolean
  readOnly?: boolean
  authToken?: string
}

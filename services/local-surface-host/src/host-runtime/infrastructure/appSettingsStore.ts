import { create } from 'zustand'

export interface AppSettings {
  apiBaseURL?: string
  localAPIBaseURL?: string
  launchMode?: 'cloud' | 'local'
  workMode?: 'project' | 'tool' | 'agent'
  onboardingCompleted?: boolean
  shotLibrarySources?: Array<{
    id: string
    name: string
    baseURL: string
    enabled?: boolean
    readOnly?: boolean
    authToken?: string
  }>
}

interface AppSettingsStore {
  settings: AppSettings
  setWorkMode: (workMode: NonNullable<AppSettings['workMode']>) => void
}

export const useAppSettingsStore = create<AppSettingsStore>()((set) => ({
  settings: {
    apiBaseURL: '/local-api/data',
    localAPIBaseURL: '/local-api/data',
    launchMode: 'local',
    workMode: 'project',
    onboardingCompleted: true,
  },
  setWorkMode: (workMode) => set((state) => ({
    settings: {
      ...state.settings,
      workMode,
    },
  })),
}))

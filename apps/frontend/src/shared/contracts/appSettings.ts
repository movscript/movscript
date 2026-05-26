export interface AppSettings {
  apiBaseURL: string
  launchMode: 'cloud' | 'local'
  workMode: 'detail' | 'agent'
  onboardingCompleted: boolean
  localDisplayName?: string
}

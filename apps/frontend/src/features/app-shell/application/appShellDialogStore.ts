import { create } from 'zustand'

export type AccountSettingsDialogTab =
  | 'profile'
  | 'settings'
  | 'workspace'
  | 'agentConsole'
  | `runtime:${string}`

interface AppShellDialogStore {
  accountSettingsOpen: boolean
  accountSettingsTab: AccountSettingsDialogTab
  projectDialogOpen: boolean
  openAccountSettings: (tab?: AccountSettingsDialogTab) => void
  closeAccountSettings: () => void
  setAccountSettingsTab: (tab: AccountSettingsDialogTab) => void
  openProjectDialog: () => void
  closeProjectDialog: () => void
}

export const useAppShellDialogStore = create<AppShellDialogStore>((set) => ({
  accountSettingsOpen: false,
  accountSettingsTab: 'profile',
  projectDialogOpen: false,
  openAccountSettings: (tab = 'profile') => set({ accountSettingsOpen: true, accountSettingsTab: tab }),
  closeAccountSettings: () => set({ accountSettingsOpen: false }),
  setAccountSettingsTab: (tab) => set({ accountSettingsTab: tab }),
  openProjectDialog: () => set({ projectDialogOpen: true }),
  closeProjectDialog: () => set({ projectDialogOpen: false }),
}))

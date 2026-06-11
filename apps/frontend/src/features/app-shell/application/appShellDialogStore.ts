import { create } from 'zustand'

export type AccountSettingsDialogTab =
  | 'profile'
  | 'settings'
  | 'workspace'
  | `runtime:${string}`

interface AppShellDialogStore {
  projectDialogOpen: boolean
  openProjectDialog: () => void
  closeProjectDialog: () => void
}

export const useAppShellDialogStore = create<AppShellDialogStore>((set) => ({
  projectDialogOpen: false,
  openProjectDialog: () => set({ projectDialogOpen: true }),
  closeProjectDialog: () => set({ projectDialogOpen: false }),
}))

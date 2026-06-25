import { create } from 'zustand'

export type AccountSettingsDialogTab =
  | 'profile'
  | 'mode'
  | 'settings'
  | 'workspace'
  | `runtime:${string}`

export type ProjectDialogMode = 'create' | 'open'

interface AppShellDialogStore {
  projectDialogOpen: boolean
  projectDialogMode: ProjectDialogMode
  openProjectDialog: (mode?: ProjectDialogMode) => void
  closeProjectDialog: () => void
}

export const useAppShellDialogStore = create<AppShellDialogStore>((set) => ({
  projectDialogOpen: false,
  projectDialogMode: 'create',
  openProjectDialog: (mode = 'create') => set({ projectDialogOpen: true, projectDialogMode: mode }),
  closeProjectDialog: () => set({ projectDialogOpen: false }),
}))

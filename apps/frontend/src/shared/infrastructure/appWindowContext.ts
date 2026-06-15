import { create } from 'zustand'
import type {
  ElectronAppWindowContext,
  ElectronOpenProjectWindowInput,
} from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Project } from '@/types'

interface AppWindowContextStore {
  context: ElectronAppWindowContext | null
  hydrated: boolean
  setContext: (context: ElectronAppWindowContext | null) => void
}

export const useAppWindowContextStore = create<AppWindowContextStore>()((set) => ({
  context: null,
  hydrated: false,
  setContext: (context) => set({ context, hydrated: true }),
}))

export async function hydrateAppWindowContext(): Promise<ElectronAppWindowContext | null> {
  const api = readElectronApi()
  const context = await api?.getAppWindowContext?.() ?? null
  applyAppWindowContext(context)
  return context
}

export async function openHomeWindow(): Promise<void> {
  const api = readElectronApi()
  if (api?.openHomeWindow) {
    await api.openHomeWindow()
    return
  }
  window.location.assign('/')
}

export async function openAgentWindow(): Promise<void> {
  const api = readElectronApi()
  if (api?.openAgentWindow) {
    await api.openAgentWindow()
    return
  }
  window.location.assign('/project/agent')
}

export async function openProjectWindow(input: ElectronOpenProjectWindowInput): Promise<void> {
  const api = readElectronApi()
  if (api?.openProjectWindow) {
    await api.openProjectWindow(input)
    return
  }
  if (input.project) useProjectStore.getState().setCurrent(input.project as unknown as Project)
  useAppSettingsStore.getState().setWorkMode('project')
  window.location.assign(input.route ?? '/project')
}

function applyAppWindowContext(context: ElectronAppWindowContext | null): void {
  useAppWindowContextStore.getState().setContext(context)
  if (!context) return

  if (context.kind === 'project') {
    if (context.project) useProjectStore.getState().setCurrent(context.project as unknown as Project)
    useAppSettingsStore.getState().setWorkMode('project')
    return
  }

  if (context.kind === 'agent') {
    useAppSettingsStore.getState().setWorkMode('agent')
  }
}

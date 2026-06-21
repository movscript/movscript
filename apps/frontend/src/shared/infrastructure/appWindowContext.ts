import { create } from 'zustand'
import type {
  ElectronAppWindowContext,
  ElectronOpenCanvasWindowInput,
  ElectronOpenEditingProjectWindowInput,
  ElectronOpenProjectWindowInput,
  ElectronOpenToolWindowInput,
} from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { rememberLocalProject } from '@/shared/infrastructure/session/localProjectRecentsStore'
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
  if (!input.projectDir?.trim()) throw new Error('Project window requires projectDir')
  if (input.project && isLocalProject(input.project as unknown as Project)) {
    rememberLocalProject(input.project as unknown as Project)
  }
  const api = readElectronApi()
  if (api?.openProjectWindow) {
    await api.openProjectWindow(input)
    return
  }
  if (input.project) useProjectStore.getState().setCurrent(input.project as unknown as Project)
  useAppSettingsStore.getState().setWorkMode('project')
  window.location.assign(input.route ?? '/project')
}

export async function openEditingWindow(): Promise<void> {
  const api = readElectronApi()
  if (api?.openEditingWindow) {
    await api.openEditingWindow()
    return
  }
  useAppSettingsStore.getState().setWorkMode('tool')
  window.location.assign('/editing')
}

export async function openEditingProjectWindow(input: ElectronOpenEditingProjectWindowInput): Promise<void> {
  const api = readElectronApi()
  if (api?.openEditingProjectWindow) {
    await api.openEditingProjectWindow(input)
    return
  }
  useAppSettingsStore.getState().setWorkMode('tool')
  window.location.assign(input.route ?? `/editing/${encodeURIComponent(input.editingProjectId)}`)
}

export async function openCanvasWindow(input: ElectronOpenCanvasWindowInput = {}): Promise<void> {
  const api = readElectronApi()
  if (api?.openCanvasWindow) {
    await api.openCanvasWindow(input)
    return
  }
  useAppSettingsStore.getState().setWorkMode('tool')
  window.location.assign(input.route ?? (input.canvasId ? `/canvases/${encodeURIComponent(String(input.canvasId))}` : '/canvases'))
}

export async function openToolWindow(input: ElectronOpenToolWindowInput = {}): Promise<void> {
  const api = readElectronApi()
  if (api?.openToolWindow) {
    await api.openToolWindow(input)
    return
  }
  useAppSettingsStore.getState().setWorkMode('tool')
  window.location.assign(input.route ?? '/tools/ref-image-gen')
}

function applyAppWindowContext(context: ElectronAppWindowContext | null): void {
  useAppWindowContextStore.getState().setContext(context)
  if (!context) return

  if (context.kind === 'project') {
    const project = context.project
      ? context.project as unknown as Project
      : null
    if (project) {
      useProjectStore.getState().setCurrent(project)
      if (isLocalProject(project)) rememberLocalProject(project)
    }
    if (context.projectDir) useProjectStore.getState().setWorkspaceRoot(context.projectDir)
    useAppSettingsStore.getState().setWorkMode('project')
    return
  }

  if (context.kind === 'agent') {
    useAppSettingsStore.getState().setWorkMode('agent')
    return
  }

  if (context.kind === 'editingProject') {
    useAppSettingsStore.getState().setWorkMode('tool')
    return
  }

  if (context.kind === 'tool' || context.kind === 'canvas') {
    useAppSettingsStore.getState().setWorkMode('tool')
  }
}

function isLocalProject(project: Project): boolean {
  return project.local === true
}

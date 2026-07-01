import { create } from 'zustand'
import type {
  ElectronAppWindowContext,
  ElectronOpenCanvasWindowInput,
  ElectronOpenEditingProjectWindowInput,
  ElectronOpenProjectDataWindowInput,
  ElectronOpenProjectWindowInput,
  ElectronOpenSettingsWindowInput,
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
  const project = input.project
    ? projectWithWindowProjectDir(input.project as unknown as Project, input.projectDir)
    : null
  if (project && isLocalProject(project)) {
    rememberLocalProject(project)
  }
  const api = readElectronApi()
  if (api?.openProjectWindow) {
    await api.openProjectWindow(project ? { ...input, project } : input)
    return
  }
  if (project) useProjectStore.getState().setCurrent(project)
  useProjectStore.getState().setWorkspaceRoot(input.projectDir)
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
  window.location.assign(input.route ?? '/tools/image')
}

export async function openProjectDataWindow(input: ElectronOpenProjectDataWindowInput = {}): Promise<void> {
  const api = readElectronApi()
  if (api?.openProjectDataWindow) {
    await api.openProjectDataWindow(input)
    return
  }
  window.location.assign(input.route ?? '/project-data')
}

export async function openSettingsWindow(input: ElectronOpenSettingsWindowInput = {}): Promise<void> {
  const api = readElectronApi()
  if (api?.openSettingsWindow) {
    await api.openSettingsWindow(input)
    return
  }
  window.location.assign(input.route ?? '/app/settings')
}

function applyAppWindowContext(context: ElectronAppWindowContext | null): void {
  useAppWindowContextStore.getState().setContext(context)
  if (!context) return

  if (context.kind === 'project') {
    const project = context.project
      ? projectWithWindowProjectDir(context.project as unknown as Project, context.projectDir)
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

function projectWithWindowProjectDir(project: Project, projectDir: string | undefined): Project {
  const normalizedProjectDir = projectDir?.trim()
  if (!normalizedProjectDir) return project
  return {
    ...project,
    workspace_path: normalizedProjectDir,
    project_path: normalizedProjectDir,
    local: true,
  }
}

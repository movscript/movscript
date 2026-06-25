import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent, publishWindowEvent } from '@/shared/infrastructure/windowEvents'

const EDITING_PROJECT_REGISTRY_KEY = 'movscript.editing-projects.v1'
const EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY = 'movscript-editing-projects-v1'
const EDITING_PROJECT_REGISTRY_CHANGED_EVENT = 'movscript:editing-projects-changed'
const EDITING_PROJECT_REGISTRY_LIMIT = 20

export type EditingProjectSummary = {
  id: string
  projectId: string
  title: string
  updatedAt: string
  projectPath?: string
  snapshot?: ElectronMediaPipelineEditingProject
}

let editingProjectRegistryCache: EditingProjectSummary[] | null = null
let editingProjectRegistryHydrationStarted = false
let editingProjectRegistryVersion = 0

export function readEditingProjectRegistry(): EditingProjectSummary[] {
  if (typeof window === 'undefined') return []
  hydrateEditingProjectRegistry()
  return editingProjectRegistryCache ?? readBrowserEditingProjectRegistry()
}

export function writeEditingProjectRegistry(projects: EditingProjectSummary[]): void {
  if (typeof window === 'undefined') return
  const nextProjects = projects
    .map(normalizeEditingProjectSummary)
    .filter(isEditingProjectSummary)
    .slice(0, EDITING_PROJECT_REGISTRY_LIMIT)
  editingProjectRegistryCache = nextProjects
  editingProjectRegistryVersion += 1
  persistEditingProjectRegistry(nextProjects)
  dispatchEditingProjectRegistryChanged()
}

export function upsertEditingProjectSummary(
  projects: EditingProjectSummary[],
  project: EditingProjectSummary,
): EditingProjectSummary[] {
  return [project, ...projects.filter((candidate) => candidate.id !== project.id)].slice(0, EDITING_PROJECT_REGISTRY_LIMIT)
}

export function subscribeEditingProjectRegistry(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handleStorage = (event: StorageEvent) => {
    if (event.key === EDITING_PROJECT_REGISTRY_KEY) {
      editingProjectRegistryCache = readBrowserEditingProjectRegistry()
      listener()
    }
  }
  const unsubscribeRegistryChanged = listenToWindowEvent(EDITING_PROJECT_REGISTRY_CHANGED_EVENT, listener)
  const unsubscribeStorage = listenToWindowEvent('storage', handleStorage)
  return () => {
    unsubscribeRegistryChanged()
    unsubscribeStorage()
  }
}

export function editingProjectRegistrySnapshot(): string {
  if (typeof window === 'undefined') return '[]'
  hydrateEditingProjectRegistry()
  return JSON.stringify(editingProjectRegistryCache ?? readBrowserEditingProjectRegistry())
}

function hydrateEditingProjectRegistry(): void {
  if (editingProjectRegistryHydrationStarted) return
  editingProjectRegistryHydrationStarted = true
  editingProjectRegistryCache = readBrowserEditingProjectRegistry()
  const hydrationVersion = editingProjectRegistryVersion
  const api = readElectronApi()
  if (!api?.getDesktopState) return
  void api.getDesktopState({ key: EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY }).then((result) => {
    if (editingProjectRegistryVersion !== hydrationVersion) return
    if (typeof result.value === 'string') {
      editingProjectRegistryCache = parseEditingProjectRegistry(result.value)
      removeBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY)
      dispatchEditingProjectRegistryChanged()
      return
    }
    const legacy = readBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY)
    if (legacy !== null && api.setDesktopState) {
      void api.setDesktopState({ key: EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY, value: legacy })
        .then(() => removeBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY))
        .catch(() => undefined)
    }
  }).catch(() => undefined)
}

function readBrowserEditingProjectRegistry(): EditingProjectSummary[] {
  try {
    return parseEditingProjectRegistry(readBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function persistEditingProjectRegistry(projects: EditingProjectSummary[]): void {
  const serialized = JSON.stringify(projects)
  const api = readElectronApi()
  if (api?.setDesktopState) {
    void api.setDesktopState({ key: EDITING_PROJECT_REGISTRY_DESKTOP_STATE_KEY, value: serialized })
      .then(() => removeBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY))
      .catch(() => writeBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY, serialized))
    return
  }
  writeBrowserStorageItem('local', EDITING_PROJECT_REGISTRY_KEY, serialized)
}

function parseEditingProjectRegistry(raw: string): EditingProjectSummary[] {
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed)
    ? parsed.map(normalizeEditingProjectSummary).filter(isEditingProjectSummary).slice(0, EDITING_PROJECT_REGISTRY_LIMIT)
    : []
}

function dispatchEditingProjectRegistryChanged(): void {
  if (typeof window === 'undefined') return
  publishWindowEvent(new Event(EDITING_PROJECT_REGISTRY_CHANGED_EVENT))
}

function normalizeEditingProjectSummary(value: unknown): EditingProjectSummary | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<EditingProjectSummary>
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.title !== 'string'
  ) {
    return null
  }
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    title: candidate.title,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    ...(typeof candidate.projectPath === 'string' ? { projectPath: candidate.projectPath } : {}),
    ...(candidate.snapshot ? { snapshot: candidate.snapshot } : {}),
  }
}

function isEditingProjectSummary(value: EditingProjectSummary | null): value is EditingProjectSummary {
  return Boolean(value)
}

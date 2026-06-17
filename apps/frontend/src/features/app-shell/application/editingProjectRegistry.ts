import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'

const EDITING_PROJECT_REGISTRY_KEY = 'movscript.editing-projects.v1'
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

export function readEditingProjectRegistry(): EditingProjectSummary[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EDITING_PROJECT_REGISTRY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(normalizeEditingProjectSummary).filter(isEditingProjectSummary) : []
  } catch {
    return []
  }
}

export function writeEditingProjectRegistry(projects: EditingProjectSummary[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(EDITING_PROJECT_REGISTRY_KEY, JSON.stringify(projects.slice(0, EDITING_PROJECT_REGISTRY_LIMIT)))
  window.dispatchEvent(new Event(EDITING_PROJECT_REGISTRY_CHANGED_EVENT))
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
    if (event.key === EDITING_PROJECT_REGISTRY_KEY) listener()
  }
  window.addEventListener(EDITING_PROJECT_REGISTRY_CHANGED_EVENT, listener)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(EDITING_PROJECT_REGISTRY_CHANGED_EVENT, listener)
    window.removeEventListener('storage', handleStorage)
  }
}

export function editingProjectRegistrySnapshot(): string {
  if (typeof window === 'undefined') return '[]'
  return window.localStorage.getItem(EDITING_PROJECT_REGISTRY_KEY) ?? '[]'
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

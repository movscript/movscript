import { create } from 'zustand'

import type { Project } from '@movscript/shared'

interface ProjectStore {
  current: Project | null
  currentProjectId: number | null
  setCurrent: (project: Project | null) => void
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  current: projectFromLocation(),
  currentProjectId: projectFromLocation()?.ID ?? null,
  setCurrent: (project) => set({
    current: project,
    currentProjectId: project?.ID ?? null,
  }),
}))

function projectFromLocation(): Project | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const rawProjectId = params.get('projectId') ?? params.get('project_id')
  const projectId = Number(rawProjectId)
  if (!Number.isInteger(projectId) || projectId <= 0) return null
  const name = params.get('projectName') ?? params.get('project_name') ?? `Project ${projectId}`
  const projectPath = params.get('projectDir') ?? params.get('projectPath') ?? undefined
  const now = new Date(0).toISOString()
  return {
    ID: projectId,
    name,
    description: '',
    owner_id: 0,
    ...(projectPath ? { workspace_path: projectPath, project_path: projectPath, local: true } : {}),
    CreatedAt: now,
    UpdatedAt: now,
  }
}

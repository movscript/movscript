import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  editingProjectRegistrySnapshot,
  readEditingProjectRegistry,
  subscribeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@/features/app-shell/application/editingProjectRegistry'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import { projectKeys } from '@/features/project/application/projectQueries'
import { api } from '@/shared/infrastructure/api'
import { mergeRecentProjects, useLocalProjectRecentsStore } from '@/shared/infrastructure/session/localProjectRecentsStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Canvas, Project } from '@/types'

const DEFAULT_RECENT_SHORTCUT_LIMIT = 5

export type EditingProjectShortcut = Pick<EditingProjectSummary, 'id' | 'projectId' | 'title' | 'updatedAt'>

export function useAppShortcutRecentItems(limit = DEFAULT_RECENT_SHORTCUT_LIMIT) {
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const localRecentProjects = useLocalProjectRecentsStore((s) => s.projects)
  const dismissedProjectKeys = useLocalProjectRecentsStore((s) => s.dismissedKeys)
  const editingProjectRegistryVersion = useSyncExternalStore(
    subscribeEditingProjectRegistry,
    editingProjectRegistrySnapshot,
    () => '[]',
  )
  const projectsQuery = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: canvasKeys.list(undefined),
    queryFn: () => api.get('/canvases').then((response) => response.data),
  })
  const recentProjects = useMemo(() => {
    return mergeRecentProjects(projectsQuery.data ?? [], localRecentProjects, dismissedProjectKeys).slice(0, limit)
  }, [dismissedProjectKeys, limit, localRecentProjects, projectsQuery.data])
  const recentCanvases = useMemo(() => {
    return sortRecentCanvases(canvasesQuery.data ?? []).slice(0, limit)
  }, [canvasesQuery.data, limit])
  const recentEditingProjects = useMemo(() => {
    return readRecentEditingProjectShortcuts(limit)
  }, [editingProjectRegistryVersion, limit])

  return {
    projectsQuery,
    canvasesQuery,
    recentProjects,
    recentCanvases,
    recentEditingProjects,
  }
}

export function readRecentEditingProjectShortcuts(limit = DEFAULT_RECENT_SHORTCUT_LIMIT): EditingProjectShortcut[] {
  return sortRecentEditingProjects(readEditingProjectRegistry()).slice(0, limit)
}

export function sortRecentProjects(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => timestampForProject(right) - timestampForProject(left))
}

export function sortRecentCanvases(canvases: Canvas[]): Canvas[] {
  return [...canvases].sort((left, right) => timestampForCanvas(right) - timestampForCanvas(left))
}

export function sortRecentEditingProjects(projects: EditingProjectShortcut[]): EditingProjectShortcut[] {
  return [...projects].sort((left, right) => timestampForIso(right.updatedAt) - timestampForIso(left.updatedAt))
}

function timestampForProject(project: Project) {
  return timestampForIso(project.UpdatedAt || project.CreatedAt)
}

function timestampForCanvas(canvas: Canvas) {
  const candidate = canvas as Canvas & { UpdatedAt?: string; CreatedAt?: string; updated_at?: string; created_at?: string }
  return timestampForIso(candidate.UpdatedAt ?? candidate.updated_at ?? candidate.CreatedAt ?? candidate.created_at)
    || canvas.ID
}

function timestampForIso(value: string | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

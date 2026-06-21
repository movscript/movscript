import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppShortcutRecentItems } from '@/features/app-shell/application/appShortcutRecentItems'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ElectronDockShortcutProject, ElectronDockShortcutSnapshot } from '@/shared/contracts/electronApi'

export function AppDockShortcutBridge() {
  const { pathname, search } = useLocation()
  const { recentProjects, recentCanvases, recentEditingProjects } = useAppShortcutRecentItems(5)

  useEffect(() => {
    const electronAPI = readElectronApi()
    if (!electronAPI?.updateAppWindowRouteContext) return
    void electronAPI.updateAppWindowRouteContext({ route: pathname, search })
  }, [pathname, search])

  useEffect(() => {
    const electronAPI = readElectronApi()
    if (!electronAPI?.updateDockShortcutMenu) return
    const projects = recentProjects.map<ElectronDockShortcutProject | null>((project) => {
      const projectDir = project.workspace_path || project.project_path
      if (!projectDir) return null
      const updatedAt = project.UpdatedAt || project.CreatedAt || undefined
      return {
        id: project.ID,
        name: project.name,
        projectDir,
        updatedAt,
        project,
      }
    }).filter((project): project is ElectronDockShortcutProject => Boolean(project))
    const snapshot: ElectronDockShortcutSnapshot = {
      projects,
      editingProjects: recentEditingProjects.map((project) => ({
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt,
      })),
      canvases: recentCanvases.map((canvas) => ({
        id: canvas.ID,
        name: canvas.name,
      })),
    }
    void electronAPI.updateDockShortcutMenu(snapshot)
  }, [recentCanvases, recentEditingProjects, recentProjects])

  return null
}

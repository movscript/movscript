import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppShortcutRecentItems } from '@/features/app-shell/application/appShortcutRecentItems'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ElectronDockShortcutSnapshot } from '@/shared/contracts/electronApi'

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
    const snapshot: ElectronDockShortcutSnapshot = {
      projects: recentProjects.map((project) => ({
        id: project.ID,
        name: project.name,
        updatedAt: project.UpdatedAt || project.CreatedAt,
        project,
      })),
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

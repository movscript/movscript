import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useAppShortcutRecentItems } from '@/features/app-shell/application/appShortcutRecentItems'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ElectronDockShortcutProject, ElectronDockShortcutSnapshot } from '@/shared/contracts/electronApi'

export function AppDockShortcutBridge() {
  const { t, i18n } = useTranslation()
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
      labels: {
        appHome: t('sidebar.shortcuts.appHome'),
        toolHome: t('sidebar.shortcuts.toolHome'),
        editHome: t('sidebar.shortcuts.editHome'),
        canvasHome: t('sidebar.shortcuts.canvasHome'),
        recentProjects: t('sidebar.shortcuts.recentProjects'),
        recentEditingProjects: t('sidebar.shortcuts.recentEditingProjects'),
        recentCanvases: t('sidebar.shortcuts.recentCanvases'),
        emptyRecent: t('sidebar.shortcuts.emptyRecentProjects'),
      },
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
  }, [i18n.resolvedLanguage, recentCanvases, recentEditingProjects, recentProjects, t])

  return null
}

import { canvasEditorPath, editingProjectPath } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openCanvasWindow, openEditingProjectWindow, openEditingWindow, openHomeWindow, openProjectWindow, openToolWindow } from '@/shared/infrastructure/appWindowContext'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Canvas, Project } from '@/types'
import type { EditingProjectShortcut } from './appShortcutRecentItems'

export function useAppShortcutOpenCommands() {
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)

  return {
    openAppHome: () => {
      void openHomeWindow()
    },
    openToolHome: () => {
      setWorkMode('tool')
      void openToolWindow({ route: ROUTES.tools.image })
    },
    openEditHome: () => {
      setWorkMode('tool')
      void openEditingWindow()
    },
    openCanvasHome: () => {
      setWorkMode('tool')
      void openCanvasWindow()
    },
    openProject: (project: Project) => {
      const projectDir = project.workspace_path || project.project_path
      if (!projectDir) return
      setCurrentProject(project)
      setWorkMode('project')
      void openProjectWindow({ projectDir, project, route: ROUTES.project.home })
    },
    openEditingProject: (project: EditingProjectShortcut) => {
      setWorkMode('tool')
      void openEditingProjectWindow({
        editingProjectId: project.id,
        title: project.title,
        route: editingProjectPath(project.id),
      })
    },
    openCanvas: (canvas: Canvas) => {
      setWorkMode('tool')
      void openCanvasWindow({ canvasId: canvas.ID, route: canvasEditorPath(canvas.ID, { source: 'tool' }) })
    },
  }
}

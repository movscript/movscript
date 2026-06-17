import { useNavigate } from 'react-router-dom'
import { canvasEditorPath, editingProjectPath } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openCanvasWindow, openEditingProjectWindow, openEditingWindow, openHomeWindow, openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Canvas, Project } from '@/types'
import type { EditingProjectShortcut } from './appShortcutRecentItems'

export function useAppShortcutOpenCommands() {
  const navigate = useNavigate()
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)

  return {
    openAppHome: () => {
      void openHomeWindow()
    },
    openToolHome: () => {
      setWorkMode('tool')
      navigate(ROUTES.tools.refImageGen)
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
      setCurrentProject(project)
      setWorkMode('project')
      void openProjectWindow({ projectId: project.ID, project, route: ROUTES.project.home })
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

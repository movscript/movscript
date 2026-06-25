import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  attachWorkspaceChangeHandoffDomBridge,
  subscribeApiRedirect,
  subscribeWorkspaceChangeHandoff,
} from '@/shared/application/navigationEvents'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useLastWorkspaceStore } from '@/shared/infrastructure/session/lastWorkspaceStore'
import { ROUTES } from '@/routes/projectRoutes'

export function GlobalNavigationEffects() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const currentProject = useProjectStore((state) => state.current)
  const rememberProjectRoute = useLastWorkspaceStore((state) => state.rememberProjectRoute)

  useEffect(() => {
    const detachWorkspaceDomBridge = attachWorkspaceChangeHandoffDomBridge()
    const unsubscribeApiRedirect = subscribeApiRedirect((path) => {
      navigate(path, { replace: true })
    })
    const unsubscribeWorkspaceHandoff = subscribeWorkspaceChangeHandoff((path) => {
      navigate(path)
    })
    return () => {
      detachWorkspaceDomBridge()
      unsubscribeApiRedirect()
      unsubscribeWorkspaceHandoff()
    }
  }, [navigate])

  useEffect(() => {
    if (!currentProject?.ID || !pathname.startsWith(ROUTES.project.root)) return
    rememberProjectRoute({
      projectId: currentProject.ID,
      project: currentProject,
      route: pathname,
      search,
    })
  }, [currentProject, pathname, rememberProjectRoute, search])

  return null
}

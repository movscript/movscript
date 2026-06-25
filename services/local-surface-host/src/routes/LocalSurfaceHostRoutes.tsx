import React, { useEffect, useMemo } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CanvasEditorPage, CanvasListPage } from '@movscript/canvas-surface/pages'
import { EditingListSurfaceRoute, EditingWorkspaceSurfaceRoute } from '@movscript/editing-surface/surface-routes'
import { ProjectsPage } from '@movscript/project-surface/pages'
import { useTranslation } from 'react-i18next'
import {
  LocalExternalResourcesPageRoute,
  LocalResourcesPageRoute,
} from '../adapters/resourcePageRoutes.js'
import {
  LocalAgentResourceDetailRoute,
  LocalAgentResourceLibraryRoute,
} from '../adapters/resourceSurfaceRoutes.js'
import { ensureLocalEditingAPI } from '../editing/localEditingApi.js'
import {
  LocalSurfaceHostHome,
  LocalSurfaceNotFound,
} from '../home/LocalSurfaceHostHome.js'
import { ProjectSurfaceHostRoute } from '../project/LocalProjectSurfaceHostRoute.js'
import { ROUTES } from './projectRoutes.js'
import { LocalSurfaceAppChrome } from '../shell/LocalSurfaceAppChrome.js'

export function LocalSurfaceHostRoutes() {
  const location = useLocation()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])

  useEffect(() => {
    ensureLocalEditingAPI(query)
  }, [query])

  return (
    <Routes>
      <Route path={ROUTES.root} element={<LocalSurfaceHostHome pathname={location.pathname} query={query} />} />
      <Route path={ROUTES.canvases} element={<CanvasListPage />} />
      <Route path={ROUTES.canvasEditor} element={<CanvasEditorPage />} />
      <Route path={ROUTES.editing} element={<EditingListSurfaceRoute />} />
      <Route path={ROUTES.editingProject} element={<EditingWorkspaceSurfaceRoute />} />
      <Route
        path={ROUTES.projects}
        element={(
          <LocalSurfaceAppChrome
            title="Projects"
            description="Local MovScript projects"
            query={query}
          >
            <ProjectsPage />
          </LocalSurfaceAppChrome>
        )}
      />
      <Route path={ROUTES.resources} element={<LocalSurfaceRouteFrame><LocalResourcesPageRoute /></LocalSurfaceRouteFrame>} />
      <Route path={ROUTES.externalResources} element={<LocalSurfaceRouteFrame><LocalExternalResourcesPageRoute /></LocalSurfaceRouteFrame>} />
      <Route path={ROUTES.agentResources} element={<LocalAgentResourceLibraryRoute />} />
      <Route path={ROUTES.agentResourceDetail} element={<LocalAgentResourceDetailRoute />} />
      <Route path={ROUTES.studioProject} element={<ProjectSurfaceHostRoute />} />
      <Route path="*" element={<LocalSurfaceNotFound pathname={location.pathname} query={query} />} />
    </Routes>
  )
}

function LocalSurfaceRouteFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <React.Suspense fallback={<main className="surface-host-admin-loading">{t('localSurfaceHost.chrome.loadingSurface')}</main>}>
      {children}
    </React.Suspense>
  )
}

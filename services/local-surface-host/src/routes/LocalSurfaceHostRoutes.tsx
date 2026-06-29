import React, { useEffect, useMemo } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CanvasEditorPage, CanvasListPage } from '@movscript/canvas-surface/pages'
import EditingListPage from '@movscript/editing-surface/pages/EditingListPage'
import { EditingWorkspaceSurfaceRoute } from '@movscript/editing-surface/surface-routes'
import { JobsPage } from '@movscript/jobs-surface/pages'
import { ProjectsPage } from '@movscript/project-surface/pages'
import { ShotLibraryPage } from '@movscript/shot-library-surface/pages'
import { AlertTriangle } from 'lucide-react'
import { AppErrorFallback } from '@movscript/ui/business/app'
import { AppContentLayout } from '@movscript/ui/layout'
import { sharedSurfaceRouteForPathname } from '@movscript/shared'
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
  LocalSurfaceToolHome,
  LocalSurfaceToolFrame,
  LocalSurfaceNotFound,
} from '../home/LocalSurfaceHostHome.js'
import { ProjectSurfaceHostRoute } from '../project/LocalProjectSurfaceHostRoute.js'
import { ROUTES } from './projectRoutes.js'
import { LocalSurfaceAppChrome } from '../shell/LocalSurfaceAppChrome.js'
import { hrefWithSearch } from './localRouteLinks.js'
import { localSurfaceRouteFrameOptions } from './localSurfaceRouteFrame.js'

export function LocalSurfaceHostRoutes() {
  const location = useLocation()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])

  useEffect(() => {
    ensureLocalEditingAPI(query)
  }, [query])

  return (
    <Routes>
      <Route path={ROUTES.root} element={<LocalSurfaceHostHome pathname={location.pathname} query={query} />} />
      <Route path={ROUTES.toolHome} element={<LocalSurfaceToolHome query={query} />} />
      <Route path={ROUTES.canvases} element={<LocalModeSurfaceRoute query={query} titleKey="localSurfaceHost.homes.canvas.title" descriptionKey="localSurfaceHost.homes.canvas.description"><CanvasListPage /></LocalModeSurfaceRoute>} />
      <Route
        path={ROUTES.canvasEditor}
        element={(
          <LocalSurfaceRouteFrame>
            <CanvasEditorPage />
          </LocalSurfaceRouteFrame>
        )}
      />
      <Route path={ROUTES.editing} element={<LocalModeSurfaceRoute query={query} titleKey="localSurfaceHost.homes.edit.title" descriptionKey="localSurfaceHost.homes.edit.description"><EditingListPage /></LocalModeSurfaceRoute>} />
      <Route path={ROUTES.editingProject} element={<LocalModeSurfaceRoute query={query} titleKey="localSurfaceHost.homes.edit.title" descriptionKey="localSurfaceHost.homes.edit.description"><EditingWorkspaceSurfaceRoute /></LocalModeSurfaceRoute>} />
      <Route path={ROUTES.shotLibrary} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.shotLibrary.title" descriptionKey="localSurfaceHost.homes.shotLibrary.description"><ShotLibraryPage /></LocalToolSurfaceRoute>} />
      <Route path={ROUTES.jobs} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.jobs.title" descriptionKey="localSurfaceHost.homes.jobs.description"><JobsPage /></LocalToolSurfaceRoute>} />
      <Route path={ROUTES.toolRoute} element={<LocalToolRouteLanding query={query} />} />
      <Route
        path={ROUTES.projects}
        element={(
          <LocalModeSurfaceRoute
            titleKey="localSurfaceHost.homes.projectsTitle"
            descriptionKey="localSurfaceHost.homes.projectsDescription"
            query={query}
          >
            <ProjectsPage />
          </LocalModeSurfaceRoute>
        )}
      />
      <Route path={ROUTES.resources} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.resource.title" descriptionKey="localSurfaceHost.homes.resource.description"><LocalResourcesPageRoute /></LocalToolSurfaceRoute>} />
      <Route path={ROUTES.externalResources} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.external.title" descriptionKey="localSurfaceHost.homes.external.description"><LocalExternalResourcesPageRoute /></LocalToolSurfaceRoute>} />
      <Route path={ROUTES.agentResources} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.agentResources.title" descriptionKey="localSurfaceHost.homes.agentResources.description"><LocalAgentResourceLibraryRoute /></LocalToolSurfaceRoute>} />
      <Route path={ROUTES.agentResourceDetail} element={<LocalToolSurfaceRoute query={query} titleKey="localSurfaceHost.homes.agentResources.title" descriptionKey="localSurfaceHost.homes.agentResources.description"><LocalAgentResourceDetailRoute /></LocalToolSurfaceRoute>} />
      <Route path="/admin/*" element={<LocalAdminDocumentRoute />} />
      <Route path={ROUTES.studioProject} element={<ProjectSurfaceHostRoute />} />
      <Route path="*" element={<LocalSurfaceNotFound pathname={location.pathname} query={query} />} />
    </Routes>
  )
}

function LocalModeSurfaceRoute({
  query,
  titleKey,
  descriptionKey,
  children,
}: {
  query: URLSearchParams
  titleKey: string
  descriptionKey: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <LocalSurfaceAppChrome
      query={query}
      title={t(titleKey)}
      description={t(descriptionKey)}
    >
      <LocalSurfaceRouteFrame>
        {children}
      </LocalSurfaceRouteFrame>
    </LocalSurfaceAppChrome>
  )
}

function LocalToolSurfaceRoute({
  query,
  titleKey,
  descriptionKey,
  children,
}: {
  query: URLSearchParams
  titleKey: string
  descriptionKey: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <LocalSurfaceToolFrame
      query={query}
      title={t(titleKey)}
      description={t(descriptionKey)}
    >
      <LocalSurfaceRouteFrame>
        {children}
      </LocalSurfaceRouteFrame>
    </LocalSurfaceToolFrame>
  )
}

function LocalAdminDocumentRoute() {
  const location = useLocation()

  useEffect(() => {
    window.location.assign(`${location.pathname}${location.search}${location.hash}`)
  }, [location.hash, location.pathname, location.search])

  return (
    <div className="local-surface-route-frame local-surface-route-frame--flush">
      <main className="surface-host-admin-loading" />
    </div>
  )
}

function LocalToolRouteLanding({ query }: { query: URLSearchParams }) {
  const { t } = useTranslation()
  return (
    <LocalSurfaceToolFrame query={query}>
      <main className="surface-host-tool-route-landing">
        <span className="surface-host-tool-route-landing__mark">{t('localSurfaceHost.toolHome.title')}</span>
        <h1>{t('localSurfaceHost.toolHome.toolRouteTitle')}</h1>
        <p>{t('localSurfaceHost.toolHome.toolRouteDescription')}</p>
        <a className="surface-host-secondary-action" href={hrefWithSearch(ROUTES.toolHome, query)}>
          {t('localSurfaceHost.notFound.backHome')}
        </a>
      </main>
    </LocalSurfaceToolFrame>
  )
}

function LocalSurfaceRouteFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const sharedRoute = sharedSurfaceRouteForPathname(location.pathname, { host: 'local-web' })
  const frameOptions = localSurfaceRouteFrameOptions(sharedRoute)
  if (frameOptions.variant === 'flush') {
    return (
      <React.Suspense fallback={<main className="surface-host-admin-loading">{t('localSurfaceHost.chrome.loadingSurface')}</main>}>
        <div className={frameOptions.className}>
          <LocalSurfaceRouteErrorBoundary>
            {children}
          </LocalSurfaceRouteErrorBoundary>
        </div>
      </React.Suspense>
    )
  }

  const { content: contentOptions } = frameOptions
  return (
    <React.Suspense fallback={<main className="surface-host-admin-loading">{t('localSurfaceHost.chrome.loadingSurface')}</main>}>
      <AppContentLayout
        className={frameOptions.className}
        contentClassName={contentOptions.contentClassName}
        variant={contentOptions.layoutVariant}
        width={contentOptions.width}
        padding={contentOptions.padding}
      >
        <LocalSurfaceRouteErrorBoundary>
          {children}
        </LocalSurfaceRouteErrorBoundary>
      </AppContentLayout>
    </React.Suspense>
  )
}

interface LocalSurfaceRouteErrorBoundaryState {
  error: Error | null
}

class LocalSurfaceRouteErrorBoundaryBase extends React.Component<{
  children: React.ReactNode
  retryLabel: string
  title: string
}, LocalSurfaceRouteErrorBoundaryState> {
  state: LocalSurfaceRouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): LocalSurfaceRouteErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <AppErrorFallback
          icon={<AlertTriangle size={20} />}
          title={this.props.title}
          message={this.state.error.message}
          retryLabel={this.props.retryLabel}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

function LocalSurfaceRouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  return (
    <LocalSurfaceRouteErrorBoundaryBase
      key={location.pathname}
      title={t('localSurfaceHost.chrome.routeErrorTitle')}
      retryLabel={t('common.retry')}
    >
      {children}
    </LocalSurfaceRouteErrorBoundaryBase>
  )
}

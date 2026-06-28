import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { adminSurfacePath } from '@movscript/admin-surface'
import {
  PROJECT_SURFACE_ROUTE_DEFINITIONS,
} from '@movscript/project-surface'
import {
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
  ProjectSurfaceProvider,
  ProjectSurfaceRouteView,
  useProjectSurfaceRuntime,
} from '@movscript/project-surface/react'
import '@movscript/theme/theme.css'
import '@movscript/ui/styles/base.css'
import '@movscript/ui/styles/primitives.css'
import '@movscript/ui/styles/semantic.css'
import '@movscript/ui/styles/layout.css'
import './styles.css'
import { createWebHostProjectSurfaceRuntime } from './projectSurfaceRuntime.js'
import { projectRouteContext } from './projectSurfaceRouting.js'

if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) {
  void import('@movscript/admin-surface/app')
} else {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <WebSurfaceHostApp />
    </React.StrictMode>,
  )
}

function WebSurfaceHostApp() {
  const pathname = window.location.pathname
  const query = useMemo(() => new URLSearchParams(window.location.search), [window.location.search])
  const routeContext = projectRouteContext(pathname, query)
  const runtime = useMemo(() => createWebHostProjectSurfaceRuntime({
    projectId: routeContext.projectId,
    projectUid: query.get('projectUid') ?? undefined,
    mcpApiBaseURL: query.get('mcpApiBaseURL') ?? undefined,
    search: query,
  }), [routeContext.projectId, query])

  const content = routeContext.route ? (
    <ProjectSurfaceRouteView
      route={routeContext.route}
      params={query}
      productionId={routeContext.productionId}
      readModelStatus="idle"
    />
  ) : (
    <WebSurfaceHostHome
      pathname={pathname}
      profile={query.get('profile') ?? 'web'}
      source={query.get('source') ? `source: ${query.get('source')}` : 'source: direct'}
    />
  )

  return (
    <ProjectSurfaceProvider runtime={runtime}>
      {content}
    </ProjectSurfaceProvider>
  )
}

function WebSurfaceHostHome({
  pathname,
  profile,
  source,
}: {
  pathname: string
  profile: string
  source: string
}) {
  const runtime = useProjectSurfaceRuntime()

  return (
    <AgentSurfaceShell
      title="MovScript Web Surface Host"
      description="Cloud/browser host for Project Surface routes and remote collaboration."
      ready
      chips={[
        'service: movscript.web-surface.host',
        'host: web',
        source,
      ]}
    >
      <div className="surface-host-grid">
        <AgentSurfacePanel title="Runtime">
          <AgentSurfaceKeyValues items={[
            ['Path', pathname],
            ['Project ID', runtime.project.projectId],
            ['Profile', profile],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Studio Routes" description="Web host resolves /studio routes for browser and cloud deployments.">
          <div className="surface-host-route-list">
            {PROJECT_SURFACE_ROUTE_DEFINITIONS.map((route) => (
              <AgentSurfaceLink key={route.path} href={runtime.navigator.href(route.key)}>{route.label}</AgentSurfaceLink>
            ))}
          </div>
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Admin Surface" description="Cloud admin routes can be mounted when the browser session has management capabilities.">
          <AgentSurfaceLink href={adminSurfacePath('overview')}>Admin overview</AgentSurfaceLink>
        </AgentSurfacePanel>
      </div>
    </AgentSurfaceShell>
  )
}

import { recordValue } from '../../data.js'
import {
  PROJECT_SURFACE_ROUTE_DEFINITIONS,
  type ProjectSurfaceRouteDefinition,
} from '../../domain/index.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'
import { ProjectProgressSurface } from '../progress/ProjectProgressSurface.js'
import { ProjectOverviewSurface } from '../overview/ProjectOverviewSurface.js'
import { ProjectSettingsSurface } from '../settings/ProjectSettingsSurface.js'
import { ProjectResourceViewSurface } from '../resource-view/ProjectResourceViewSurface.js'
import { ProjectRemotionStudioSurface } from '../remotion/ProjectRemotionStudioSurface.js'
import { ProjectScriptsSurface } from '../scripts/ProjectScriptsSurface.js'
import { ProjectStandardsSurface } from '../standards/ProjectStandardsSurface.js'

export type ProjectSurfaceReadModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProjectSurfaceRouteViewProps {
  route: ProjectSurfaceRouteDefinition
  params?: URLSearchParams
  productionId?: string
  readModelStatus?: ProjectSurfaceReadModelStatus
  readModel?: unknown
  snapshot?: Parameters<typeof ProjectProgressSurface>[0]['snapshot']
  error?: Error
}

export function ProjectSurfaceRouteView({
  route,
  params,
  productionId,
  readModelStatus = 'idle',
  readModel,
  snapshot,
  error,
}: ProjectSurfaceRouteViewProps) {
  if (route.key === 'overview') {
    return (
      <ProjectOverviewSurface
        productionId={productionId}
        readModelStatus={readModelStatus}
        readModel={readModel}
        error={error}
      />
    )
  }

  if (route.key === 'progress') {
    return (
      <ProjectProgressSurface
        params={params}
        productionId={productionId}
        snapshot={snapshot}
        isLoading={readModelStatus === 'loading'}
        error={error}
      />
    )
  }

  if (route.key === 'settings') {
    return <ProjectSettingsSurface />
  }

  if (route.key === 'scripts') {
    return <ProjectScriptsSurface params={params} />
  }

  if (route.key === 'standards') {
    return <ProjectStandardsSurface />
  }

  if (route.key === 'remotionStudio') {
    return <ProjectRemotionStudioSurface params={params} />
  }

  return (
    <ProjectRouteReadModelSurface
      route={route}
      productionId={productionId}
      readModelStatus={readModelStatus}
      readModel={readModel}
      error={error}
    />
  )
}

function ProjectRouteReadModelSurface({
  route,
  productionId,
  readModelStatus,
  readModel,
  error,
}: {
  route: ProjectSurfaceRouteDefinition
  productionId?: string
  readModelStatus: ProjectSurfaceReadModelStatus
  readModel?: unknown
  error?: Error
}) {
  const runtime = useProjectSurfaceRuntime()
  const projectReadModelRecord = recordValue(recordValue(readModel)?.projectReadModel ?? readModel)

  return (
    <AgentSurfaceShell
      title={route.label}
      description="Project route is hosted by the active surface host and backed by project read-model data."
      ready
      chips={[
        `project: ${runtime.project.projectId}`,
        `route: ${route.segment}`,
      ]}
    >
      <div className="agent-surface-grid">
        <AgentSurfacePanel title="Project">
          <AgentSurfaceKeyValues items={[
            ['Project', runtime.project.projectId],
            ['Production', productionId || 'default'],
            ['Project Dir', runtime.project.projectDir || 'not configured'],
            ['Read model', readModelStatus],
          ]} />
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Routes">
          <div className="surface-host-route-list">
            {PROJECT_SURFACE_ROUTE_DEFINITIONS.map((entry) => (
              <AgentSurfaceLink key={entry.path} href={runtime.navigator.href(entry.key)}>{entry.label}</AgentSurfaceLink>
            ))}
          </div>
        </AgentSurfacePanel>
        <AgentSurfacePanel title="Project Read Model">
          {readModelStatus === 'loading' ? (
            <div className="agent-surface-status">Loading project read-model...</div>
          ) : error ? (
            <div className="agent-surface-status">{error.message}</div>
          ) : projectReadModelRecord ? (
            <AgentSurfaceJson value={projectReadModelRecord} />
          ) : (
            <div className="agent-surface-status">Open this route with projectDir to load local project data.</div>
          )}
        </AgentSurfacePanel>
      </div>
    </AgentSurfaceShell>
  )
}

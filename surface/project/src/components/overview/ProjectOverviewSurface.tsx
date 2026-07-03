import { arrayValue, recordValue, stringValue } from '../../data.js'
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
import type { ProjectSurfaceReadModelStatus } from '../routes/ProjectSurfaceRouteView.js'

export interface ProjectOverviewSurfaceProps {
  productionId?: string
  readModelStatus?: ProjectSurfaceReadModelStatus
  readModel?: unknown
  error?: Error
}

export function ProjectOverviewSurface({
  productionId,
  readModelStatus = 'idle',
  readModel,
  error,
}: ProjectOverviewSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const projectReadModel = recordValue(recordValue(readModel)?.projectReadModel ?? readModel)
  const overview = recordValue(projectReadModel?.overview)
  const workspace = recordValue(projectReadModel?.workspace) ?? recordValue(overview?.workspace)
  const production = recordValue(projectReadModel?.productionSummary ?? overview?.production)
  const content = recordValue(projectReadModel?.contentSummary ?? overview?.content)
  const readiness = recordValue(projectReadModel?.readiness ?? overview?.readiness)
  const nextWork = arrayValue(readiness?.next_work ?? readiness?.nextWork ?? overview?.next_work ?? overview?.nextWork)

  return (
    <AgentSurfaceShell
      title="Overview"
      description="Project Surface overview backed by the host runtime and project read-model."
      ready={Boolean(runtime.project.projectId)}
      chips={[
        `project: ${runtime.project.projectId}`,
        `location: ${runtime.project.location ?? 'unknown'}`,
        `read model: ${readModelStatus}`,
      ]}
    >
      <div className="agent-surface-grid">
        <AgentSurfacePanel title="Project">
          <AgentSurfaceKeyValues items={[
            ['Project ID', runtime.project.projectId],
            ['Title', runtime.project.title ?? stringValue(workspace?.title) ?? runtime.project.projectId],
            ['Project Dir', runtime.project.projectDir ?? stringValue(workspace?.projectDir ?? workspace?.project_dir) ?? 'not configured'],
            ['Project UID', runtime.project.projectUid ?? stringValue(workspace?.projectUid ?? workspace?.project_uid) ?? 'not configured'],
            ['Production', productionId ?? stringValue(production?.production_id ?? production?.productionId) ?? 'default'],
          ]} />
        </AgentSurfacePanel>

        <AgentSurfacePanel title="Operations">
          <div className="surface-host-route-list">
            {PROJECT_SURFACE_ROUTE_DEFINITIONS.map((route) => (
              <AgentSurfaceLink key={route.path} href={runtime.navigator.href(route.key)}>{route.label}</AgentSurfaceLink>
            ))}
          </div>
        </AgentSurfacePanel>

        <AgentSurfacePanel title="Runtime">
          <AgentSurfaceKeyValues items={[
            ['Project Gateway', 'available'],
            ['Agent Gateway', runtime.diagnostics.endpoints?.mcpApi ?? 'not configured'],
            ['Generation', statusLabel(runtime.capabilities.generation)],
            ['Editing', statusLabel(runtime.capabilities.editing)],
            ['Media Pipeline', statusLabel(runtime.capabilities.mediaPipeline)],
            ['Local Git', statusLabel(runtime.capabilities.localGit)],
          ]} />
        </AgentSurfacePanel>

        <AgentSurfacePanel title="Read Model">
          {readModelStatus === 'loading' ? (
            <div className="agent-surface-status">Loading project read-model...</div>
          ) : error ? (
            <div className="agent-surface-status">{error.message}</div>
          ) : projectReadModel ? (
            <AgentSurfaceJson value={{
              overview: overview ?? projectReadModel,
              production,
              content,
              readiness,
            }} />
          ) : (
            <div className="agent-surface-status">Project read-model is not loaded yet.</div>
          )}
        </AgentSurfacePanel>

        <AgentSurfacePanel title="Next Work">
          {nextWork.length > 0 ? (
            <AgentSurfaceJson value={nextWork} />
          ) : (
            <div className="agent-surface-status">No next-work items reported by the read-model.</div>
          )}
        </AgentSurfacePanel>
      </div>
    </AgentSurfaceShell>
  )
}

function statusLabel(value: boolean): string {
  return value ? 'enabled' : 'unavailable'
}

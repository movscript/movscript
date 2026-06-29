import { useQuery } from '@tanstack/react-query'
import { arrayValue, recordValue, stringValue } from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'

export type ProjectResourceViewSurfaceKind = 'scripts' | 'standards' | 'content'

export interface ProjectResourceViewSurfaceProps {
  kind: ProjectResourceViewSurfaceKind
}

export function ProjectResourceViewSurface({ kind }: ProjectResourceViewSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const resourceViewKind = projectResourceViewKind(kind)
  const resourceViewQuery = useQuery({
    queryKey: ['project-surface', 'resource-view', runtime.project.projectId, runtime.project.projectDir ?? '', resourceViewKind],
    queryFn: () => {
      const resourceView = runtime.gateways.project.resourceView
      if (!resourceView) throw new Error('Project runtime resource gateway is not available.')
      return resourceView({
        projectId: runtime.project.projectId,
        projectDir: runtime.project.projectDir,
        projectUid: runtime.project.projectUid,
        kind: resourceViewKind,
      })
    },
    enabled: Boolean(runtime.gateways.project.resourceView && runtime.project.projectDir),
  })
  const payload = recordValue(resourceViewQuery.data)
  const items = arrayValue(payload?.items)
  const usage = stringValue(payload?.usage ?? payload?.viewMode ?? payload?.view_mode) ?? 'debug_compat'
  const preferredEndpoint = stringValue(payload?.preferredEndpoint ?? payload?.preferred_endpoint)
  const title = projectResourceTitle(kind)

  return (
    <AgentSurfaceShell
      title={`${title} Debug View`}
      description="Debug/compat project resource view backed by the active project runtime."
      ready={Boolean(runtime.project.projectId)}
      chips={[
        `project: ${runtime.project.projectId}`,
        `view: ${resourceViewKind}`,
        `mode: ${usage}`,
        ...(preferredEndpoint ? [`prefer: ${preferredEndpoint}`] : []),
        `items: ${items.length}`,
      ]}
    >
      <div className="agent-surface-grid">
        <AgentSurfacePanel title="Project">
          <AgentSurfaceKeyValues items={[
            ['Project', runtime.project.projectId],
            ['Project Dir', runtime.project.projectDir ?? 'not configured'],
            ['Project Gateway', runtime.gateways.project.resourceView ? 'available' : 'missing'],
          ]} />
        </AgentSurfacePanel>

        <AgentSurfacePanel title={title}>
          {resourceViewQuery.isLoading ? (
            <div className="agent-surface-status">Loading project resources...</div>
          ) : resourceViewQuery.error ? (
            <div className="agent-surface-status">{errorMessage(resourceViewQuery.error)}</div>
          ) : items.length > 0 ? (
            <div className="agent-surface-work-list">
              {items.map((item, index) => (
                <ProjectResourceViewItem key={projectResourceItemKey(item, index)} item={item} kind={kind} />
              ))}
            </div>
          ) : (
            <div className="agent-surface-status">No project resources reported for this view.</div>
          )}
        </AgentSurfacePanel>

        <AgentSurfacePanel title="Routes">
          <div className="surface-host-route-list">
            <AgentSurfaceLink href={runtime.navigator.href('overview')}>Overview</AgentSurfaceLink>
            <AgentSurfaceLink href={runtime.navigator.href('scripts')}>Scripts</AgentSurfaceLink>
            <AgentSurfaceLink href={runtime.navigator.href('standards')}>Standards</AgentSurfaceLink>
            <AgentSurfaceLink href={runtime.navigator.href('contentCanvas')}>Canvas</AgentSurfaceLink>
            <AgentSurfaceLink href={runtime.navigator.href('contentPreview')}>Preview</AgentSurfaceLink>
            <AgentSurfaceLink href={runtime.navigator.href('settings')}>Settings</AgentSurfaceLink>
          </div>
        </AgentSurfacePanel>

        {payload ? (
          <AgentSurfacePanel title="Raw View">
            <AgentSurfaceJson value={payload} />
          </AgentSurfacePanel>
        ) : null}
      </div>
    </AgentSurfaceShell>
  )
}

function ProjectResourceViewItem({ item, kind }: { item: unknown; kind: ProjectResourceViewSurfaceKind }) {
  const record = recordValue(item) ?? {}
  const title = stringValue(record.title ?? record.name ?? record.id ?? record.path) ?? 'Untitled'
  const subtitle = [
    stringValue(record.entityKind ?? record.entity_kind),
    stringValue(record.id),
    stringValue(record.path),
  ].filter(Boolean).join(' · ')
  const description = projectResourceDescription(record, kind)

  return (
    <article className="agent-surface-work-card">
      <header>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </header>
      {description ? <p>{description}</p> : null}
    </article>
  )
}

function projectResourceViewKind(kind: ProjectResourceViewSurfaceKind): string {
  if (kind === 'standards') return 'settings'
  if (kind === 'content') return 'content-units'
  return 'scripts'
}

function projectResourceTitle(kind: ProjectResourceViewSurfaceKind): string {
  if (kind === 'standards') return 'Standards'
  if (kind === 'content') return 'Content'
  return 'Scripts'
}

function projectResourceDescription(record: Record<string, unknown>, kind: ProjectResourceViewSurfaceKind): string | undefined {
  if (kind === 'scripts') {
    return stringValue(record.summary ?? record.source)?.slice(0, 240)
  }
  if (kind === 'standards') {
    return stringValue(record.description ?? record.prompt ?? record.value)
  }
  return stringValue(record.output_kind ?? record.outputKind ?? record.description)
}

function projectResourceItemKey(item: unknown, index: number): string {
  const record = recordValue(item)
  return stringValue(record?.id ?? record?.path ?? record?.uid) ?? `resource-${index}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

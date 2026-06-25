import type { AgentSurfaceSnapshot } from '../data.js'
import { arrayValue, recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export function AgentProjectStatusSurface({
  ready,
  params,
  projectId,
  productionId,
  snapshot,
  isLoading,
  error,
}: {
  ready: boolean
  params: URLSearchParams
  projectId?: string
  productionId?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: unknown
}) {
  const summary = recordValue(snapshot?.data?.status_summary)
  const productions = arrayValue(summary?.productions)
  const firstProduction = recordValue(productions[0])
  const contentUnits = arrayValue(firstProduction?.content_units)
  const blockers = arrayValue(firstProduction?.blocking_refs)
  const readyToGenerate = contentUnits.filter((unit) => contentUnitBucket(recordValue(unit)) === 'ready')
  const needsSelection = contentUnits.filter((unit) => contentUnitBucket(recordValue(unit)) === 'selection')
  const needsFix = contentUnits.filter((unit) => contentUnitBucket(recordValue(unit)) === 'fix')
  const recentCandidates = recentCandidateEntries(contentUnits)
  const selectedResources = selectedResourceEntries(contentUnits)

  return (
    <AgentSurfaceShell
      title="Project status"
      description="Inspect production readiness, candidate coverage, selected resources, stale hints, and blockers."
      chips={[
        ...(projectId ? [`project: ${projectId}`] : []),
        ...(productionId ? [`production: ${productionId}`] : []),
      ]}
      ready={ready}
      preparingLabel="Preparing project status surface..."
    >
      {!projectId ? (
        <div className="agent-surface-status">Missing projectId.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading project status...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load project status.'}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Scope">
            <AgentSurfaceKeyValues items={[
              ['Project', projectId ?? ''],
              ['Production', productionId ?? ''],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Readiness">
            <AgentSurfaceKeyValues items={[
              ['Productions', productions.length],
              ['Content units', contentUnits.length],
              ['Ready to generate', readyToGenerate.length],
              ['Needs selection', needsSelection.length],
              ['Needs source/prompt fix', needsFix.length],
              ['Blocking refs', blockers.length],
              ['Stale status', firstProduction?.stale_status as string ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Next Work" description="Use these lanes to decide whether to generate, select a candidate, or fix source/prompt blockers first.">
            <div className="agent-surface-lanes">
              <StatusLane title="Ready To Generate" items={readyToGenerate} params={params} projectId={projectId} />
              <StatusLane title="Needs Selection" items={needsSelection} params={params} projectId={projectId} />
              <StatusLane title="Needs Source Or Prompt Fix" items={needsFix} params={params} projectId={projectId} />
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Recent Artifacts" description="Domain summary tracks candidates and selected resources; generation jobs are opened from generation surfaces.">
            <div className="agent-surface-recent-grid">
              <RecentCandidates items={recentCandidates} params={params} projectId={projectId} />
              <SelectedResources items={selectedResources} params={params} projectId={projectId} />
              <section className="agent-surface-lane">
                <h3>Generation Jobs</h3>
                <p>{stringValue(firstProduction?.job_status ?? firstProduction?.jobStatus) ?? 'not_tracked_in_domain_summary'}</p>
              </section>
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Status Summary">
            <AgentSurfaceJson value={summary ?? snapshot} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

function RecentCandidates({
  items,
  params,
  projectId,
}: {
  items: Array<{ contentUnitId: string; candidateId: string; title?: string; selected?: boolean }>
  params: URLSearchParams
  projectId?: string
}) {
  return (
    <section className="agent-surface-lane">
      <h3>Recent Candidates</h3>
      {items.length > 0 ? (
        <div className="agent-surface-work-list">
          {items.slice(0, 6).map((item) => (
            <article key={`${item.contentUnitId}:${item.candidateId}`} className="agent-surface-work-card" data-severity={item.selected ? 'suggestion' : 'warning'}>
              <div className="agent-surface-work-card__heading">
                <strong>{item.candidateId}</strong>
                <span>{[item.title, item.contentUnitId, item.selected ? 'selected' : undefined].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="agent-surface-actions">
                <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId: item.contentUnitId, candidateId: item.candidateId })}>Review</AgentSurfaceLink>
                <AgentSurfaceLink href={withAgentParams('/agent/content/prompt', params, { projectId, contentUnitId: item.contentUnitId })}>Prompt</AgentSurfaceLink>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>No candidates tracked.</p>
      )}
    </section>
  )
}

function SelectedResources({
  items,
  params,
  projectId,
}: {
  items: Array<{ contentUnitId: string; resourceId: string; title?: string; candidateId?: string }>
  params: URLSearchParams
  projectId?: string
}) {
  return (
    <section className="agent-surface-lane">
      <h3>Selected Resources</h3>
      {items.length > 0 ? (
        <div className="agent-surface-work-list">
          {items.slice(0, 6).map((item) => (
            <article key={`${item.contentUnitId}:${item.resourceId}`} className="agent-surface-work-card" data-severity="suggestion">
              <div className="agent-surface-work-card__heading">
                <strong>Resource {item.resourceId}</strong>
                <span>{[item.title, item.contentUnitId, item.candidateId ? `candidate ${item.candidateId}` : undefined].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="agent-surface-actions">
                <AgentSurfaceLink href={withAgentParams(`/agent/resources/${item.resourceId}`, params, { projectId })}>Open resource</AgentSurfaceLink>
                <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId: item.contentUnitId, candidateId: item.candidateId, resourceId: item.resourceId })}>Review candidate</AgentSurfaceLink>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>No selected resources tracked.</p>
      )}
    </section>
  )
}

function StatusLane({
  title,
  items,
  params,
  projectId,
}: {
  title: string
  items: unknown[]
  params: URLSearchParams
  projectId?: string
}) {
  return (
    <section className="agent-surface-lane">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <div className="agent-surface-work-list">
          {items.map((item, index) => (
            <ContentUnitStatusCard
              key={contentUnitKey(item, index)}
              unit={recordValue(item) ?? { value: item }}
              params={params}
              projectId={projectId}
            />
          ))}
        </div>
      ) : (
        <p>No items.</p>
      )}
    </section>
  )
}

function ContentUnitStatusCard({
  unit,
  params,
  projectId,
}: {
  unit: Record<string, unknown>
  params: URLSearchParams
  projectId?: string
}) {
  const contentUnitId = stringValue(unit.content_unit_id ?? unit.contentUnitId)
  const title = stringValue(unit.title) ?? contentUnitId ?? stringValue(unit.path) ?? 'Content unit'
  const candidateCount = stringValue(unit.candidate_count ?? unit.candidateCount) ?? '0'
  const selectedCandidate = stringValue(unit.selected_candidate ?? unit.selectedCandidate)
  const selectedResource = stringValue(unit.selected_resource ?? unit.selectedResource)
  const blockingRefs = arrayValue(unit.blocking_refs ?? unit.blockingRefs)
  return (
    <article className="agent-surface-work-card" data-severity={blockingRefs.length > 0 ? 'blocking' : selectedCandidate ? 'suggestion' : 'warning'}>
      <div className="agent-surface-work-card__main">
        <div className="agent-surface-work-card__heading">
          <strong>{title}</strong>
          <span>{[
            contentUnitId ? `content unit ${contentUnitId}` : undefined,
            stringValue(unit.output_kind ?? unit.outputKind),
            `candidates ${candidateCount}`,
            selectedCandidate ? `selected ${selectedCandidate}` : undefined,
            selectedResource ? `resource ${selectedResource}` : undefined,
          ].filter(Boolean).join(' · ')}</span>
        </div>
        {blockingRefs.length > 0 ? <p>Blocking refs: {blockingRefs.map((value) => stringValue(value) ?? String(value)).join(', ')}</p> : null}
      </div>
      {contentUnitId ? (
        <div className="agent-surface-actions">
          <AgentSurfaceLink href={withAgentParams('/agent/content/prompt', params, { projectId, contentUnitId })}>Open prompt</AgentSurfaceLink>
          <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId })}>Review candidates</AgentSurfaceLink>
          {selectedResource ? <AgentSurfaceLink href={withAgentParams(`/agent/resources/${selectedResource}`, params)}>Open resource</AgentSurfaceLink> : null}
        </div>
      ) : null}
    </article>
  )
}

function contentUnitBucket(unit: Record<string, unknown> | undefined): 'ready' | 'selection' | 'fix' {
  if (!unit) return 'fix'
  const blockingRefs = arrayValue(unit.blocking_refs ?? unit.blockingRefs)
  if (blockingRefs.length > 0) return 'selection'
  const candidateCount = Number(unit.candidate_count ?? unit.candidateCount ?? 0)
  const selectedCandidate = stringValue(unit.selected_candidate ?? unit.selectedCandidate)
  if (!selectedCandidate && candidateCount > 0) return 'selection'
  if (!selectedCandidate) return 'ready'
  return 'ready'
}

function recentCandidateEntries(contentUnits: unknown[]): Array<{ contentUnitId: string; candidateId: string; title?: string; selected?: boolean }> {
  const entries: Array<{ contentUnitId: string; candidateId: string; title?: string; selected?: boolean }> = []
  for (const value of contentUnits) {
    const unit = recordValue(value)
    const contentUnitId = stringValue(unit?.content_unit_id ?? unit?.contentUnitId)
    if (!unit || !contentUnitId) continue
    const title = stringValue(unit.title)
    const selectedCandidate = stringValue(unit.selected_candidate ?? unit.selectedCandidate)
    for (const candidateId of arrayValue(unit.candidate_ids ?? unit.candidateIds).map((item) => stringValue(item)).filter((item): item is string => Boolean(item))) {
      entries.push({ contentUnitId, candidateId, title, selected: selectedCandidate === candidateId })
    }
  }
  return entries.reverse()
}

function selectedResourceEntries(contentUnits: unknown[]): Array<{ contentUnitId: string; resourceId: string; title?: string; candidateId?: string }> {
  const entries: Array<{ contentUnitId: string; resourceId: string; title?: string; candidateId?: string }> = []
  for (const value of contentUnits) {
    const unit = recordValue(value)
    const contentUnitId = stringValue(unit?.content_unit_id ?? unit?.contentUnitId)
    const resourceId = stringValue(unit?.selected_resource ?? unit?.selectedResource)
    if (!unit || !contentUnitId || !resourceId) continue
    entries.push({
      contentUnitId,
      resourceId,
      title: stringValue(unit.title),
      candidateId: stringValue(unit.selected_candidate ?? unit.selectedCandidate),
    })
  }
  return entries.reverse()
}

function contentUnitKey(item: unknown, index: number): string {
  const record = recordValue(item)
  return stringValue(record?.content_unit_id ?? record?.contentUnitId) ?? stringValue(record?.path) ?? `content-unit-${index}`
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

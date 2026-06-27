import type { ReactNode } from 'react'
import type { AgentSurfaceSnapshot } from '../data.js'
import {
  agentSurfaceDomainFocus,
  agentSurfaceFocusChips,
  agentSurfaceFocusLabel,
  agentSurfaceHasTimelineFocus,
  agentSurfaceLegacyProductionId,
  agentSurfaceSnapshotDomainFocus,
  arrayValue,
  numberValue,
  recordValue,
  stringValue,
} from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export function AgentPreviewTimelineSurface({
  ready,
  params,
  projectId,
  productionId,
  snapshot,
  isLoading,
  error,
  resourcesById,
  renderResourcePreview,
}: {
  ready: boolean
  params: URLSearchParams
  projectId?: string
  productionId?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: unknown
  resourcesById?: ReadonlyMap<number, unknown>
  renderResourcePreview?: (resource: unknown) => ReactNode
}) {
  const preview = recordValue(snapshot?.data?.preview_timeline)
  const productionTimeline = recordValue(snapshot?.data?.production_timeline)
  const embeddedPreview = recordValue(productionTimeline?.preview_timeline)
  const clips = arrayValue(productionTimeline?.clips ?? preview?.clips ?? preview?.items ?? embeddedPreview?.items)
  const blockers = arrayValue(productionTimeline?.blockers ?? preview?.blockers ?? embeddedPreview?.blockers)
  const mediaEditingProject = recordValue(productionTimeline?.media_editing_project)
  const status = stringValue(productionTimeline?.status) ?? stringValue(preview?.status) ?? snapshot?.status ?? ''
  const domainFocus = agentSurfaceSnapshotDomainFocus(snapshot)
    ?? agentSurfaceDomainFocus(params, { projectId, productionId })
  const legacyProductionId = agentSurfaceLegacyProductionId(domainFocus, productionId)
  const focusLabel = agentSurfaceFocusLabel(domainFocus, legacyProductionId ? `production: ${legacyProductionId}` : '')
  const hasTimelineScope = agentSurfaceHasTimelineFocus(domainFocus, legacyProductionId)

  return (
    <AgentSurfaceShell
      title={focusLabel ? `Timeline preview: ${focusLabel}` : 'Timeline preview'}
      description="Inspect selected scene-moment outputs in timeline assembly context and identify missing or stale preview material."
      chips={agentSurfaceFocusChips(domainFocus)}
      ready={ready}
      preparingLabel="Preparing preview timeline surface..."
    >
      {!hasTimelineScope ? (
        <div className="agent-surface-status">Missing timeline preview scope.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading preview timeline...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load preview timeline.'}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Timeline Target">
            <AgentSurfaceKeyValues items={[
              ['Project', projectId ?? ''],
              ['Focus', focusLabel],
              ['Assembly target', domainFocus.target?.targetRef ?? ''],
              ['Legacy production', legacyProductionId ?? ''],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Preview Summary">
            <AgentSurfaceKeyValues items={[
              ['Status', status],
              ['Clips/items', clips.length],
              ['Blockers', blockers.length],
              ['Editing handoff', mediaEditingProject ? 'available' : 'not ready'],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Selected Timeline Clips" description="Only selected candidates are stable enough to appear as preview clips. Missing selections show up as blockers.">
            {clips.length > 0 ? (
              <div className="agent-surface-timeline-list">
                {clips.map((clip, index) => (
                  <TimelineClipCard
                    key={timelineClipKey(clip, index)}
                    clip={recordValue(clip) ?? { value: clip }}
                    params={params}
                    projectId={projectId}
                    resource={resourceForClip(recordValue(clip), resourcesById)}
                    renderResourcePreview={renderResourcePreview}
                  />
                ))}
              </div>
            ) : (
              <p>No selected preview clips are available yet.</p>
            )}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Blockers" description="Resolve blockers before handing this timeline assembly to editing.">
            {blockers.length > 0 ? (
              <div className="agent-surface-work-list">
                {blockers.map((blocker, index) => (
                  <TimelineBlockerCard
                    key={timelineBlockerKey(blocker, index)}
                    blocker={recordValue(blocker) ?? { value: blocker }}
                    params={params}
                    projectId={projectId}
                  />
                ))}
              </div>
            ) : (
              <p>No preview blockers reported.</p>
            )}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Editing Handoff">
            <AgentSurfaceJson value={{
              status,
              media_editing_project: mediaEditingProject,
              compose_inputs: productionTimeline?.compose_inputs,
            }} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Raw Timeline Data">
            <AgentSurfaceJson value={{ preview_timeline: preview, production_timeline: productionTimeline ?? snapshot }} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

export function agentPreviewTimelineResourceIds(snapshot?: AgentSurfaceSnapshot): number[] {
  const preview = recordValue(snapshot?.data?.preview_timeline)
  const productionTimeline = recordValue(snapshot?.data?.production_timeline)
  const embeddedPreview = recordValue(productionTimeline?.preview_timeline)
  const clips = arrayValue(productionTimeline?.clips ?? preview?.clips ?? preview?.items ?? embeddedPreview?.items)
  return timelineClipResourceIds(clips)
}

function TimelineClipCard({
  clip,
  params,
  projectId,
  resource,
  renderResourcePreview,
}: {
  clip: Record<string, unknown>
  params: URLSearchParams
  projectId?: string
  resource?: unknown
  renderResourcePreview?: (resource: unknown) => ReactNode
}) {
  const title = stringValue(clip.title ?? clip.sceneMomentTitle ?? clip.scene_moment_title) ?? stringValue(clip.sceneMomentId ?? clip.scene_moment_id) ?? 'Preview clip'
  const contentUnitId = stringValue(clip.contentUnitId ?? clip.content_unit_id)
  const candidateId = stringValue(clip.candidateId ?? clip.candidate_id)
  const resourceId = stringValue(clip.resourceId ?? clip.resource_id)
  const durationSec = stringValue(clip.durationSec ?? clip.duration_sec)
  return (
    <article className="agent-surface-timeline-clip">
      {resource && renderResourcePreview ? (
        <div className="agent-surface-timeline-preview">
          {renderResourcePreview(resource)}
        </div>
      ) : resourceId ? (
        <div className="agent-surface-status">Resource preview loading or unavailable.</div>
      ) : null}
      <div className="agent-surface-work-card__main">
        <div className="agent-surface-work-card__heading">
          <strong>{title}</strong>
          <span>{[
            contentUnitId ? `content unit ${contentUnitId}` : undefined,
            candidateId ? `candidate ${candidateId}` : undefined,
            resourceId ? `resource ${resourceId}` : undefined,
            durationSec ? `${durationSec}s` : undefined,
          ].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="agent-surface-actions">
        {resourceId ? <AgentSurfaceLink href={withAgentParams(`/agent/resources/${resourceId}`, params)}>Open resource</AgentSurfaceLink> : null}
        {contentUnitId ? <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId, candidateId })}>Review candidate</AgentSurfaceLink> : null}
        {contentUnitId ? <AgentSurfaceLink href={withAgentParams('/agent/content/prompt', params, { projectId, contentUnitId })}>Open prompt</AgentSurfaceLink> : null}
      </div>
    </article>
  )
}

function TimelineBlockerCard({
  blocker,
  params,
  projectId,
}: {
  blocker: Record<string, unknown>
  params: URLSearchParams
  projectId?: string
}) {
  const code = stringValue(blocker.code) ?? 'preview_blocker'
  const contentUnitId = stringValue(blocker.content_unit_id ?? blocker.contentUnitId)
  const candidateId = stringValue(blocker.candidate_id ?? blocker.candidateId)
  const sceneMomentId = stringValue(blocker.scene_moment_id ?? blocker.sceneMomentId)
  return (
    <article className="agent-surface-work-card" data-severity="blocking">
      <div className="agent-surface-work-card__main">
        <div className="agent-surface-work-card__heading">
          <strong>{code}</strong>
          <span>{[
            sceneMomentId ? `scene moment ${sceneMomentId}` : undefined,
            contentUnitId ? `content unit ${contentUnitId}` : undefined,
            candidateId ? `candidate ${candidateId}` : undefined,
          ].filter(Boolean).join(' · ')}</span>
        </div>
        <p>{stringValue(blocker.message) ?? 'Preview timeline is blocked by missing or stale selected output.'}</p>
      </div>
      {contentUnitId ? (
        <div className="agent-surface-actions">
          <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId, candidateId })}>Review candidates</AgentSurfaceLink>
          <AgentSurfaceLink href={withAgentParams('/agent/content/prompt', params, { projectId, contentUnitId })}>Open prompt</AgentSurfaceLink>
        </div>
      ) : null}
    </article>
  )
}

function timelineClipKey(clip: unknown, index: number): string {
  const record = recordValue(clip)
  return stringValue(record?.id) ?? stringValue(record?.contentUnitId ?? record?.content_unit_id) ?? `clip-${index}`
}

function timelineBlockerKey(blocker: unknown, index: number): string {
  const record = recordValue(blocker)
  return [stringValue(record?.code), stringValue(record?.content_unit_id ?? record?.contentUnitId), String(index)].filter(Boolean).join(':')
}

function timelineClipResourceIds(clips: unknown[]): number[] {
  const ids = new Set<number>()
  for (const clip of clips) {
    const id = numberValue(recordValue(clip)?.resourceId ?? recordValue(clip)?.resource_id)
    if (id !== undefined && Number.isInteger(id) && id > 0) ids.add(id)
  }
  return [...ids]
}

function resourceForClip(clip: Record<string, unknown> | undefined, resourcesById?: ReadonlyMap<number, unknown>): unknown {
  const id = numberValue(clip?.resourceId ?? clip?.resource_id)
  return id === undefined || !Number.isInteger(id) || id <= 0 ? undefined : resourcesById?.get(id)
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

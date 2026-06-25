import type { AgentSurfaceSnapshot } from '../data.js'
import { arrayValue, recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export type AgentImpactAcceptStaleInput = {
  contentUnitId: string
  candidateId: string
  resourceId?: string
}

export function AgentImpactSurface({
  ready,
  params,
  projectId,
  target,
  source = 'domain_regeneration_plan',
  snapshot,
  isLoading,
  error,
  acceptStalePending = false,
  acceptStaleError,
  acceptStaleSuccess = false,
  onAcceptStale,
}: {
  ready: boolean
  params: URLSearchParams
  projectId?: string
  target?: string
  source?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: unknown
  acceptStalePending?: boolean
  acceptStaleError?: unknown
  acceptStaleSuccess?: boolean
  onAcceptStale?: (input: AgentImpactAcceptStaleInput) => void
}) {
  const plan = recordValue(snapshot?.data?.regeneration_plan)
  const summary = recordValue(plan?.summary)
  const affected = arrayValue(plan?.items ?? plan?.affected_content_units ?? plan?.affectedContentUnits)

  return (
    <AgentSurfaceShell
      title="Change impact"
      description="Review affected targets and choose keep, relink, re-prompt, regenerate, deprecate, or accept-stale decisions."
      chips={[
        ...(projectId ? [`project: ${projectId}`] : []),
        ...(target ? [`target: ${target}`] : []),
        `source: ${source}`,
      ]}
      ready={ready}
      preparingLabel="Preparing impact surface..."
    >
      {isLoading ? (
        <div className="agent-surface-status">Loading impact snapshot...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load impact snapshot.'}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Impact Target">
            <AgentSurfaceKeyValues items={[
              ['Project', projectId ?? ''],
              ['Target', target ?? ''],
              ['Source', source],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Decision Semantics">
            <AgentSurfaceKeyValues items={[
              ['Status', snapshot?.status ?? ''],
              ['Affected items', affected.length],
              ['Blocking', stringValue(summary?.blocking) ?? ''],
              ['Stale selections', stringValue(summary?.staleSelections ?? summary?.stale_selections) ?? ''],
            ]} />
            <p>Affected does not mean regenerate. Review requires an explicit keep, relink, re-prompt, regenerate, deprecate, or accept-stale decision.</p>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Affected Targets" description="Each item needs an explicit keep, relink, re-prompt, regenerate, deprecate, or accept-stale decision.">
            {affected.length > 0 ? (
              <div className="agent-surface-work-list">
                {affected.map((item, index) => (
                  <ImpactItemCard
                    key={impactItemKey(item, index)}
                    item={recordValue(item) ?? { value: item }}
                    params={params}
                    fallbackProjectId={projectId}
                    pending={acceptStalePending}
                    onAcceptStale={onAcceptStale}
                  />
                ))}
              </div>
            ) : (
              <p>No affected targets reported.</p>
            )}
            {acceptStaleError ? (
              <p className="agent-surface-callout agent-surface-callout--danger">{acceptStaleError instanceof Error ? acceptStaleError.message : 'Accept stale failed.'}</p>
            ) : null}
            {acceptStaleSuccess ? (
              <p className="agent-surface-callout">Stale selection accepted. Review candidates and preview timeline after the domain state refreshes.</p>
            ) : null}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Raw Regeneration Plan">
            <AgentSurfaceJson value={plan ?? snapshot} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

function ImpactItemCard({
  item,
  params,
  fallbackProjectId,
  pending,
  onAcceptStale,
}: {
  item: Record<string, unknown>
  params: URLSearchParams
  fallbackProjectId?: string
  pending: boolean
  onAcceptStale?: (input: AgentImpactAcceptStaleInput) => void
}) {
  const targetPath = stringValue(item.targetPath ?? item.target_path)
  const targetId = stringValue(item.targetId ?? item.target_id)
  const targetKind = stringValue(item.targetKind ?? item.target_kind)
  const contentUnitId = contentUnitIdFromImpactItem(item) ?? contentUnitIdFromPath(targetPath)
  const productionId = productionIdFromPath(targetPath) ?? productionIdFromPath(stringValue(item.productionPath ?? item.production_path))
  const projectId = stringValue(item.projectId ?? item.project_id) ?? fallbackProjectId
  const severity = stringValue(item.severity) ?? 'warning'
  const status = stringValue(item.status) ?? 'open'
  const kind = stringValue(item.kind) ?? 'review_affected_output'
  const actor = stringValue(item.recommendedActor ?? item.recommended_actor) ?? 'human'
  const candidateId = stringValue(item.candidateId ?? item.candidate_id)
  const resourceId = stringValue(item.resourceId ?? item.resource_id)
  const stale = stringValue(item.stale) === 'true' || item.stale === true
  const actionLabels = actionLabelsFromItem(item, { contentUnitId, stale, candidateId })
  return (
    <article className="agent-surface-work-card" data-severity={severity}>
      <div className="agent-surface-work-card__main">
        <div className="agent-surface-work-card__heading">
          <strong>{targetId ?? targetPath ?? targetKind ?? kind}</strong>
          <span>{kind} · {status} · {severity} · {actor}</span>
        </div>
        <p>{stringValue(item.reason) ?? 'Review this affected target before treating existing outputs as stable.'}</p>
        {actionLabels.length > 0 ? (
          <div className="agent-surface-tag-row">
            {actionLabels.map((label) => <span key={label} className="agent-surface-tag">{label}</span>)}
          </div>
        ) : null}
        <div className="agent-surface-decision-strip">
          {actionLabels.map((label) => <span key={`decision-${label}`} className="agent-surface-decision-step">{label}</span>)}
        </div>
      </div>
      <div className="agent-surface-actions">
        {contentUnitId ? (
          <>
            <AgentSurfaceLink href={withAgentParams('/agent/content/prompt', params, { projectId, contentUnitId, mode: 'edit' })}>Re-prompt</AgentSurfaceLink>
            <AgentSurfaceLink href={withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId })}>Review candidates</AgentSurfaceLink>
            {stale && candidateId && onAcceptStale ? (
              <button
                type="button"
                className="agent-surface-button"
                disabled={pending}
                onClick={() => onAcceptStale({ contentUnitId, candidateId, resourceId })}
              >
                Accept stale
              </button>
            ) : null}
          </>
        ) : null}
        {productionId ? (
          <AgentSurfaceLink href={withAgentParams('/agent/preview/timeline', params, { projectId, productionId })}>Open preview</AgentSurfaceLink>
        ) : null}
      </div>
    </article>
  )
}

function impactItemKey(item: unknown, index: number): string {
  const record = recordValue(item)
  return stringValue(record?.id) ?? stringValue(record?.targetPath ?? record?.target_path) ?? `impact-${index}`
}

function contentUnitIdFromImpactItem(item: Record<string, unknown>): string | undefined {
  return stringValue(item.contentUnitId ?? item.content_unit_id)
    ?? (stringValue(item.targetKind ?? item.target_kind) === 'content_unit' ? stringValue(item.targetId ?? item.target_id) : undefined)
}

function contentUnitIdFromPath(path: string | undefined): string | undefined {
  const match = path?.match(/(?:^|\/)content_units\/([^/]+)/)
  return match?.[1]
}

function productionIdFromPath(path: string | undefined): string | undefined {
  const match = path?.match(/(?:^|\/)productions\/([^/]+)/)
  return match?.[1]
}

function actionLabelsFromItem(item: Record<string, unknown>, context: { contentUnitId?: string; stale: boolean; candidateId?: string }): string[] {
  const labels = arrayValue(item.actionLabels ?? item.action_labels)
    .map((label) => stringValue(label))
    .filter((label): label is string => Boolean(label))
  if (labels.length > 0) return labels
  const explicit = arrayValue(item.actions)
    .map((action) => stringValue(recordValue(action)?.type) ?? stringValue(action))
    .filter((label): label is string => Boolean(label))
  if (explicit.length > 0) return explicit
  return [
    ...(context.contentUnitId ? ['re_prompt', 'review_candidates'] : []),
    ...(context.stale && context.candidateId ? ['accept_stale'] : []),
    'review_preview',
  ]
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

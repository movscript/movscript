import type { ReactNode } from 'react'
import { arrayValue, numberValue, recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export function AgentResourceDetailSurface({
  ready,
  params,
  resourceId,
  resource,
  usages,
  isLoading,
  usagesLoading,
  error,
  renderResourcePreview,
  onCopyText,
}: {
  ready: boolean
  params: URLSearchParams
  resourceId?: number
  resource?: Record<string, unknown>
  usages?: Record<string, unknown>
  isLoading?: boolean
  usagesLoading?: boolean
  error?: unknown
  renderResourcePreview?: (resource: unknown) => ReactNode
  onCopyText?: (value: string) => void
}) {
  const resourceType = stringValue(resource?.type)
  const mimeType = stringValue(resource?.mime_type)

  return (
    <AgentSurfaceShell
      title={resourceId ? `Resource #${resourceId}` : 'Resource detail'}
      description="Inspect the RawResource preview, metadata, and provenance before using it as a candidate or generation reference."
      chips={[
        ...(resourceType ? [`type: ${resourceType}`] : []),
        ...(mimeType ? [`mime: ${mimeType}`] : []),
      ]}
      ready={ready}
      preparingLabel="Preparing resource detail surface..."
    >
      {resourceId === undefined ? (
        <div className="agent-surface-status">Missing resourceId.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading resource...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load resource.'}</div>
      ) : resource ? (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Preview">
            {renderResourcePreview ? renderResourcePreview(resource) : null}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Metadata">
            <AgentSurfaceKeyValues items={[
              ['ID', numberValue(resource.ID) ?? ''],
              ['Name', stringValue(resource.name) ?? ''],
              ['Type', resourceType ?? ''],
              ['MIME', mimeType ?? ''],
              ['Size', numberValue(resource.size) ?? ''],
              ['URL', stringValue(resource.url) ?? ''],
            ]} />
            <div className="agent-surface-actions">
              <button className="agent-surface-link" type="button" onClick={() => copyText(String(numberValue(resource.ID) ?? resourceId), onCopyText)}>Copy RawResource ID</button>
              <button className="agent-surface-link" type="button" onClick={() => copyText(`{{resource::${numberValue(resource.ID) ?? resourceId}}}`, onCopyText)}>Copy semantic ref</button>
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="References" description="RawResources are media bodies; candidates and selections are the stable creative decisions that may point at them.">
            {usagesLoading ? (
              <p>Loading references...</p>
            ) : usages ? (
              <div className="agent-surface-reference-stack">
                <AgentSurfaceKeyValues items={[
                  ['Total', numberValue(recordValue(usages.counts)?.total) ?? ''],
                  ['Jobs', numberValue(recordValue(usages.counts)?.jobs) ?? ''],
                  ['Derivatives', numberValue(recordValue(usages.counts)?.derivatives) ?? ''],
                  ['Candidate decisions', numberValue(recordValue(usages.counts)?.decisions) ?? ''],
                ]} />
                {arrayValue(usages.jobs).length > 0 ? (
                  <ReferenceGroup title="Jobs">
                    {arrayValue(usages.jobs).map((job, index) => {
                      const record = recordValue(job) ?? {}
                      const id = numberValue(record.id)
                      return (
                        <ReferenceRow key={id ?? index} title={id ? `Job #${id}` : `Job ${index + 1}`} meta={[stringValue(record.role), stringValue(record.status), stringValue(record.job_type)].filter(Boolean).join(' · ')}>
                          {id ? <AgentSurfaceLink href={agentJobHref(id, params)}>Open job</AgentSurfaceLink> : null}
                        </ReferenceRow>
                      )
                    })}
                  </ReferenceGroup>
                ) : null}
                {arrayValue(usages.decisions).length > 0 ? (
                  <ReferenceGroup title="Candidates And Selections">
                    {arrayValue(usages.decisions).map((decision, index) => {
                      const record = recordValue(decision) ?? {}
                      const id = numberValue(record.id)
                      const projectId = numberValue(record.project_id)
                      const candidateId = stringValue(record.candidate_id)
                      const targetRef = stringValue(record.target_ref) ?? ''
                      const contentUnitId = contentUnitIdFromTargetRef(targetRef)
                      return (
                        <ReferenceRow
                          key={`${id ?? index}-${stringValue(record.role) ?? ''}-${candidateId ?? ''}`}
                          title={candidateId ? `Candidate ${candidateId}` : id ? `Decision #${id}` : `Decision ${index + 1}`}
                          meta={[stringValue(record.role), targetRef].filter(Boolean).join(' · ')}
                        >
                          {projectId && contentUnitId ? (
                            <AgentSurfaceLink href={agentCandidatesHref(projectId, contentUnitId, candidateId, params)}>Open candidates</AgentSurfaceLink>
                          ) : null}
                        </ReferenceRow>
                      )
                    })}
                  </ReferenceGroup>
                ) : null}
                {arrayValue(usages.derivatives).length > 0 ? (
                  <ReferenceGroup title="Derivatives">
                    {arrayValue(usages.derivatives).map((derivative, index) => {
                      const record = recordValue(derivative) ?? {}
                      const id = numberValue(record.id)
                      return (
                        <ReferenceRow
                          key={id ?? index}
                          title={id ? `Derivative #${id}` : `Derivative ${index + 1}`}
                          meta={[stringValue(record.role), stringValue(record.operation), stringValue(record.tool)].filter(Boolean).join(' · ')}
                        />
                      )
                    })}
                  </ReferenceGroup>
                ) : null}
              </div>
            ) : (
              <p>No references found.</p>
            )}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Raw Resource">
            <AgentSurfaceJson value={resource} />
          </AgentSurfacePanel>
        </div>
      ) : (
        <div className="agent-surface-status">Resource not found.</div>
      )}
    </AgentSurfaceShell>
  )
}

function ReferenceGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="agent-surface-reference-group">
      <h3>{title}</h3>
      <div className="agent-surface-reference-list">{children}</div>
    </section>
  )
}

function ReferenceRow({ title, meta, children }: { title: string; meta: string; children?: ReactNode }) {
  return (
    <article className="agent-surface-reference-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      {children ? <div className="agent-surface-actions">{children}</div> : null}
    </article>
  )
}

function agentJobHref(jobId: number, params: URLSearchParams): string {
  return withAgentParams(`/agent/generation/jobs/${jobId}`, params)
}

function agentCandidatesHref(projectId: number, contentUnitId: string, candidateId: string | undefined, params: URLSearchParams): string {
  return withAgentParams('/agent/content/candidates', params, { projectId, contentUnitId, candidateId })
}

function contentUnitIdFromTargetRef(targetRef: string): string | undefined {
  const match = targetRef.match(/^content_units\/(.+)$/)
  return match?.[1]
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

function copyText(value: string, onCopyText?: (value: string) => void) {
  if (onCopyText) {
    onCopyText(value)
    return
  }
  void globalThis.navigator?.clipboard?.writeText(value)
}

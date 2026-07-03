import type { ReactNode } from 'react'
import type { AgentSurfaceSnapshot } from '../data.js'
import { arrayValue, numberValue, recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

export type AgentCandidateDecision = 'adopt' | 'reject' | 'defer'

export type AgentCandidateDecisionInput = {
  candidateId: string
  decision: AgentCandidateDecision
  resourceId?: string
}

export function AgentContentCandidatesSurface({
  ready,
  params,
  projectId,
  contentUnitId,
  candidateId,
  resourceId,
  snapshot,
  isLoading,
  error,
  resourcesById,
  renderResourcePreview,
  decisionPending = false,
  decisionError,
  decisionSuccess = false,
  onDecide,
}: {
  ready: boolean
  params: URLSearchParams
  projectId?: string
  contentUnitId?: string
  candidateId?: string
  resourceId?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: unknown
  resourcesById?: ReadonlyMap<number, unknown>
  renderResourcePreview?: (resource: unknown) => ReactNode
  decisionPending?: boolean
  decisionError?: unknown
  decisionSuccess?: boolean
  onDecide?: (input: AgentCandidateDecisionInput) => void
}) {
  const visibility = recordValue(snapshot?.data?.candidate_visibility)
  const candidates = arrayValue(visibility?.content_unit_candidates)
  const selectedCandidate = recordValue(visibility?.selected_candidate)
  const selectedResource = recordValue(visibility?.selected_raw_resource)
  const selectedCandidateId = stringValue(selectedCandidate?.id ?? selectedCandidate?.candidate_id)
  const selectedResourceId = stringValue(selectedResource?.resource_id ?? selectedResource?.resourceId)

  return (
    <AgentSurfaceShell
      title={contentUnitId ? `Candidate review: ${contentUnitId}` : 'Candidate review'}
      description="Compare content-unit candidates, inspect prompt snapshots, and decide adopt, reject, or defer."
      chips={[
        ...(projectId ? [`project: ${projectId}`] : []),
        ...(contentUnitId ? [`content unit: ${contentUnitId}`] : []),
        ...(candidateId ? [`candidate: ${candidateId}`] : []),
      ]}
      ready={ready}
      preparingLabel="Preparing candidate review surface..."
    >
      {!contentUnitId ? (
        <div className="agent-surface-status">Missing contentUnitId.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading candidate snapshot...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load candidate snapshot.'}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Target">
            <AgentSurfaceKeyValues items={[
              ['Project', projectId ?? ''],
              ['Content unit', contentUnitId ?? ''],
              ['Candidate', candidateId ?? ''],
              ['Resource', resourceId ?? ''],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Candidate State" description="Generated resources are candidates, not stable dependencies until adopted or selected.">
            <AgentSurfaceKeyValues items={[
              ['Candidate count', candidates.length],
              ['Selected candidate', selectedCandidateId ?? ''],
              ['Selected resource', selectedResourceId ?? ''],
              ['Stale status', stringValue(visibility?.stale_status) ?? ''],
            ]} />
            <div className="agent-surface-actions">
              <AgentSurfaceLink href={agentPromptHref(contentUnitId, params)}>Open prompt workbench</AgentSurfaceLink>
              {selectedResourceId ? (
                <AgentSurfaceLink href={agentResourceHref(selectedResourceId, params)}>Open selected resource</AgentSurfaceLink>
              ) : null}
            </div>
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Candidates" description="Selecting a candidate makes its output the stable dependency for downstream prompts and previews.">
            {candidates.length > 0 ? (
              <div className="agent-surface-candidate-list">
                {candidates.map((candidate, index) => {
                  const record = recordValue(candidate)
                  const id = stringValue(record?.id) ?? `candidate-${index + 1}`
                  const outputs = candidateOutputs(record)
                  const primaryResource = stringValue(outputs[0]?.resource_id ?? outputs[0]?.resourceId)
                  const job = stringValue(recordValue(record?.producer)?.job_id ?? recordValue(record?.producer)?.jobId)
                  const status = stringValue(record?.status) ?? 'generated'
                  const selected = selectedCandidateId !== undefined && id === selectedCandidateId
                  return (
                    <article key={id} className="agent-surface-candidate-card" data-selected={selected ? 'true' : undefined}>
                      <AgentSurfaceKeyValues items={[
                        ['Candidate', id],
                        ['State', selected ? 'selected stable dependency' : status],
                        ['Output count', outputs.length],
                        ['Primary resource', primaryResource ?? ''],
                        ['Job', job ?? ''],
                        ['Created', stringValue(record?.created_at) ?? ''],
                      ]} />
                      {outputs.length > 0 ? (
                        <div className="agent-surface-candidate-output-list">
                          {outputs.map((output, outputIndex) => {
                            const resource = stringValue(output.resource_id ?? output.resourceId)
                            const resourcePreview = resource ? resourcesById?.get(Number(resource)) : undefined
                            const outputSelected = selected && selectedResourceId !== undefined && resource === selectedResourceId
                            return (
                              <section
                                key={`${id}-output-${outputIndex}-${resource ?? 'none'}`}
                                className="agent-surface-candidate-output"
                                data-selected={outputSelected ? 'true' : undefined}
                              >
                                {resourcePreview && renderResourcePreview ? (
                                  <div className="agent-surface-candidate-preview">
                                    {renderResourcePreview(resourcePreview)}
                                  </div>
                                ) : resource ? (
                                  <div className="agent-surface-status">Resource preview loading or unavailable.</div>
                                ) : (
                                  <div className="agent-surface-status">No resource returned for this output.</div>
                                )}
                                <AgentSurfaceKeyValues items={[
                                  ['Output', outputLabel(output, outputIndex)],
                                  ['Kind', stringValue(output.kind) ?? ''],
                                  ['Resource', resource ?? ''],
                                ]} />
                                <div className="agent-surface-actions">
                                  {resource ? <AgentSurfaceLink href={agentResourceHref(resource, params)}>Open resource</AgentSurfaceLink> : null}
                                  <AgentDecisionButton
                                    decision="adopt"
                                    candidateId={id}
                                    resourceId={resource}
                                    selected={outputSelected}
                                    pending={decisionPending}
                                    onDecide={onDecide}
                                  />
                                </div>
                              </section>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="agent-surface-status">This candidate has not returned any output resource yet.</p>
                      )}
                      <div className="agent-surface-actions">
                        {job ? <AgentSurfaceLink href={agentJobHref(job, params, contentUnitId)}>Open generation job</AgentSurfaceLink> : null}
                      </div>
                      <div className="agent-surface-decision-row" aria-label={`Candidate ${id} decision actions`}>
                        <AgentDecisionButton
                          decision="reject"
                          candidateId={id}
                          resourceId={primaryResource}
                          selected={false}
                          pending={decisionPending}
                          onDecide={onDecide}
                        />
                        <AgentDecisionButton
                          decision="defer"
                          candidateId={id}
                          resourceId={primaryResource}
                          selected={false}
                          pending={decisionPending}
                          onDecide={onDecide}
                        />
                      </div>
                      <AgentSurfaceJson value={{
                        prompt_snapshot: record?.prompt_snapshot,
                        outputs: record?.outputs,
                        producer: record?.producer,
                      }} />
                    </article>
                  )
                })}
              </div>
            ) : (
              <p>No candidate has been created for this content unit yet.</p>
            )}
            {decisionError ? (
              <p className="agent-surface-callout agent-surface-callout--danger">{decisionError instanceof Error ? decisionError.message : 'Candidate decision failed.'}</p>
            ) : null}
            {decisionSuccess ? (
              <p className="agent-surface-callout">Decision recorded. This surface is refreshing the candidate state.</p>
            ) : null}
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Runtime And Selection">
            <AgentSurfaceJson value={{
              selected_candidate: selectedCandidate,
              selected_raw_resource: selectedResource,
              runtime_panel: snapshot?.data?.runtime_panel,
              selection_validity: snapshot?.data?.selection_validity,
            }} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

export function agentContentCandidateResourceIds(snapshot?: AgentSurfaceSnapshot): number[] {
  const visibility = recordValue(snapshot?.data?.candidate_visibility)
  return candidateResourceIds(arrayValue(visibility?.content_unit_candidates))
}

function AgentDecisionButton({
  decision,
  candidateId,
  resourceId,
  selected,
  pending,
  onDecide,
}: {
  decision: AgentCandidateDecision
  candidateId: string
  resourceId?: string
  selected: boolean
  pending: boolean
  onDecide?: (input: AgentCandidateDecisionInput) => void
}) {
  const label = decision === 'adopt' ? (selected ? 'Adopted' : 'Adopt') : decision === 'reject' ? 'Reject' : 'Defer'
  return (
    <button
      type="button"
      className="agent-surface-button"
      data-intent={decision}
      disabled={pending || !onDecide || (decision === 'adopt' && (selected || !resourceId))}
      onClick={() => onDecide?.({ candidateId, decision, resourceId })}
    >
      {label}
    </button>
  )
}

function candidateOutputs(candidate: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const outputs = arrayValue(candidate?.outputs)
  return outputs.map(recordValue).filter((output): output is Record<string, unknown> => Boolean(output))
}

function outputLabel(output: Record<string, unknown>, index: number): string {
  const metadata = recordValue(output.metadata)
  const rawIndex = numberValue(metadata?.output_index ?? metadata?.outputIndex)
  const displayIndex = rawIndex !== undefined && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex + 1 : index + 1
  const groupSize = numberValue(metadata?.group_size ?? metadata?.groupSize)
  return groupSize !== undefined && Number.isInteger(groupSize) && groupSize > 1
    ? `${displayIndex} / ${groupSize}`
    : String(displayIndex)
}

function candidateResourceIds(candidates: unknown[]): number[] {
  const ids = new Set<number>()
  for (const candidate of candidates) {
    const record = recordValue(candidate)
    for (const output of arrayValue(record?.outputs)) {
      const outputRecord = recordValue(output)
      const id = numberValue(outputRecord?.resource_id ?? outputRecord?.resourceId)
      if (id !== undefined && Number.isInteger(id) && id > 0) ids.add(id)
    }
  }
  return [...ids]
}

function agentResourceHref(resourceId: string, params: URLSearchParams): string {
  return withAgentParams(`/agent/resources/${resourceId}`, params)
}

function agentJobHref(jobId: string, params: URLSearchParams, contentUnitId: string): string {
  return withAgentParams(`/agent/generation/jobs/${jobId}`, params, { contentUnitId })
}

function agentPromptHref(contentUnitId: string, params: URLSearchParams): string {
  return withAgentParams('/agent/content/prompt', params, { contentUnitId })
}

function withAgentParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

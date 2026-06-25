import type { ReactNode } from 'react'
import { arrayValue, numberValue, recordValue, stringValue } from '../data.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from './AgentSurfaceShell.js'

type ResourceDiagnostic = {
  resource_id: number
  resource_type?: string
  provider_id?: string
  mode: string
  reason: string
  next_action?: string
  asset_uri?: string
  certification_status?: string
  trust?: Record<string, unknown>
}

export function AgentGenerationJobSurface({
  ready,
  params,
  jobId,
  routeContentUnitId,
  job,
  isLoading,
  error,
  renderResourcePreview,
}: {
  ready: boolean
  params: URLSearchParams
  jobId?: number
  routeContentUnitId?: string
  job?: Record<string, unknown>
  isLoading?: boolean
  error?: unknown
  renderResourcePreview?: (resource: unknown) => ReactNode
}) {
  const outputResources = outputResourcesFromJob(job)
  const outputResourceIds = outputResourceIdsFromJob(job, outputResources)
  const inputResourceIds = inputResourceIdsFromJob(job)
  const extraParams = parseJSONValue(stringValue(job?.extra_params))
  const requestContext = parseJSONValue(stringValue(job?.request_context))
  const stateTrace = parseJSONValue(stringValue(job?.state_trace))
  const debugInfo = parseJSONValue(stringValue(job?.debug_info))
  const resourceDiagnostics = resourceDiagnosticsFromDebugInfo(debugInfo)
  const candidateBinding = candidateBindingFromRequestContext(requestContext)
  const contentUnitId = routeContentUnitId ?? stringValue(candidateBinding?.content_unit_id ?? candidateBinding?.contentUnitId)
  const candidateId = stringValue(candidateBinding?.candidate_id ?? candidateBinding?.candidateId)
  const candidateWriteState = candidateWriteStateFromJob(job, candidateBinding, outputResourceIds)
  const firstOutputResourceId = outputResourceIds[0]

  return (
    <AgentSurfaceShell
      title={jobId ? `Generation job #${jobId}` : 'Generation job'}
      description="Monitor the provider job, inspect inputs, and review generated output resources."
      chips={[
        ...(stringValue(job?.status) ? [`status: ${stringValue(job?.status)}`] : []),
        ...(contentUnitId ? [`content unit: ${contentUnitId}`] : []),
      ]}
      ready={ready}
      preparingLabel="Preparing generation job surface..."
    >
      {jobId === undefined ? (
        <div className="agent-surface-status">Missing jobId.</div>
      ) : isLoading ? (
        <div className="agent-surface-status">Loading job...</div>
      ) : error ? (
        <div className="agent-surface-status">{error instanceof Error ? error.message : 'Failed to load job.'}</div>
      ) : job ? (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Status">
            <AgentSurfaceKeyValues items={[
              ['ID', numberValue(job.ID) ?? ''],
              ['Status', stringValue(job.status) ?? ''],
              ['Type', stringValue(job.job_type) ?? ''],
              ['Model', stringValue(job.model_display ?? job.model_id) ?? ''],
              ['Provider', stringValue(job.provider_name) ?? ''],
              ['Provider task', stringValue(job.provider_task_id) ?? ''],
              ['Provider status', stringValue(job.provider_task_status) ?? ''],
              ['Project', numberValue(job.project_id) ?? ''],
              ['Started', stringValue(job.started_at) ?? ''],
              ['Finished', stringValue(job.finished_at) ?? ''],
            ]} />
            {stringValue(job.error_msg) ? (
              <div className="agent-surface-callout agent-surface-callout--danger">
                {stringValue(job.error_msg)}
              </div>
            ) : null}
          </AgentSurfacePanel>

          <AgentSurfacePanel title="Output Resources" description="Generated RawResources become stable project state only after candidate and adoption/selection decisions.">
            {outputResources.length > 0 || outputResourceIds.length > 0 ? (
              <div className="agent-surface-resource-grid">
                {outputResources.map((resource) => {
                  const resourceId = numberValue(resource.ID)
                  return (
                    <article key={resourceId} className="agent-surface-resource-card">
                      {renderResourcePreview ? renderResourcePreview(resource) : null}
                      <AgentSurfaceKeyValues items={[
                        ['Resource ID', resourceId ?? ''],
                        ['Name', stringValue(resource.name) ?? ''],
                        ['Type', stringValue(resource.type) ?? ''],
                        ['URL', stringValue(resource.url) ?? ''],
                      ]} />
                      {resourceId ? <AgentSurfaceLink href={agentResourceHref(resourceId, params)}>Open resource detail</AgentSurfaceLink> : null}
                    </article>
                  )
                })}
                {outputResourceIds.filter((id) => !outputResources.some((resource) => numberValue(resource.ID) === id)).map((id) => (
                  <article key={id} className="agent-surface-resource-card">
                    <AgentSurfaceKeyValues items={[
                      ['Resource ID', id],
                      ['Preview', 'Not embedded in this job response'],
                    ]} />
                    <AgentSurfaceLink href={agentResourceHref(id, params)}>Open resource detail</AgentSurfaceLink>
                  </article>
                ))}
              </div>
            ) : (
              <p>No output resource is available yet.</p>
            )}
          </AgentSurfacePanel>

          <AgentSurfacePanel title="Generation Input">
            <AgentSurfaceKeyValues items={[
              ['Prompt', stringValue(job.prompt) ?? ''],
              ['Input resources', inputResourceIds.length > 0 ? inputResourceIds.join(', ') : ''],
              ['Aspect ratio', stringValue(job.aspect_ratio) ?? ''],
              ['Duration', numberValue(job.duration) ?? ''],
            ]} />
            {inputResourceIds.length > 0 ? (
              <div className="agent-surface-actions">
                {inputResourceIds.map((id) => (
                  <AgentSurfaceLink key={id} href={agentResourceHref(id, params)}>Resource #{id}</AgentSurfaceLink>
                ))}
              </div>
            ) : null}
          </AgentSurfacePanel>

          {resourceDiagnostics.length > 0 ? (
            <AgentSurfacePanel title="Input Resource Decisions" description="Backend decisions for provider asset:// use, trust context, and fallback handling.">
              <div className="agent-surface-decision-list">
                {resourceDiagnostics.map((diagnostic) => (
                  <article key={diagnostic.resource_id} className="agent-surface-decision-card">
                    <AgentSurfaceKeyValues items={[
                      ['Resource', `#${diagnostic.resource_id}${diagnostic.resource_type ? ` · ${diagnostic.resource_type}` : ''}`],
                      ['Mode', diagnostic.mode],
                      ['Reason', diagnostic.reason],
                      ['Provider', diagnostic.provider_id ?? ''],
                      ['Asset URI', diagnostic.asset_uri ?? ''],
                      ['Certification', diagnostic.certification_status ?? ''],
                      ['Next action', diagnostic.next_action ?? ''],
                    ]} />
                    {diagnostic.trust ? <AgentSurfaceJson value={{ trust: diagnostic.trust }} /> : null}
                  </article>
                ))}
              </div>
            </AgentSurfacePanel>
          ) : null}

          {contentUnitId ? (
            <AgentSurfacePanel title="Candidate Write" description="Generated output is not a stable dependency until candidate creation and adoption/selection are visible.">
              <AgentSurfaceKeyValues items={[
                ['Content unit', contentUnitId],
                ['Candidate ID', candidateId ?? ''],
                ['Output kind', stringValue(candidateBinding?.output_kind ?? candidateBinding?.outputKind) ?? ''],
                ['Policy', candidateBinding ? 'auto create/update from job result' : 'unknown'],
                ['State', candidateWriteState],
              ]} />
              <div className="agent-surface-actions">
                <AgentSurfaceLink href={agentCandidatesHref(contentUnitId, params, { candidateId, resourceId: firstOutputResourceId })}>Open candidate review</AgentSurfaceLink>
                <AgentSurfaceLink href={agentPromptHref(contentUnitId, params)}>Open prompt workbench</AgentSurfaceLink>
                {firstOutputResourceId ? <AgentSurfaceLink href={agentResourceHref(firstOutputResourceId, params)}>Open first output resource</AgentSurfaceLink> : null}
              </div>
              <AgentSurfaceJson value={{
                content_unit_candidate: candidateBinding,
                prompt_snapshot: recordValue(candidateBinding?.prompt_snapshot ?? candidateBinding?.promptSnapshot),
              }} />
            </AgentSurfacePanel>
          ) : null}

          <AgentSurfacePanel title="Provider Context">
            <AgentSurfaceJson value={{
              extra_params: extraParams,
              request_context: requestContext,
              state_trace: stateTrace,
              provider_task_history: job.provider_task_history,
            }} />
          </AgentSurfacePanel>

          <AgentSurfacePanel title="Raw Job">
            <AgentSurfaceJson value={{
              ...job,
              extra_params: extraParams,
              request_context: requestContext,
              state_trace: stateTrace,
              debug_info: debugInfo,
              error_msg: job.error_msg,
              output_resource_ids: outputResourceIds,
            }} />
          </AgentSurfacePanel>
        </div>
      ) : null}
    </AgentSurfaceShell>
  )
}

function outputResourcesFromJob(job: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  if (!job) return []
  const resources: Array<Record<string, unknown>> = []
  const single = job.output_resource
  const singleRecord = recordValue(single)
  if (isRawResourceLike(singleRecord)) resources.push(singleRecord)
  for (const value of arrayValue(job.output_resources)) {
    const resource = recordValue(value)
    if (isRawResourceLike(resource)) resources.push(resource)
  }
  return resources
}

function outputResourceIdsFromJob(job: Record<string, unknown> | undefined, outputResources: Array<Record<string, unknown>>): number[] {
  if (!job) return []
  const ids = new Set<number>()
  for (const resource of outputResources) {
    const id = numberValue(resource.ID)
    if (id !== undefined && id > 0) ids.add(id)
  }
  const outputResourceId = numberValue(job.output_resource_id)
  if (outputResourceId !== undefined && outputResourceId > 0) ids.add(outputResourceId)
  for (const value of arrayValue(job.output_resource_ids)) {
    const id = numberValue(value)
    if (id !== undefined && Number.isInteger(id) && id > 0) ids.add(id)
  }
  return [...ids]
}

function inputResourceIdsFromJob(job: Record<string, unknown> | undefined): number[] {
  if (!job) return []
  const ids = new Set<number>()
  const inputResourceId = numberValue(job.input_resource_id)
  if (inputResourceId !== undefined && inputResourceId > 0) ids.add(inputResourceId)
  const parsed = parseJSONValue(stringValue(job.input_resource_ids))
  if (Array.isArray(parsed)) {
    for (const value of parsed) {
      const id = Number(value)
      if (Number.isInteger(id) && id > 0) ids.add(id)
    }
  }
  for (const value of arrayValue(job.input_resources)) {
    const id = numberValue(recordValue(value)?.ID)
    if (id !== undefined && id > 0) ids.add(id)
  }
  return [...ids]
}

function candidateBindingFromRequestContext(value: unknown): Record<string, unknown> | undefined {
  const context = recordValue(value)
  return recordValue(context?.content_unit_candidate ?? context?.contentUnitCandidate)
}

function resourceDiagnosticsFromDebugInfo(value: unknown): ResourceDiagnostic[] {
  const record = recordValue(value)
  const diagnostics = record?.resource_diagnostics
  if (!Array.isArray(diagnostics)) return []
  return diagnostics.filter(isResourceDiagnostic)
}

function isResourceDiagnostic(value: unknown): value is ResourceDiagnostic {
  const record = recordValue(value)
  return Boolean(record) && typeof record?.resource_id === 'number' && typeof record?.mode === 'string' && typeof record?.reason === 'string'
}

function candidateWriteStateFromJob(job: Record<string, unknown> | undefined, candidateBinding: Record<string, unknown> | undefined, outputResourceIds: number[]): string {
  if (!candidateBinding) return outputResourceIds.length > 0 ? 'raw_resource_output_only' : 'not_content_unit_candidate_flow'
  if (!job) return 'unknown'
  const status = stringValue(job.status)
  if (status === 'pending' || status === 'running') return 'waiting_for_provider_result'
  if (status === 'failed' || status === 'cancelled') return 'candidate_failed_with_generation_job'
  if (status === 'succeeded' && outputResourceIds.length === 0) return 'succeeded_without_output_resource'
  if (status === 'succeeded') return 'output_ready_for_candidate_review'
  return 'unknown'
}

function isRawResourceLike(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value) && typeof value?.ID === 'number'
}

function parseJSONValue(value: string | undefined): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function agentResourceHref(resourceId: number, params: URLSearchParams): string {
  return withAgentParams(`/agent/resources/${resourceId}`, params)
}

function agentCandidatesHref(contentUnitId: string, params: URLSearchParams, extra: { candidateId?: string; resourceId?: number } = {}): string {
  return withAgentParams('/agent/content/candidates', params, { contentUnitId, ...extra })
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

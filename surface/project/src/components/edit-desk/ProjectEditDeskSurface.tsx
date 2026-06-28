import type { AgentSurfaceSnapshot } from '../../data.js'
import {
  agentSurfaceDomainFocus,
  agentSurfaceFocusChips,
  agentSurfaceFocusLabel,
  agentSurfaceLegacyProductionId,
  agentSurfaceSnapshotDomainFocus,
  arrayValue,
  numberValue,
  recordValue,
  stringValue,
} from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import {
  AgentSurfaceJson,
  AgentSurfaceKeyValues,
  AgentSurfaceLink,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'

type ProjectEditDeskReadModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProjectEditDeskSurfaceProps {
  params?: URLSearchParams
  productionId?: string
  readModelStatus?: ProjectEditDeskReadModelStatus
  readModel?: unknown
  snapshot?: AgentSurfaceSnapshot
  error?: Error
}

interface WorkflowRequiredAssetRow {
  id: string
  title: string
  type: string
  contentUnitId?: string
  sceneId?: string
  expressionUnitId?: string
  targetRef?: string
  candidateCount: number
  selectedCandidate?: string
  selectedResource?: string
  blockers: string[]
  raw: Record<string, unknown>
}

interface WorkflowAssetManifestRow {
  id: string
  title: string
  type: string
  contentUnitId?: string
  candidateId?: string
  resourceId?: string
  status: 'selected' | 'needs_selection' | 'missing_candidate'
  raw: Record<string, unknown>
}

interface WorkflowEditRow {
  id: string
  title: string
  target: string
  status: string
  clipCount: number
  blockerCount: number
  editingProjectId?: string
  raw: Record<string, unknown>
}

interface WorkflowRenderRow {
  id: string
  title: string
  status: string
  resourceId?: string
  editingProjectId?: string
  raw: Record<string, unknown>
}

interface WorkflowArtifactDebugView {
  schema: 'movscript.workflow_artifact_debug_view.v1'
  requiredAssets: WorkflowRequiredAssetRow[]
  assetManifest: WorkflowAssetManifestRow[]
  editDecisions: WorkflowEditRow[]
  renderReport: WorkflowRenderRow[]
  blockers: Array<Record<string, unknown>>
  debug: Record<string, number>
  raw: Record<string, unknown>
}

export function ProjectEditDeskSurface({
  params = new URLSearchParams(),
  productionId,
  readModelStatus = 'idle',
  readModel,
  snapshot,
  error,
}: ProjectEditDeskSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const domainFocus = agentSurfaceSnapshotDomainFocus(snapshot)
    ?? agentSurfaceDomainFocus(params, { projectId: runtime.project.projectId, productionId })
  const legacyProductionId = agentSurfaceLegacyProductionId(domainFocus, productionId)
  const focusLabel = agentSurfaceFocusLabel(domainFocus, legacyProductionId ? `production: ${legacyProductionId}` : '')
  const debugView = buildWorkflowArtifactDebugView({ readModel, snapshot })

  return (
    <AgentSurfaceShell
      title="Edit desk"
      description="Review and edit the OpenMontage-style workflow handoff: required assets, selected assets, edit decisions, and render results."
      chips={[
        ...agentSurfaceFocusChips(domainFocus),
        `project: ${runtime.project.projectId}`,
        'surface: edit-desk',
      ]}
      ready
    >
      {readModelStatus === 'loading' ? (
        <div className="agent-surface-status">Loading edit desk...</div>
      ) : error ? (
        <div className="agent-surface-status">{error.message}</div>
      ) : (
        <div className="agent-surface-grid">
          <AgentSurfacePanel title="Workflow Scope">
            <AgentSurfaceKeyValues items={[
              ['Project', runtime.project.projectId],
              ['Focus', focusLabel],
              ['Assembly target', domainFocus.target?.targetRef ?? ''],
              ['Legacy production', legacyProductionId ?? ''],
              ['Read model', readModelStatus],
              ['Generated', snapshot?.generated_at ?? ''],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Artifact Counts">
            <AgentSurfaceKeyValues items={[
              ['Required assets', debugView.requiredAssets.length],
              ['Manifest assets', debugView.assetManifest.length],
              ['Edit decisions', debugView.editDecisions.length],
              ['Render reports', debugView.renderReport.length],
              ['Blockers', debugView.blockers.length],
              ['Selected resources', debugView.debug.selectedResourceCount],
            ]} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Required Assets" description="Each row is a MovScript ContentUnit viewed as an OpenMontage required asset. Edit prompts or review candidates from here.">
            <RequiredAssetsList rows={debugView.requiredAssets} params={params} projectId={runtime.project.projectId} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Asset Manifest" description="Selected or pending candidate/resource outputs that can feed the edit handoff.">
            <AssetManifestList rows={debugView.assetManifest} params={params} projectId={runtime.project.projectId} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Edit Decisions" description="Editing handoff rows derived from selected resources or existing MediaEditingProjects.">
            <EditDecisionList rows={debugView.editDecisions} params={params} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Render Report" description="Final output state stays in render/media-pipeline results; source JSON is not rewritten here.">
            <RenderReportList rows={debugView.renderReport} params={params} />
          </AgentSurfacePanel>
          <AgentSurfacePanel title="Raw Workflow Debug View">
            <AgentSurfaceJson value={debugView} />
          </AgentSurfacePanel>
        </div>
      )}
    </AgentSurfaceShell>
  )
}

function RequiredAssetsList({
  rows,
  params,
  projectId,
}: {
  rows: WorkflowRequiredAssetRow[]
  params: URLSearchParams
  projectId?: string
}) {
  if (rows.length === 0) return <p>No ContentUnit rows are available for this edit desk yet.</p>
  return (
    <div className="agent-surface-work-list">
      {rows.map((row) => (
        <article key={row.id} className="agent-surface-work-card" data-severity={row.blockers.length > 0 ? 'warning' : 'suggestion'}>
          <div className="agent-surface-work-card__heading">
            <strong>{row.title}</strong>
            <span>{[
              row.type,
              row.contentUnitId ? `content unit ${row.contentUnitId}` : undefined,
              row.sceneId ? `scene ${row.sceneId}` : undefined,
              row.expressionUnitId ? `expression ${row.expressionUnitId}` : undefined,
            ].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="agent-surface-tag-row">
            <span className="agent-surface-tag">candidates {row.candidateCount}</span>
            <span className="agent-surface-tag">{row.selectedCandidate ? `selected ${row.selectedCandidate}` : 'selection missing'}</span>
            {row.selectedResource ? <span className="agent-surface-tag">resource {row.selectedResource}</span> : null}
          </div>
          {row.blockers.length > 0 ? <p>{row.blockers.join(' · ')}</p> : null}
          <div className="agent-surface-actions">
            {row.contentUnitId ? <AgentSurfaceLink href={withParams('/agent/content/prompt', params, { projectId, contentUnitId: row.contentUnitId })}>Edit prompt</AgentSurfaceLink> : null}
            {row.contentUnitId ? <AgentSurfaceLink href={withParams('/agent/content/candidates', params, { projectId, contentUnitId: row.contentUnitId, candidateId: row.selectedCandidate })}>Review candidates</AgentSurfaceLink> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function AssetManifestList({
  rows,
  params,
  projectId,
}: {
  rows: WorkflowAssetManifestRow[]
  params: URLSearchParams
  projectId?: string
}) {
  if (rows.length === 0) return <p>No selected assets are ready for the manifest yet.</p>
  return (
    <div className="agent-surface-work-list">
      {rows.map((row) => (
        <article key={row.id} className="agent-surface-work-card" data-severity={row.status === 'selected' ? 'suggestion' : 'warning'}>
          <div className="agent-surface-work-card__heading">
            <strong>{row.title}</strong>
            <span>{[
              row.type,
              row.contentUnitId ? `content unit ${row.contentUnitId}` : undefined,
              row.candidateId ? `candidate ${row.candidateId}` : undefined,
              row.resourceId ? `resource ${row.resourceId}` : undefined,
            ].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="agent-surface-tag-row">
            <span className="agent-surface-tag">{row.status}</span>
          </div>
          <div className="agent-surface-actions">
            {row.resourceId ? <AgentSurfaceLink href={withParams(`/agent/resources/${row.resourceId}`, params, { projectId })}>Open resource</AgentSurfaceLink> : null}
            {row.contentUnitId ? <AgentSurfaceLink href={withParams('/agent/content/candidates', params, { projectId, contentUnitId: row.contentUnitId, candidateId: row.candidateId, resourceId: row.resourceId })}>Edit selection</AgentSurfaceLink> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function EditDecisionList({ rows, params }: { rows: WorkflowEditRow[]; params: URLSearchParams }) {
  if (rows.length === 0) return <p>No edit decisions are ready. Select resources first, then generate the editing handoff.</p>
  return (
    <div className="agent-surface-work-list">
      {rows.map((row) => (
        <article key={row.id} className="agent-surface-work-card" data-severity={row.blockerCount > 0 ? 'blocking' : 'suggestion'}>
          <div className="agent-surface-work-card__heading">
            <strong>{row.title}</strong>
            <span>{[row.target, row.status, `${row.clipCount} clips`, `${row.blockerCount} blockers`].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="agent-surface-actions">
            {row.editingProjectId ? <AgentSurfaceLink href={withParams(`/editing/${row.editingProjectId}`, params)}>Open editing project</AgentSurfaceLink> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function RenderReportList({ rows, params }: { rows: WorkflowRenderRow[]; params: URLSearchParams }) {
  if (rows.length === 0) return <p>No render report is available yet. Render results should appear here after MediaPipeline finishes.</p>
  return (
    <div className="agent-surface-work-list">
      {rows.map((row) => (
        <article key={row.id} className="agent-surface-work-card" data-severity={row.status === 'failed' ? 'blocking' : 'suggestion'}>
          <div className="agent-surface-work-card__heading">
            <strong>{row.title}</strong>
            <span>{[row.status, row.resourceId ? `resource ${row.resourceId}` : undefined].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="agent-surface-actions">
            {row.resourceId ? <AgentSurfaceLink href={withParams(`/agent/resources/${row.resourceId}`, params)}>Open output</AgentSurfaceLink> : null}
            {row.editingProjectId ? <AgentSurfaceLink href={withParams(`/editing/${row.editingProjectId}`, params)}>Open editing project</AgentSurfaceLink> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function buildWorkflowArtifactDebugView({
  readModel,
  snapshot,
}: {
  readModel?: unknown
  snapshot?: AgentSurfaceSnapshot
}): WorkflowArtifactDebugView {
  const readModelRecord = recordValue(recordValue(readModel)?.projectReadModel ?? readModel) ?? {}
  const summary = recordValue(snapshot?.data?.status_summary)
  const timelineStatus = projectTimelineStatus(readModelRecord, summary)
  const contentUnits = contentUnitRows(readModelRecord, summary)
  const requiredAssets = contentUnits.map(requiredAssetRow)
  const assetManifest = requiredAssets.flatMap(assetManifestRows)
  const editingTimelines = editingTimelineRows(readModelRecord, snapshot)
  const editDecisions = editingTimelines.length > 0 ? editingTimelines : derivedEditDecisionRows(assetManifest)
  const renderReport = renderReportRows(timelineStatus, editDecisions)
  const blockers = [
    ...requiredAssets.flatMap((row) => row.blockers.map((blocker) => ({
      artifact: 'required_assets',
      content_unit_id: row.contentUnitId,
      message: blocker,
    }))),
    ...editDecisions.flatMap((row) => row.blockerCount > 0 ? [{
      artifact: 'edit_decisions',
      target: row.target,
      blocker_count: row.blockerCount,
    }] : []),
  ]

  return {
    schema: 'movscript.workflow_artifact_debug_view.v1',
    requiredAssets,
    assetManifest,
    editDecisions,
    renderReport,
    blockers,
    debug: {
      sourceEntityCount: numberValue(timelineStatus?.timeline_namespace_count ?? timelineStatus?.timelineNamespaceCount) ?? 0,
      contentUnitCount: contentUnits.length,
      candidateCount: requiredAssets.reduce((sum, row) => sum + row.candidateCount, 0),
      selectedCandidateCount: requiredAssets.filter((row) => row.selectedCandidate).length,
      selectedResourceCount: requiredAssets.filter((row) => row.selectedResource).length,
      editingProjectCount: editDecisions.filter((row) => row.editingProjectId).length,
      renderTaskCount: renderReport.length,
    },
    raw: {
      project_timeline_status: timelineStatus,
      status_summary: summary,
      read_model: readModelRecord,
    },
  }
}

function projectTimelineStatus(readModel: Record<string, unknown>, summary: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const overview = recordValue(readModel.overview)
  return recordValue(readModel.projectTimelineStatus)
    ?? recordValue(readModel.project_timeline_status)
    ?? recordValue(overview?.projectTimelineStatus)
    ?? recordValue(overview?.project_timeline_status)
    ?? recordValue(summary?.project_timeline_status)
    ?? recordValue(summary?.projectTimelineStatus)
}

function contentUnitRows(readModel: Record<string, unknown>, summary: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const overview = recordValue(readModel.overview)
  const contentSummary = recordValue(readModel.contentSummary)
    ?? recordValue(readModel.content_summary)
    ?? recordValue(overview?.content)
  const readiness = recordValue(readModel.readiness)
    ?? recordValue(overview?.readiness)
  const timelineStatus = projectTimelineStatus(readModel, summary)
  const firstProduction = recordValue(arrayValue(summary?.productions)[0])
  const candidates = [
    readModel.contentUnits,
    readModel.content_units,
    contentSummary?.items,
    contentSummary?.contentUnits,
    contentSummary?.content_units,
    readiness?.contentUnits,
    readiness?.content_units,
    firstProduction?.content_units,
    firstProduction?.contentUnits,
    timelineStatus?.timeline_assemblies,
    timelineStatus?.timelineAssemblies,
  ]
  for (const candidate of candidates) {
    const rows = arrayValue(candidate).map(recordValue).filter(isRecord)
    if (rows.length > 0) return rows
  }
  return []
}

function requiredAssetRow(row: Record<string, unknown>, index: number): WorkflowRequiredAssetRow {
  const contentUnitId = stringValue(row.content_unit_id ?? row.contentUnitId ?? row.id)
  const candidateIds = arrayValue(row.candidate_ids ?? row.candidateIds ?? row.candidates)
    .map((candidate) => stringValue(recordValue(candidate)?.id ?? recordValue(candidate)?.candidate_id ?? candidate))
    .filter(isString)
  const candidateCount = numberValue(row.candidate_count ?? row.candidateCount) ?? candidateIds.length
  const selectedCandidate = stringValue(
    row.selected_candidate
      ?? row.selectedCandidate
      ?? recordValue(row.selection)?.candidate_id
      ?? recordValue(row.selection)?.candidateId,
  )
  const selectedResource = stringValue(
    row.selected_resource
      ?? row.selectedResource
      ?? recordValue(row.selection)?.resource_id
      ?? recordValue(row.selection)?.resourceId,
  )
  const blockers = arrayValue(row.blocking_refs ?? row.blockingRefs)
    .map((value) => stringValue(value) ?? stringValue(recordValue(value)?.message))
    .filter(isString)
  if (candidateCount > 0 && !selectedCandidate) blockers.push('selection_missing')
  return {
    id: contentUnitId ?? `required-asset-${index + 1}`,
    title: stringValue(row.title ?? row.name) ?? contentUnitId ?? `Required asset ${index + 1}`,
    type: stringValue(row.output_kind ?? row.outputKind ?? row.content_unit_type ?? row.contentUnitType ?? row.type) ?? 'unknown',
    ...(contentUnitId ? { contentUnitId } : {}),
    ...(stringValue(row.scene_moment_id ?? row.sceneMomentId ?? row.scene_id ?? row.sceneId) ? { sceneId: stringValue(row.scene_moment_id ?? row.sceneMomentId ?? row.scene_id ?? row.sceneId) } : {}),
    ...(stringValue(row.expression_unit_id ?? row.expressionUnitId) ? { expressionUnitId: stringValue(row.expression_unit_id ?? row.expressionUnitId) } : {}),
    ...(stringValue(row.target_ref ?? row.targetRef) ? { targetRef: stringValue(row.target_ref ?? row.targetRef) } : {}),
    candidateCount,
    ...(selectedCandidate ? { selectedCandidate } : {}),
    ...(selectedResource ? { selectedResource } : {}),
    blockers: uniqueStrings(blockers),
    raw: row,
  }
}

function assetManifestRows(row: WorkflowRequiredAssetRow): WorkflowAssetManifestRow[] {
  if (row.selectedResource) {
    return [{
      id: `asset-${row.contentUnitId ?? row.id}-${row.selectedResource}`,
      title: row.title,
      type: row.type,
      contentUnitId: row.contentUnitId,
      candidateId: row.selectedCandidate,
      resourceId: row.selectedResource,
      status: 'selected',
      raw: row.raw,
    }]
  }
  if (row.candidateCount > 0) {
    return [{
      id: `asset-${row.contentUnitId ?? row.id}-needs-selection`,
      title: row.title,
      type: row.type,
      contentUnitId: row.contentUnitId,
      candidateId: row.selectedCandidate,
      status: 'needs_selection',
      raw: row.raw,
    }]
  }
  return [{
    id: `asset-${row.contentUnitId ?? row.id}-missing-candidate`,
    title: row.title,
    type: row.type,
    contentUnitId: row.contentUnitId,
    status: 'missing_candidate',
    raw: row.raw,
  }]
}

function editingTimelineRows(readModel: Record<string, unknown>, snapshot: AgentSurfaceSnapshot | undefined): WorkflowEditRow[] {
  const rows = [
    ...arrayValue(readModel.editingTimelines),
    ...arrayValue(readModel.editing_timelines),
    ...arrayValue(recordValue(readModel.workspace)?.editingTimelines),
    ...arrayValue(recordValue(readModel.workspace)?.editing_timelines),
  ].map(recordValue).filter(isRecord)
  const productionTimeline = recordValue(snapshot?.data?.production_timeline)
  if (productionTimeline) rows.unshift(productionTimeline)
  return rows.map(editingTimelineRow)
}

function editingTimelineRow(row: Record<string, unknown>, index: number): WorkflowEditRow {
  const mediaEditingProject = recordValue(row.mediaEditingProject ?? row.media_editing_project)
  const timeline = recordValue(mediaEditingProject?.timeline)
  const tracks = arrayValue(timeline?.tracks)
  const clipCount = tracks.reduce((count: number, track: unknown) => count + arrayValue(recordValue(track)?.clips).length, 0)
    || arrayValue(row.clips).length
  const blockers = arrayValue(row.blockers)
  const target = [
    stringValue(row.targetKind ?? row.target_kind),
    stringValue(row.targetRef ?? row.target_ref ?? row.targetId ?? row.target_id),
  ].filter(Boolean).join(':') || `edit-decision-${index + 1}`
  return {
    id: stringValue(row.id) ?? stringValue(mediaEditingProject?.id) ?? `edit-decision-${index + 1}`,
    title: stringValue(mediaEditingProject?.title ?? row.title) ?? target,
    target,
    status: stringValue(row.status) ?? (blockers.length > 0 ? 'blocked' : 'ready_to_edit'),
    clipCount,
    blockerCount: blockers.length,
    editingProjectId: stringValue(mediaEditingProject?.id),
    raw: row,
  }
}

function derivedEditDecisionRows(assetManifest: WorkflowAssetManifestRow[]): WorkflowEditRow[] {
  const selectedAssets = assetManifest.filter((row) => row.status === 'selected' && row.resourceId)
  const blockers = assetManifest.filter((row) => row.status !== 'selected').length
  if (selectedAssets.length === 0 && blockers === 0) return []
  return [{
    id: 'derived-edit-decisions',
    title: 'Derived edit handoff',
    target: 'timeline_assembly:draft',
    status: blockers > 0 ? 'blocked' : 'ready_to_handoff',
    clipCount: selectedAssets.length,
    blockerCount: blockers,
    raw: {
      cuts: selectedAssets.map((asset, index) => ({
        id: `cut_${index + 1}`,
        source: asset.resourceId,
        content_unit_id: asset.contentUnitId,
        candidate_id: asset.candidateId,
      })),
    },
  }]
}

function renderReportRows(timelineStatus: Record<string, unknown> | undefined, editRows: WorkflowEditRow[]): WorkflowRenderRow[] {
  const renderReports = [
    ...arrayValue(timelineStatus?.render_reports),
    ...arrayValue(timelineStatus?.renderReports),
  ].map(recordValue).filter(isRecord)
  if (renderReports.length > 0) {
    return renderReports.map((row, index) => ({
      id: stringValue(row.id) ?? `render-report-${index + 1}`,
      title: stringValue(row.title ?? row.output_path ?? row.outputPath) ?? `Render report ${index + 1}`,
      status: stringValue(row.status) ?? 'unknown',
      resourceId: stringValue(row.resource_id ?? row.resourceId),
      editingProjectId: stringValue(row.editing_project_id ?? row.editingProjectId),
      raw: row,
    }))
  }
  return editRows
    .filter((row) => row.editingProjectId)
    .map((row) => ({
      id: `render-ready-${row.id}`,
      title: `Render pending: ${row.title}`,
      status: row.blockerCount > 0 ? 'blocked' : 'ready_to_render',
      editingProjectId: row.editingProjectId,
      raw: row.raw,
    }))
}

function withParams(pathname: string, params: URLSearchParams, extra: Record<string, string | number | undefined> = {}): string {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && String(value).trim()) next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value)
}

function isString(value: string | undefined): value is string {
  return Boolean(value)
}

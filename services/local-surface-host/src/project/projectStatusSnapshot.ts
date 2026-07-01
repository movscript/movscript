import {
  arrayValue,
  recordValue,
  stringValue,
  type AgentSurfaceSnapshot,
} from '@movscript/project-surface/data'
import type { MovScriptNormalizedFocus } from '@movscript/domain'
import type { ProjectReadModelResponse } from './localProjectSurfaceRuntime.js'

export function projectReadModelToStatusSnapshot({
  readModel,
  projectId,
  projectDir,
  productionId,
  domainFocus,
}: {
  readModel: ProjectReadModelResponse
  projectId: string
  projectDir: string
  productionId?: string
  domainFocus?: MovScriptNormalizedFocus
}): AgentSurfaceSnapshot {
  const model = recordValue(readModel.projectReadModel) ?? {}
  return {
    schema: 'movscript.agent_surface_snapshot.v1',
    status: 'ok',
    surface: 'project.status',
    generated_at: new Date().toISOString(),
    target: {
      project_id: projectId,
      project_dir: projectDir,
      ...(productionId ? { production_id: productionId } : {}),
      ...targetFieldsForDomainFocus(domainFocus),
    },
    data: {
      project_read_model: model,
      status_summary: projectReadModelToStatusSummary(model, {
        projectId,
        productionId,
        domainFocus,
      }),
    },
  }
}

export function projectReadModelToStatusSummary(
  model: Record<string, unknown>,
  target: { projectId: string; productionId?: string; domainFocus?: MovScriptNormalizedFocus },
): Record<string, unknown> {
  const overview = recordValue(model.overview)
  const workspace = recordValue(model.workspace) ?? recordValue(overview?.workspace)
  const projectTimelineStatus = recordValue(model.projectTimelineStatus ?? model.project_timeline_status ?? overview?.projectTimelineStatus ?? overview?.project_timeline_status)
  const productionSummary = recordValue(model.productionSummary ?? overview?.production)
  const contentSummary = recordValue(model.contentSummary ?? overview?.content)
  const readiness = recordValue(model.readiness ?? overview?.readiness)
  const contentUnits = readModelContentUnits(contentSummary, readiness)
  const productionItems = arrayValue(productionSummary?.items ?? productionSummary?.productions ?? productionSummary?.productionItems)
  const firstProduction = recordValue(productionItems[0])
  const productionId = target.productionId
    ?? stringValue(firstProduction?.production_id ?? firstProduction?.productionId ?? firstProduction?.id)
    ?? stringValue(workspace?.productionId ?? workspace?.production_id)
    ?? 'default'

  return {
    schema: 'movscript.production_status_summary.v1',
    project_id: target.projectId,
    legacy_alias: true,
    preferred_schema: 'movscript.project_timeline_status.v1',
    ...targetFieldsForDomainFocus(target.domainFocus),
    ...(projectTimelineStatus ? {
      project_timeline_status: projectTimelineStatus,
      namespace_vocabulary: projectTimelineStatus.namespace_vocabulary,
      timeline_namespaces: projectTimelineStatus.timeline_namespaces,
    } : {}),
    productions: [
      {
        production_id: productionId,
        title: stringValue(firstProduction?.title ?? firstProduction?.name)
          ?? stringValue(workspace?.title)
          ?? target.projectId,
        content_units: contentUnits,
        blocking_refs: arrayValue(readiness?.blocking_refs ?? readiness?.blockingRefs),
        stale_status: stringValue(model.status ?? overview?.status) ?? 'unknown',
        job_status: stringValue(readiness?.job_status ?? readiness?.jobStatus) ?? 'not_tracked_in_project_read_model',
      },
    ],
  }
}

export function targetFieldsForDomainFocus(focus: MovScriptNormalizedFocus | undefined): Record<string, unknown> {
  if (!focus) return {}
  return {
    domain_focus: focus,
    ...(focus.scope ? {
      timeline_scope_kind: focus.scope.kind,
      timeline_scope_ref: focus.scope.ref,
    } : {}),
    ...(focus.target?.targetCategory ? { target_category: focus.target.targetCategory } : {}),
    ...(focus.target?.targetKind ? { target_kind: focus.target.targetKind } : {}),
    ...(focus.target?.targetRef ? { target_ref: focus.target.targetRef } : {}),
  }
}

function readModelContentUnits(
  contentSummary: Record<string, unknown> | undefined,
  readiness: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const items = arrayValue(
    contentSummary?.items
      ?? contentSummary?.content_units
      ?? contentSummary?.contentUnits
      ?? readiness?.content_units
      ?? readiness?.contentUnits,
  )
  return items.map((item, index) => readModelContentUnit(recordValue(item) ?? { value: item }, index))
}

function readModelContentUnit(unit: Record<string, unknown>, index: number): Record<string, unknown> {
  const contentUnitId = stringValue(unit.content_unit_id ?? unit.contentUnitId ?? unit.id ?? unit.uid)
    ?? `content-unit-${index + 1}`
  const candidateIds = arrayValue(unit.candidate_ids ?? unit.candidateIds ?? unit.candidates)
    .map((candidate) => stringValue(recordValue(candidate)?.id ?? recordValue(candidate)?.candidate_id ?? candidate))
    .filter((value): value is string => Boolean(value))
  const selectedCandidate = stringValue(
    unit.selected_candidate
      ?? unit.selectedCandidate
      ?? recordValue(unit.selection)?.candidate_id
      ?? recordValue(unit.selection)?.candidateId,
  )
  const selectedResource = stringValue(
    unit.selected_resource
      ?? unit.selectedResource
      ?? recordValue(unit.selection)?.resource_id
      ?? recordValue(unit.selection)?.resourceId,
  )
  const candidateCount = Number(unit.candidate_count ?? unit.candidateCount ?? candidateIds.length)

  return {
    content_unit_id: contentUnitId,
    title: stringValue(unit.title ?? unit.name) ?? contentUnitId,
    output_kind: stringValue(unit.output_kind ?? unit.outputKind ?? unit.kind ?? unit.type) ?? 'unknown',
    candidate_count: Number.isFinite(candidateCount) ? candidateCount : candidateIds.length,
    ...(selectedCandidate ? { selected_candidate: selectedCandidate } : {}),
    ...(selectedResource ? { selected_resource: selectedResource } : {}),
    blocking_refs: arrayValue(unit.blocking_refs ?? unit.blockingRefs),
    candidate_ids: candidateIds,
  }
}

import type { MovScriptWorkspaceDomainIndex } from '@movscript/workspace/indexer'
import {
  canonicalEntities,
  entityDir,
  entityRef,
  idField,
  recordField,
  stringField,
} from './derivedArtifactHelpers.js'
import type {
  MovScriptImpactReportArtifact,
  MovScriptProductionWorkItem,
  MovScriptProductionWorkItemBlocker,
  MovScriptProductionWorkPlan,
  MovScriptProductionWorkPlanSourceIssue,
} from './derivedArtifactTypes.js'
import type {
  ContentUnitDerivedArtifactBundle,
  ContentUnitOutputKind,
  ContentUnitPromptBlocker,
} from './contentProductionTypes.js'

export function deriveProductionWorkPlan(input: {
  index: MovScriptWorkspaceDomainIndex
  contentUnitArtifacts: readonly ContentUnitDerivedArtifactBundle[]
  impactReport: MovScriptImpactReportArtifact
  sourceIssues?: readonly MovScriptProductionWorkPlanSourceIssue[]
  changedEntities?: readonly { entityKind: string; id?: string | number; path: string; state: string }[]
  interpretationId?: string
  createdAt: string
}): MovScriptProductionWorkPlan {
  const sourceIssues = input.sourceIssues ?? []
  const items = [
    ...sourceIssues.map((issue, index) => fixSourceWorkItem(issue, index)),
    ...contentUnitWorkItems(input.index, input.contentUnitArtifacts),
    ...affectedOutputWorkItems(input.impactReport),
  ].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))

  return {
    schema: 'movscript.production_work_plan.v1',
    created_at: input.createdAt,
    project: projectRef(input.index),
    source_status: {
      ready_to_interpret: !sourceIssues.some((issue) => issue.severity === 'error'),
      has_pending_edits: (input.changedEntities?.length ?? input.impactReport.changedEntities.length) > 0,
      issue_count: sourceIssues.length,
    },
    interpret_status: {
      status: 'current',
      interpretation_id: input.interpretationId,
      interpreted_at: input.createdAt,
    },
    items,
    summary: {
      open: items.filter((item) => item.status === 'open' || item.status === 'ready' || item.status === 'blocked').length,
      blocking: items.filter((item) => item.severity === 'blocking' || item.status === 'blocked').length,
      human_recommended: items.filter((item) => item.recommended_actor === 'human').length,
      agent_recommended: items.filter((item) => item.recommended_actor === 'agent').length,
      ready_to_generate: items.filter((item) => item.kind === 'generate_candidates' && item.status === 'ready').length,
      stale_selections: items.filter((item) => item.kind === 'review_stale_selection').length,
    },
  }
}

function fixSourceWorkItem(
  issue: MovScriptProductionWorkPlanSourceIssue,
  index: number,
): MovScriptProductionWorkItem {
  const severity = issue.severity === 'error' ? 'blocking' : 'warning'
  return {
    id: stableWorkItemId('fix_source', issue.path, issue.message, index),
    kind: 'fix_source',
    status: issue.severity === 'error' ? 'blocked' : 'open',
    severity,
    priority: issue.severity === 'error' ? 10 : 30,
    reason: issue.message,
    target: {
      entityKind: 'source_file',
      path: issue.path,
    },
    blockers: issue.severity === 'error' ? [{
      code: 'source_issue',
      message: issue.message,
    }] : undefined,
    allowed_actors: ['human', 'agent'],
    recommended_actor: issue.message.includes('schema validation failed') ? 'agent' : 'human',
    actions: [{
      type: 'open_editor',
      entityKind: 'source_file',
      path: issue.path,
    }],
    evidence: {
      severity: issue.severity,
      path: issue.path,
    },
  }
}

function contentUnitWorkItems(
  index: MovScriptWorkspaceDomainIndex,
  artifacts: readonly ContentUnitDerivedArtifactBundle[],
): MovScriptProductionWorkItem[] {
  const items: MovScriptProductionWorkItem[] = []
  for (const artifact of artifacts) {
    const contentUnitRef = contentUnitTarget(artifact)
    const candidateCount = contentUnitCandidateCount(index, entityDir(artifact.contentUnitPath))
    const blockers = blockersFor(artifact.dependencyReport.blockers ?? artifact.generationPrompt.blockers ?? [])
    const hasBlockingIssue = blockers.length > 0 || artifact.dependencyReport.issues.some((issue) => issue.severity === 'error')
    if (hasBlockingIssue) {
      items.push({
        id: stableWorkItemId('content_unit_blocked', String(artifact.contentUnitId)),
        kind: 'edit_structure',
        status: 'blocked',
        severity: 'blocking',
        priority: 20,
        reason: `Content unit ${String(artifact.contentUnitId)} has unresolved production inputs.`,
        target: contentUnitRef,
        blockers: blockers.length > 0 ? blockers : artifact.dependencyReport.issues.map((issue) => ({
          code: 'content_unit_issue',
          message: issue.message,
        })),
        allowed_actors: ['human', 'agent'],
        recommended_actor: 'agent',
        actions: [
          {
            type: 'open_editor',
            entityKind: 'content_unit',
            entityId: artifact.contentUnitId,
            path: artifact.contentUnitPath,
          },
          {
            type: 'derive_content_unit_artifact',
            contentUnitId: artifact.contentUnitId,
          },
        ],
        evidence: {
          runtimeStatus: artifact.runtimePanel.status,
          blockerCodes: blockers.map((blocker) => blocker.code),
          issueCount: artifact.dependencyReport.issues.length,
        },
      })
      continue
    }

    if (artifact.selectionValidity.stale) {
      items.push({
        id: stableWorkItemId('review_stale_selection', String(artifact.contentUnitId), String(artifact.selectionValidity.candidate_id ?? '')),
        kind: 'review_stale_selection',
        status: 'open',
        severity: 'warning',
        priority: 40,
        reason: `Selected candidate for content unit ${String(artifact.contentUnitId)} is stale.`,
        target: contentUnitRef,
        allowed_actors: ['human', 'agent'],
        recommended_actor: 'human',
        actions: [
          {
            type: 'open_candidate_picker',
            contentUnitId: artifact.contentUnitId,
          },
          {
            type: 'agent_review_candidates',
            contentUnitId: artifact.contentUnitId,
          },
          {
            type: 'generate_candidates',
            contentUnitId: artifact.contentUnitId,
            capability: actionCapability(artifact.runtimePanel.output_kind),
            suggestedCandidateCount: 2,
          },
          {
            type: 'accept_stale',
            contentUnitId: artifact.contentUnitId,
          },
        ],
        evidence: {
          candidateId: artifact.selectionValidity.candidate_id,
          resourceId: artifact.selectionValidity.resource_id,
          staleReasons: artifact.selectionValidity.stale_reasons ?? [],
        },
      })
      continue
    }

    if (!artifact.selectionValidity.selected && candidateCount > 0) {
      items.push({
        id: stableWorkItemId('select_candidate', String(artifact.contentUnitId)),
        kind: 'select_candidate',
        status: 'ready',
        severity: 'warning',
        priority: 50,
        reason: `Content unit ${String(artifact.contentUnitId)} has candidates but no selected candidate.`,
        target: contentUnitRef,
        allowed_actors: ['human', 'agent', 'workflow'],
        recommended_actor: 'human',
        actions: [
          {
            type: 'open_candidate_picker',
            contentUnitId: artifact.contentUnitId,
          },
          {
            type: 'agent_review_candidates',
            contentUnitId: artifact.contentUnitId,
          },
        ],
        evidence: {
          candidateCount,
        },
      })
      continue
    }

    if (artifact.runtimePanel.status === 'ready' && !artifact.selectionValidity.selected) {
      items.push({
        id: stableWorkItemId('generate_candidates', String(artifact.contentUnitId)),
        kind: 'generate_candidates',
        status: 'ready',
        severity: 'suggestion',
        priority: 60,
        reason: `Content unit ${String(artifact.contentUnitId)} is ready to generate candidates.`,
        target: contentUnitRef,
        allowed_actors: ['agent', 'workflow'],
        recommended_actor: 'agent',
        actions: [
          {
            type: 'derive_content_unit_artifact',
            contentUnitId: artifact.contentUnitId,
          },
          {
            type: 'generate_candidates',
            contentUnitId: artifact.contentUnitId,
            capability: actionCapability(artifact.runtimePanel.output_kind),
            suggestedCandidateCount: 2,
          },
        ],
        evidence: {
          outputKind: artifact.runtimePanel.output_kind,
          capability: artifact.runtimePanel.runtime_request?.capability,
        },
      })
    }
  }
  return items
}

function affectedOutputWorkItems(impactReport: MovScriptImpactReportArtifact): MovScriptProductionWorkItem[] {
  const items: MovScriptProductionWorkItem[] = []
  const seen = new Set<string>()
  for (const change of impactReport.changedEntities) {
    for (const contentUnit of change.affectedContentUnits) {
      const key = `${String(contentUnit.id ?? contentUnit.path)}:${change.entityKind}:${String(change.id ?? change.path)}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        id: stableWorkItemId('review_affected_output', key),
        kind: 'review_affected_output',
        status: 'informational',
        severity: 'suggestion',
        priority: 80,
        reason: `${change.entityKind} change may affect content unit ${String(contentUnit.id ?? contentUnit.path)}.`,
        target: contentUnit,
        upstream: [{
          entityKind: change.entityKind,
          ...(change.id !== undefined ? { id: change.id } : {}),
          path: change.path,
        }],
        allowed_actors: ['human', 'workflow'],
        recommended_actor: 'human',
        actions: [{
          type: 'open_editor',
          entityKind: 'content_unit',
          entityId: contentUnit.id,
          path: contentUnit.path,
        }],
        evidence: {
          changedEntity: change,
          staleMarkers: change.staleMarkers,
        },
      })
    }
  }
  return items
}

function projectRef(index: MovScriptWorkspaceDomainIndex) {
  const project = canonicalEntities(index).find((entity) => entity.entityKind === 'project')
  return project ? entityRef(project) : undefined
}

function contentUnitTarget(artifact: ContentUnitDerivedArtifactBundle) {
  return {
    entityKind: 'content_unit',
    id: artifact.contentUnitId,
    path: artifact.contentUnitPath,
  }
}

function contentUnitCandidateCount(index: MovScriptWorkspaceDomainIndex, contentUnitRef: string): number {
  const candidateIds = new Set<string>()
  for (const document of index.documents) {
    if (!document.path.startsWith(`${contentUnitRef}/candidates/`)) continue
    if (!document.path.endsWith('/content_candidate.json')) continue
    const record = recordField(document.data)
    const id = idField(record?.id)
    if (id !== undefined) candidateIds.add(String(id))
  }
  for (const document of index.documents) {
    const context = recordField(document.data)
    if (context?.schema !== 'movscript.decision_context.v1') continue
    if (context.target_kind !== 'content_unit' || context.target_ref !== contentUnitRef) continue
    const candidates = Array.isArray(context.candidates) ? context.candidates : []
    for (const candidate of candidates) {
      const id = idField(recordField(candidate)?.id)
      if (id !== undefined) candidateIds.add(String(id))
    }
  }
  return candidateIds.size
}

function blockersFor(blockers: readonly ContentUnitPromptBlocker[]): MovScriptProductionWorkItemBlocker[] {
  return blockers.map((blocker) => ({
    code: blocker.code,
    message: blocker.message,
    ...(stringField(blocker.ref) ? { ref: stringField(blocker.ref) } : {}),
  }))
}

function actionCapability(outputKind: ContentUnitOutputKind): 'image' | 'video' | 'audio' | 'text' {
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'audio' || outputKind === 'text') return outputKind
  return 'text'
}

function stableWorkItemId(...parts: Array<string | number | undefined>): string {
  return parts
    .filter((part) => part !== undefined && String(part).trim() !== '')
    .map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter(Boolean)
    .join(':')
}

import type {
  ContentCandidateRecord,
  ContentSelectionRecord,
  ContentSourceWorkspaceSnapshot,
} from './sourceWorkspaceData.js'

export function buildContentSourceWorkspaceProjectTimelineStatus(
  snapshot: ContentSourceWorkspaceSnapshot,
  contentUnitSummaries: Array<Record<string, unknown>> = contentSourceWorkspaceContentUnitStatusSummaries(snapshot),
): Record<string, unknown> {
  const namespaceVocabulary = snapshot.namespaceVocabulary ?? {
    timelineTemplate: undefined,
    timelineNamespaces: [],
    settingNamespaces: [],
    diagnostics: [],
  }
  const timelineNamespaceNodes = (snapshot.domainNodes ?? [])
    .filter((node) => node.category === 'timeline_namespace')
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || String(left.path ?? left.id ?? '').localeCompare(String(right.path ?? right.id ?? ''), 'zh-CN'))
  const timelineNamespaces = timelineNamespaceNodes.map((node) => {
    const parent = domainParentRefForNode(snapshot, node)
    const record = domainRecordForNode(snapshot, node)
    const productionType = stringField(record?.production_type ?? record?.productionType ?? record?.timeline_profile ?? record?.timelineProfile)
    const nodeTimelineNamespaces = stringArrayField(record?.timeline_namespaces ?? record?.timelineNamespaces)
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      path: node.path,
      order: node.order,
      entity_kind: stringField(node.metadata?.entityKind),
      ...(productionType ? { production_type: productionType } : {}),
      ...(nodeTimelineNamespaces.length ? { timeline_namespaces: nodeTimelineNamespaces } : {}),
      ...(parent ? { parent } : {}),
    }
  })
  const timelineAssemblies = timelineAssemblyStatusEntries(snapshot, contentUnitSummaries)
  const hasBlockingRefs = timelineAssemblies.some((item) => arrayValue(item.blocking_refs).length > 0)
  const hasStaleSelection = timelineAssemblies.some((item) => {
    const staleStatus = stringField(item.stale_status)
    return staleStatus === 'has_stale_selection' || staleStatus === 'stale'
  })
  return {
    schema: 'movscript.project_timeline_status.v1',
    status: hasBlockingRefs ? 'blocked' : hasStaleSelection ? 'needs_review' : 'ok',
    namespace_vocabulary: {
      timeline_template: namespaceVocabulary.timelineTemplate,
      timeline_namespaces: namespaceVocabulary.timelineNamespaces,
      setting_namespaces: namespaceVocabulary.settingNamespaces,
      diagnostics: namespaceVocabulary.diagnostics,
    },
    timeline_namespace_count: timelineNamespaces.length,
    timeline_namespaces: timelineNamespaces,
    timeline_assembly_count: timelineAssemblies.length,
    timeline_assemblies: timelineAssemblies,
    system_primitives: {
      scene_moments_count: snapshot.sceneMoments.length,
      expression_units_count: snapshot.expressionUnits.length,
      storyboards_count: snapshot.storyboards.length,
      keyframes_count: snapshot.keyframes.length,
      audio_cues_count: snapshot.audioCues.length,
      assets_count: snapshot.assets.length,
    },
    legacy_aliases: {
      productions: 'timeline_namespaces',
      segments: 'timeline_namespaces',
      production_ref: 'timeline_assembly_ref',
      segment_ref: 'timeline_assembly_ref',
    },
  }
}

export function contentSourceWorkspaceContentUnitStatusSummaries(
  snapshot: ContentSourceWorkspaceSnapshot,
): Array<Record<string, unknown>> {
  const candidatesByContentUnit = contentCandidateRecordsByContentUnitId(snapshot.indexDocuments)
  const selectionsByContentUnit = selectionRecordsByContentUnitId(snapshot.indexDocuments)
  return snapshot.contentUnits.map((unit) => summarizeContentUnitStatus(unit, candidatesByContentUnit, selectionsByContentUnit))
}

function timelineAssemblyStatusEntries(
  snapshot: ContentSourceWorkspaceSnapshot,
  contentUnitSummaries: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const contentUnitById = new Map(snapshot.contentUnits.map((unit) => [String(entityId(unit)), unit]))
  return contentUnitSummaries
    .filter((summary) => isTimelineAssemblyContentUnitSummary(summary))
    .map((summary) => {
      const contentUnitId = idField(summary.content_unit_id)
      const unit = contentUnitById.get(String(contentUnitId))
      const scope = unit ? timelineAssemblyScopeRefForContentUnit(snapshot, unit) : undefined
      return {
        assembly_ref: summary.target_ref,
        content_unit_id: contentUnitId,
        title: summary.title,
        path: summary.path,
        content_unit_type: summary.content_unit_type,
        target_kind: 'timeline_assembly',
        target_ref: summary.target_ref,
        output_kind: summary.output_kind,
        candidate_count: summary.candidate_count,
        candidate_ids: summary.candidate_ids,
        selected_candidate: summary.selected_candidate,
        selected_resource: summary.selected_resource,
        stale_status: summary.stale_status,
        blocking_refs: summary.blocking_refs,
        ...(scope ? { scope } : {}),
      }
    })
}

function summarizeContentUnitStatus(
  unit: ContentSourceWorkspaceSnapshot['contentUnits'][number],
  candidatesByContentUnit: Map<string, ContentCandidateRecord[]>,
  selectionsByContentUnit: Map<string, ContentSelectionRecord>,
): Record<string, unknown> {
  const id = entityId(unit)
  const contentUnitId = String(id)
  const candidates = candidatesByContentUnit.get(contentUnitId) ?? []
  const selection = selectionsByContentUnit.get(contentUnitId)
  const selectedCandidate = selection?.candidate_id !== undefined
    ? candidates.find((candidate) => sameId(candidate.id, selection.candidate_id))
    : undefined
  const selectedResourceId = numberField(selection?.resource_id) ?? numberField(firstCandidateOutput(selectedCandidate)?.resource_id)
  return {
    content_unit_id: id,
    title: stringField(unit.record.title),
    path: unit.path,
    content_unit_type: stringField(unit.record.content_unit_type),
    output_kind: stringField(unit.record.output_kind),
    target_kind: stringField(unit.record.target_kind),
    target_ref: idField(unit.record.target_ref),
    candidate_count: candidates.length,
    candidate_ids: candidates.map((candidate) => idField(candidate.id)).filter((value) => value !== undefined),
    selected_candidate: selection?.candidate_id,
    selected_resource: selectedResourceId,
    stale_status: stringField(selection?.stale_policy) === 'accept_stale' ? 'accepted_stale' : 'ok',
    blocking_refs: selection?.candidate_id === undefined && candidates.length > 0 ? ['selection_missing'] : [],
  }
}

function isTimelineAssemblyContentUnitSummary(summary: Record<string, unknown>): boolean {
  const type = stringField(summary.content_unit_type)
  const targetKind = stringField(summary.target_kind)
  const targetRef = stringField(summary.target_ref)
  return type === 'timeline_assembly_ref'
    || targetKind === 'timeline_assembly'
    || Boolean(targetRef?.startsWith('timeline_assembly:'))
}

function timelineAssemblyScopeRefForContentUnit(
  snapshot: ContentSourceWorkspaceSnapshot,
  unit: ContentSourceWorkspaceSnapshot['contentUnits'][number],
): Record<string, unknown> | undefined {
  const edge = (snapshot.domainEdges ?? []).find((candidate) =>
    candidate.relation === 'scope'
    && candidate.target.category === 'timeline_namespace'
    && domainRefMatchesEntity(candidate.source, unit))
  if (!edge) return undefined
  return {
    category: edge.target.category,
    kind: edge.target.kind,
    id: edge.target.id,
    path: edge.target.path,
  }
}

function domainParentRefForNode(
  snapshot: ContentSourceWorkspaceSnapshot,
  node: NonNullable<ContentSourceWorkspaceSnapshot['domainNodes']>[number],
): Record<string, unknown> | undefined {
  const edge = (snapshot.domainEdges ?? []).find((candidate) =>
    candidate.relation === 'parent'
    && candidate.target.category === node.category
    && domainRefMatchesNode(candidate.source, node))
  return edge ? {
    id: edge.target.id,
    kind: edge.target.kind,
    path: edge.target.path,
  } : undefined
}

function domainRecordForNode(
  snapshot: ContentSourceWorkspaceSnapshot,
  node: NonNullable<ContentSourceWorkspaceSnapshot['domainNodes']>[number],
): Record<string, unknown> | undefined {
  const entityKind = stringField(node.metadata?.entityKind)
  const entities = entityKind === 'production'
    ? snapshot.productions
    : entityKind === 'segment'
      ? snapshot.segments
      : []
  return entities.find((entity) =>
    (node.path !== undefined && entity.path === node.path)
    || (node.id !== undefined && sameId(idField(entity.id ?? entity.record.id ?? entity.record.ID ?? entity.path), node.id))
  )?.record
}

function domainRefMatchesNode(
  ref: { id?: string | number; path?: string; kind?: string; category?: string },
  node: { id?: string | number; path?: string; kind?: string; category?: string },
): boolean {
  return ref.category === node.category
    && ref.kind === node.kind
    && (
      sameId(ref.id, node.id)
      || (ref.path !== undefined && ref.path === node.path)
    )
}

function domainRefMatchesEntity(
  ref: { id?: string | number; path?: string },
  entity: ContentSourceWorkspaceSnapshot['contentUnits'][number],
): boolean {
  return sameId(ref.id, entityId(entity))
    || (ref.path !== undefined && ref.path === entity.path)
}

function contentCandidateRecordsByContentUnitId(
  documents: ContentSourceWorkspaceSnapshot['indexDocuments'],
): Map<string, ContentCandidateRecord[]> {
  const output = new Map<string, ContentCandidateRecord[]>()
  for (const document of documents) {
    if (!document.path.endsWith('/content_candidate.json') || !isRecord(document.data)) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.content_unit_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, [...(output.get(contentUnitId) ?? []), document.data as ContentCandidateRecord])
  }
  return output
}

function selectionRecordsByContentUnitId(
  documents: ContentSourceWorkspaceSnapshot['indexDocuments'],
): Map<string, ContentSelectionRecord> {
  const output = new Map<string, ContentSelectionRecord>()
  for (const document of documents) {
    if (!isRecord(document.data)) continue
    const selection = isRecord(document.data.selection) ? document.data.selection : undefined
    if (!selection) continue
    const contentUnitId = contentUnitIdForRuntimeDocument(document.path, stringField(document.data.target_ref))
    if (!contentUnitId) continue
    output.set(contentUnitId, {
      ...(idField(selection.candidate_id) !== undefined ? { candidate_id: idField(selection.candidate_id) } : {}),
      ...(numberField(selection.resource_id) !== undefined ? { resource_id: numberField(selection.resource_id) } : {}),
      ...(stringField(selection.stale_policy) ? { stale_policy: stringField(selection.stale_policy) } : {}),
    })
  }
  return output
}

function entityId(entity: ContentSourceWorkspaceSnapshot['contentUnits'][number]): string | number {
  return idField(entity.id ?? entity.record.id ?? entity.record.ID ?? pathSegmentAfter(entity.path, 'content_units') ?? entity.path) ?? entity.path
}

function contentUnitIdForRuntimeDocument(path: string, ref?: string): string | undefined {
  if (ref) return lastPathSegment(ref) ?? ref
  return pathSegmentAfter(path, 'content_units')
}

function firstCandidateOutput(candidate: ContentCandidateRecord | undefined): Record<string, unknown> | undefined {
  const outputs = Array.isArray(candidate?.outputs) ? candidate.outputs : []
  return outputs.find(isRecord)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringField(value: unknown): string | undefined {
  const id = idField(value)
  return id === undefined ? undefined : String(id)
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function lastPathSegment(path: string | undefined): string | undefined {
  return path?.split('/').filter(Boolean).at(-1)
}

function sameId(left: unknown, right: unknown): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import type { ContentSourceWorkspaceData } from '@movscript/core/content'
import type {
  PreviewAssetCandidate,
  PreviewAssetReferenceUnit,
  PreviewCandidate,
  PreviewContentUnit,
  SelectionState,
} from '@movscript/project-surface/data'

export interface SessionContentUnitView {
  id: string
  title: string
  type: string
  outputKind: string
  path: string
  editPrompt: string
  selectionState: SelectionState
  candidates: SessionCandidateView[]
}

export interface SessionCandidateView {
  id: string
  title: string
  model: string
  note: string
  selected?: boolean
  resourceId?: number
}

export function sessionContentUnitsFromWorkspaceData(
  data: ContentSourceWorkspaceData | undefined,
  contentUnitIds: Set<string>,
): SessionContentUnitView[] {
  if (!data || contentUnitIds.size === 0) return []
  const units = new Map<string, SessionContentUnitView>()
  for (const moment of data.previewMoments) {
    for (const expressionUnit of moment.expressionUnits) {
      const unit = contentUnitViewFromPreviewUnit(expressionUnit.contentUnit, expressionUnit.title)
      if (contentUnitIds.has(unit.id)) units.set(unit.id, unit)
    }
  }
  for (const assetUnit of Object.values(data.assetReferenceUnits)) {
    const unit = contentUnitViewFromAssetUnit(assetUnit)
    if (contentUnitIds.has(unit.id)) units.set(unit.id, unit)
  }
  for (const [contentUnitId, candidates] of Object.entries(data.contentUnitCandidates ?? {})) {
    if (!contentUnitIds.has(contentUnitId)) continue
    const candidateViews = candidates.map(candidateViewFromPreviewCandidate)
    const current = units.get(contentUnitId)
    units.set(contentUnitId, current
      ? { ...current, candidates: candidateViews }
      : contentUnitViewFromCandidateIndex(contentUnitId, candidates))
  }
  return Array.from(units.values()).sort((left, right) => left.title.localeCompare(right.title))
}

export function sessionContentUnitsFromReadModel(value: unknown): SessionContentUnitView[] {
  const payload = recordValue(value)
  const model = recordValue(payload?.projectContentUnitsReadModel ?? value)
  const items = arrayValue(model?.contentUnits ?? model?.content_units)
  return items
    .map(sessionContentUnitViewFromRecord)
    .filter((unit): unit is SessionContentUnitView => Boolean(unit))
    .sort((left, right) => left.title.localeCompare(right.title))
}

function sessionContentUnitViewFromRecord(value: unknown): SessionContentUnitView | undefined {
  const record = recordValue(value)
  const id = stringValue(record?.id ?? record?.contentUnitId ?? record?.content_unit_id)
  if (!record || !id) return undefined
  return {
    id,
    title: stringValue(record.title ?? record.name) ?? id,
    type: stringValue(record.type ?? record.content_unit_type ?? record.contentUnitType) ?? 'content_unit',
    outputKind: stringValue(record.outputKind ?? record.output_kind) ?? 'unknown',
    path: stringValue(record.path ?? record.__workspace_path) ?? `content_units/${id}/content_unit.json`,
    editPrompt: stringValue(record.editPrompt ?? record.edit_prompt) ?? '',
    selectionState: selectionStateValue(record.selectionState ?? record.selection_state),
    candidates: arrayValue(record.candidates).map(sessionCandidateViewFromRecord).filter((candidate): candidate is SessionCandidateView => Boolean(candidate)),
  }
}

function sessionCandidateViewFromRecord(value: unknown): SessionCandidateView | undefined {
  const record = recordValue(value)
  const id = stringValue(record?.id ?? record?.candidateId ?? record?.candidate_id)
  if (!record || !id) return undefined
  return {
    id,
    title: stringValue(record.title ?? record.name) ?? id,
    model: stringValue(record.model ?? record.model_id ?? record.provider) ?? '',
    note: stringValue(record.note ?? record.notes ?? record.reason) ?? '',
    selected: record.selected === true,
    ...(numberValue(record.resourceId ?? record.resource_id) !== undefined ? { resourceId: numberValue(record.resourceId ?? record.resource_id) } : {}),
  }
}

function contentUnitViewFromPreviewUnit(unit: PreviewContentUnit, ownerTitle: string): SessionContentUnitView {
  return {
    id: unit.id,
    title: ownerTitle || unit.id,
    type: unit.type,
    outputKind: unit.outputKind,
    path: unit.path,
    editPrompt: unit.editPrompt,
    selectionState: unit.selectionState,
    candidates: unit.candidates.map(candidateViewFromPreviewCandidate),
  }
}

function contentUnitViewFromAssetUnit(unit: PreviewAssetReferenceUnit): SessionContentUnitView {
  return {
    id: unit.contentUnitId,
    title: unit.title || unit.contentUnitId,
    type: unit.contentUnitType,
    outputKind: unit.outputKind,
    path: unit.path,
    editPrompt: unit.editPrompt,
    selectionState: unit.selectionState,
    candidates: unit.candidates.map(candidateViewFromAssetCandidate),
  }
}

function contentUnitViewFromCandidateIndex(contentUnitId: string, candidates: PreviewCandidate[]): SessionContentUnitView {
  const selectedCandidate = candidates.find((candidate) => candidate.selected)
  const resourceKind = candidates.map((candidate) => candidate.resourceKind).find(Boolean)
  return {
    id: contentUnitId,
    title: contentUnitId,
    type: 'content_unit',
    outputKind: resourceKind ?? 'unknown',
    path: `content_units/${contentUnitId}/content_unit.json`,
    editPrompt: '',
    selectionState: selectedCandidate ? 'selected' : 'ready',
    candidates: candidates.map(candidateViewFromPreviewCandidate),
  }
}

function candidateViewFromPreviewCandidate(candidate: PreviewCandidate): SessionCandidateView {
  return {
    id: candidate.id,
    title: candidate.title || candidate.id,
    model: candidate.model,
    note: candidate.note,
    selected: candidate.selected,
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
  }
}

function candidateViewFromAssetCandidate(candidate: PreviewAssetCandidate): SessionCandidateView {
  return {
    ...candidateViewFromPreviewCandidate(candidate),
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
  }
}

function selectionStateValue(value: unknown): SelectionState {
  return value === 'selected' || value === 'stale' || value === 'needs_candidate' || value === 'ready'
    ? value
    : 'ready'
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

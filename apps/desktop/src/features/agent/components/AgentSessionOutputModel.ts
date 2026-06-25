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

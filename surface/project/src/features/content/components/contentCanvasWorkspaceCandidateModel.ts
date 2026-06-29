import type { ContentCanvasCommandResult } from '../application/contentCanvasCommands'
import type { ContentCanvasCandidate, ContentCanvasProjectData } from '../domain/contentCanvasTypes'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export type LocalContentCanvasCandidates = Record<string, ContentCanvasCandidate[]>

export type LocalContentCanvasRemovedCandidates = Record<string, string[]>

export function mergeContentCanvasCommandCandidates(
  current: LocalContentCanvasCandidates,
  result: Pick<ContentCanvasCommandResult, 'createdCandidates'>,
): LocalContentCanvasCandidates {
  if (!result.createdCandidates?.length) return current
  let changed = false
  const next: LocalContentCanvasCandidates = { ...current }
  for (const entry of result.createdCandidates) {
    const candidates = next[entry.contentUnitId] ?? []
    const existingIndex = candidates.findIndex((candidate) => candidate.id === entry.candidate.id)
    if (existingIndex >= 0 && candidates[existingIndex] === entry.candidate) continue
    const nextCandidates = existingIndex >= 0
      ? candidates.map((candidate, index) => index === existingIndex ? entry.candidate : candidate)
      : [...candidates, entry.candidate]
    next[entry.contentUnitId] = nextCandidates
    changed = true
  }
  return changed ? next : current
}

export function mergeContentCanvasCommandSelections(
  current: CandidateSelections,
  result: Pick<ContentCanvasCommandResult, 'selectedCandidates'>,
): CandidateSelections {
  if (!result.selectedCandidates?.length) return current
  let changed = false
  const next: CandidateSelections = { ...current }
  for (const selection of result.selectedCandidates) {
    if (next[selection.contentUnitId] === selection.candidateId) continue
    next[selection.contentUnitId] = selection.candidateId
    changed = true
  }
  return changed ? next : current
}

export function mergeContentCanvasCommandRemovedCandidates(
  current: LocalContentCanvasRemovedCandidates,
  result: Pick<ContentCanvasCommandResult, 'removedCandidates'>,
): LocalContentCanvasRemovedCandidates {
  if (!result.removedCandidates?.length) return current
  let changed = false
  const next: LocalContentCanvasRemovedCandidates = { ...current }
  for (const removed of result.removedCandidates) {
    const rows = next[removed.contentUnitId] ?? []
    if (rows.includes(removed.candidateId)) continue
    next[removed.contentUnitId] = [...rows, removed.candidateId]
    changed = true
  }
  return changed ? next : current
}

export function withLocalContentCanvasCandidates(
  projectData: ContentCanvasProjectData | undefined,
  localCandidates: LocalContentCanvasCandidates,
  removedCandidates: LocalContentCanvasRemovedCandidates = {},
): ContentCanvasProjectData | undefined {
  if (!projectData) return projectData
  const localEntries = Object.entries(localCandidates).filter(([, candidates]) => candidates.length > 0)
  const removedEntries = Object.entries(removedCandidates).filter(([, candidateIds]) => candidateIds.length > 0)
  if (!localEntries.length && !removedEntries.length) return projectData
  const merged: ContentCanvasProjectData['contentUnitCandidates'] = { ...localCandidates }
  for (const [contentUnitId, candidates] of Object.entries(projectData.contentUnitCandidates)) {
    merged[contentUnitId] = mergeCandidateRows(merged[contentUnitId] ?? [], candidates)
  }
  for (const [contentUnitId, candidateIds] of removedEntries) {
    const hiddenIds = new Set(candidateIds)
    merged[contentUnitId] = (merged[contentUnitId] ?? projectData.contentUnitCandidates[contentUnitId] ?? [])
      .filter((candidate) => !hiddenIds.has(candidate.id))
  }
  return {
    ...projectData,
    contentUnitCandidates: merged,
  }
}

function mergeCandidateRows(
  current: ContentCanvasCandidate[],
  incoming: ContentCanvasCandidate[],
): ContentCanvasCandidate[] {
  let rows = [...current]
  for (const candidate of incoming) {
    rows = rows.filter((existing) => !candidateShouldReplaceExistingRow(existing, candidate))
    const key = candidateMergeKey(candidate)
    const existingIndex = rows.findIndex((item) => candidateMergeKey(item) === key)
    if (existingIndex >= 0) {
      rows = rows.map((item, index) => index === existingIndex ? candidate : item)
    } else {
      rows = [...rows, candidate]
    }
  }
  return rows
}

function candidateMergeKey(candidate: ContentCanvasCandidate): string {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
  ].join(':')
}

function candidateShouldReplaceExistingRow(
  existing: ContentCanvasCandidate,
  incoming: ContentCanvasCandidate,
): boolean {
  if (candidateMergeKey(existing) === candidateMergeKey(incoming)) return true
  if (existing.id !== incoming.id) return false
  const existingJobId = candidateJobId(existing)
  const incomingJobId = candidateJobId(incoming)
  return candidateIsActive(existing)
    || candidateIsTerminal(incoming)
    || (existingJobId !== undefined && existingJobId === incomingJobId)
}

function candidateIsActive(candidate: ContentCanvasCandidate): boolean {
  const status = candidateStatus(candidate)
  return status === 'queued' || status === 'pending' || status === 'running'
}

function candidateIsTerminal(candidate: ContentCanvasCandidate): boolean {
  const status = candidateStatus(candidate)
  return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'cancelled'
}

function candidateJobId(candidate: ContentCanvasCandidate): string | undefined {
  return scalarText(candidate.producer?.job_id ?? candidate.producer?.jobId)
}

function candidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const derived = derivedCandidateStatus(candidate)
  if (derived === 'failed' || derived === 'canceled' || derived === 'cancelled') return derived
  return candidate.status?.toLowerCase() ?? derived
}

function derivedCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  const output = firstRecord(candidate.outputs)
  const outputMetadata = recordValue(output?.metadata)
  const status = scalarText(
    producer?.status
      ?? producer?.state
      ?? producer?.phase
      ?? promptSnapshot?.status
      ?? outputMetadata?.status,
  )?.toLowerCase()
  if (status && ['failed', 'failure', 'error', 'errored'].includes(status)) return 'failed'
  if (status && ['canceled', 'cancelled'].includes(status)) return status
  if (scalarText(
    producer?.error_message
      ?? producer?.errorMessage
      ?? producer?.failure_reason
      ?? producer?.failureReason
      ?? producer?.error
      ?? promptSnapshot?.error_message
      ?? promptSnapshot?.errorMessage
      ?? outputMetadata?.error_message
      ?? outputMetadata?.errorMessage
      ?? outputMetadata?.error,
  )) return 'failed'
  return status
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find(isRecord) : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

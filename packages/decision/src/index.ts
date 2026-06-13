export type MovScriptDecisionTargetKind = 'asset' | 'storyboard' | 'keyframe' | 'content_unit'

export interface MovScriptCandidateSelectionRecord {
  candidate_id?: string | number
  resource_id?: number
  artifact_ref?: string
  reason?: string
  selected_at?: string
  selected_by?: string | number
  metadata?: Record<string, unknown>
}

export interface MovScriptCandidateSelectionInput {
  candidateId: string | number
  reason?: string
  selectedAt?: string
  selectedBy?: string | number
  metadata?: Record<string, unknown>
}

export interface MovScriptResourceSelectionInput {
  candidateId?: string | number
  resourceId: number
  artifactRef?: string
  reason?: string
  selectedAt?: string
  selectedBy?: string | number
  metadata?: Record<string, unknown>
}

export interface MovScriptCandidateSelectionFieldOptions {
  selectionField?: string
}

export interface MovScriptCandidateSelectionResolution {
  selection: MovScriptCandidateSelectionRecord
  candidate?: Record<string, unknown>
  candidateId?: string | number
  resourceId?: number
  artifactRef?: string
}

export interface MovScriptCandidateRecordSelectionResult {
  candidate: Record<string, unknown>
  selection: MovScriptCandidateSelectionRecord
  record: Record<string, unknown>
}

const DEFAULT_SELECTION_FIELD = 'lock'

export function buildMovScriptCandidateSelectionRecord(
  candidate: Record<string, unknown>,
  input: Partial<Omit<MovScriptCandidateSelectionInput, 'candidateId'>> = {},
): MovScriptCandidateSelectionRecord {
  const candidateId = idField(candidate.id)
  const resourceId = resourceIdField(candidate.resource_id ?? candidate.resourceId)
  const artifactRef = stringField(candidate.artifact_ref ?? candidate.artifactRef)
  if (candidateId === undefined && resourceId === undefined) {
    throw new Error('candidate selection requires candidate id or resource_id')
  }
  return pruneUndefined({
    candidate_id: candidateId,
    resource_id: resourceId,
    artifact_ref: artifactRef,
    reason: input.reason ?? 'selected',
    selected_at: input.selectedAt,
    selected_by: input.selectedBy,
    metadata: input.metadata,
  })
}

export function buildMovScriptResourceSelectionRecord(
  input: MovScriptResourceSelectionInput,
): MovScriptCandidateSelectionRecord {
  const resourceId = resourceIdField(input.resourceId)
  if (resourceId === undefined) throw new Error('resource selection requires resource_id')
  return pruneUndefined({
    candidate_id: idField(input.candidateId),
    resource_id: resourceId,
    artifact_ref: stringField(input.artifactRef),
    reason: input.reason ?? 'selected',
    selected_at: input.selectedAt,
    selected_by: input.selectedBy,
    metadata: input.metadata,
  })
}

export function selectMovScriptCandidateRecord(
  record: Record<string, unknown>,
  input: MovScriptCandidateSelectionInput & MovScriptCandidateSelectionFieldOptions,
): MovScriptCandidateRecordSelectionResult {
  const candidate = findCandidate(record, input.candidateId)
  if (!candidate) throw new Error(`candidate not found: ${String(input.candidateId)}`)
  const selection = buildMovScriptCandidateSelectionRecord(candidate, input)
  return {
    candidate,
    selection,
    record: {
      ...record,
      [selectionField(input)]: selection,
    },
  }
}

export function clearMovScriptCandidateSelectionRecord(
  record: Record<string, unknown>,
  options: MovScriptCandidateSelectionFieldOptions = {},
): Record<string, unknown> {
  const field = selectionField(options)
  const { [field]: _selection, ...nextRecord } = record
  return nextRecord
}

export function resolveMovScriptCandidateSelection(
  record: Record<string, unknown>,
  options: MovScriptCandidateSelectionFieldOptions = {},
): MovScriptCandidateSelectionResolution | undefined {
  const selection = selectionRecord(record[selectionField(options)])
  if (!selection) return undefined
  const candidateId = idField(selection.candidate_id)
  const candidate = candidateId === undefined ? undefined : findCandidate(record, candidateId)
  const resourceId = resourceIdField(selection.resource_id) ?? resourceIdField(candidate?.resource_id ?? candidate?.resourceId)
  const artifactRef = stringField(selection.artifact_ref) ?? stringField(candidate?.artifact_ref ?? candidate?.artifactRef)
  if (candidateId === undefined && resourceId === undefined) return undefined
  return pruneUndefined({
    selection,
    candidate,
    candidateId,
    resourceId,
    artifactRef,
  })
}

function findCandidate(record: Record<string, unknown>, candidateId: string | number): Record<string, unknown> | undefined {
  return arrayField(record.candidates).filter(isRecord)
    .find((item) => sameId(item.id, candidateId))
}

function selectionField(options: MovScriptCandidateSelectionFieldOptions): string {
  return options.selectionField?.trim() || DEFAULT_SELECTION_FIELD
}

function selectionRecord(value: unknown): MovScriptCandidateSelectionRecord | undefined {
  if (!isRecord(value)) return undefined
  const candidateId = idField(value.candidate_id)
  const resourceId = resourceIdField(value.resource_id)
  if (candidateId === undefined && resourceId === undefined) return undefined
  return pruneUndefined({
    candidate_id: candidateId,
    resource_id: resourceId,
    artifact_ref: stringField(value.artifact_ref),
    reason: stringField(value.reason),
    selected_at: stringField(value.selected_at),
    selected_by: idField(value.selected_by),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  })
}

function sameId(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return false
  return String(left) === String(right)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

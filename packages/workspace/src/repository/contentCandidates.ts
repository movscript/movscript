import {
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentCandidateOutput {
  kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
  resource_id: string | number
  mime_type?: string
  width?: number
  height?: number
  duration_sec?: number
  metadata?: Record<string, unknown>
}

export interface MovScriptContentCandidateWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  contentUnitId: string | number
  candidateId?: string | number
  source?: 'ai_generate' | 'upload' | 'shoot' | 'external_delivery' | 'manual' | string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'imported'
  producer?: Record<string, unknown>
  outputs: MovScriptContentCandidateOutput[]
  promptSnapshot?: Record<string, unknown>
  createdAt?: string
}

export interface MovScriptContentCandidateWriteResult {
  path: string
  record: Record<string, unknown>
}

export async function createMovScriptContentCandidate(
  input: MovScriptContentCandidateWriteInput,
): Promise<MovScriptContentCandidateWriteResult> {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const candidateId = stableEntityId(input.candidateId ?? `candidate_${Date.now()}`, 'candidate')
  const path = `${contentUnitDirectory(contentUnitId)}/candidates/${entityPathSlug(candidateId, 'candidate')}/content_candidate.json`
  const record = pruneUndefined({
    schema: 'movscript.content_candidate.v1',
    id: candidateId,
    content_unit_ref: contentUnitDirectory(contentUnitId),
    source: input.source ?? 'ai_generate',
    status: input.status ?? 'succeeded',
    producer: input.producer ?? { kind: 'runtime' },
    outputs: input.outputs,
    prompt_snapshot: input.promptSnapshot,
    created_at: input.createdAt ?? new Date().toISOString(),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, record }
}

export interface MovScriptContentUnitSelectionInput {
  fileRepository: MovScriptWorkspaceFileRepository
  contentUnitId: string | number
  candidateId: string | number
  resourceId?: string | number
  stalePolicy?: 'strict' | 'accept_stale'
  reason?: string
  selectedAt?: string
}

export interface MovScriptContentUnitSelectionResult {
  path: string
  record: Record<string, unknown>
}

export async function selectMovScriptContentUnitCandidate(
  input: MovScriptContentUnitSelectionInput,
): Promise<MovScriptContentUnitSelectionResult> {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const path = `${contentUnitDirectory(contentUnitId)}/selection.json`
  const record = pruneUndefined({
    schema: 'movscript.selection.v1',
    target: {
      kind: 'content_unit',
      ref: contentUnitDirectory(contentUnitId),
    },
    candidate_id: input.candidateId,
    resource_id: input.resourceId,
    stale_policy: input.stalePolicy ?? 'strict',
    reason: input.reason ?? 'selected',
    selected_at: input.selectedAt ?? new Date().toISOString(),
  })
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, record }
}

export async function clearMovScriptContentUnitSelection(input: {
  fileRepository: MovScriptWorkspaceFileRepository
  contentUnitId: string | number
}): Promise<void> {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  await input.fileRepository.delete({ path: `${contentUnitDirectory(contentUnitId)}/selection.json` })
}

function contentUnitDirectory(id: string): string {
  return `content_units/${entityPathSlug(id, 'content_unit')}`
}

function stableEntityId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

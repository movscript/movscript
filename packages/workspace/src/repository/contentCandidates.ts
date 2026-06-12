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

export function buildMovScriptContentCandidate(
  input: Omit<MovScriptContentCandidateWriteInput, 'fileRepository'>,
): MovScriptContentCandidateWriteResult {
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
  return { path, record }
}

export async function createMovScriptContentCandidate(
  input: MovScriptContentCandidateWriteInput,
): Promise<MovScriptContentCandidateWriteResult> {
  const { path, record } = buildMovScriptContentCandidate(input)
  await input.fileRepository.write({ path, content: serializeWorkspaceRecord(record) })
  return { path, record }
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

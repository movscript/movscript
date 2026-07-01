import {
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentCandidateOutput {
  kind: 'image' | 'video' | 'audio' | 'text' | 'metadata' | 'hls_stream'
  resource_id?: number
  stream_id?: string | number
  artifact_ref?: string
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
  status?: 'queued' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'cancelled' | 'imported'
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
    outputs: normalizeOutputs(input.outputs),
    prompt_snapshot: input.promptSnapshot,
    created_at: input.createdAt ?? new Date().toISOString(),
  })
  return { path, record }
}

export async function createMovScriptContentCandidate(
  _input: MovScriptContentCandidateWriteInput,
): Promise<MovScriptContentCandidateWriteResult> {
  throw new Error('content unit candidates are backend decision records; use MovScriptDecisionStore.upsertContentUnitCandidate')
}

function contentUnitDirectory(id: string): string {
  return `content_units/${entityPathSlug(id, 'content_unit')}`
}

function stableEntityId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

function normalizeOutputs(outputs: MovScriptContentCandidateOutput[]): MovScriptContentCandidateOutput[] {
  return outputs.map((output, index) => {
    const streamId = streamIdField(output.stream_id)
    const resourceId = streamId === undefined
      ? requiredResourceId(output.resource_id, `outputs[${index}].resource_id`)
      : optionalResourceId(output.resource_id, `outputs[${index}].resource_id`)
    if (output.kind === 'hls_stream' && streamId === undefined) {
      throw new Error(`outputs[${index}].stream_id is required for hls_stream candidates`)
    }
    return pruneUndefined({
      ...output,
      resource_id: resourceId,
      stream_id: streamId,
      artifact_ref: stringField(output.artifact_ref),
    })
  })
}

function optionalResourceId(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requiredResourceId(value, name)
}

function requiredResourceId(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  throw new Error(`${name} must be a positive integer RawResource ID`)
}

function streamIdField(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}

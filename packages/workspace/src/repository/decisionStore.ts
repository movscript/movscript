import {
  deriveMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '../indexer/index.js'
import {
  entityPathSlug,
} from '../layout/index.js'

export interface MovScriptDecisionContext {
  project_id?: string | number
  target_kind: string
  target_ref: string
  candidates: Record<string, unknown>[]
  selection?: Record<string, unknown>
  status?: string
}

export interface MovScriptContentUnitDecisionTarget {
  contentUnitId: string | number
}

export interface MovScriptContentUnitDecisionCandidateInput extends MovScriptContentUnitDecisionTarget {
  candidate: Record<string, unknown>
}

export interface MovScriptContentUnitDecisionCandidatesInput extends MovScriptContentUnitDecisionTarget {
  candidates: Record<string, unknown>[]
}

export interface MovScriptContentUnitDecisionSelectionInput extends MovScriptContentUnitDecisionTarget {
  candidateId: string | number
  resourceId?: string | number
  stalePolicy?: 'strict' | 'accept_stale'
  reason?: string
  selectedAt?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptDecisionStore {
  getContentUnitDecision(input: MovScriptContentUnitDecisionTarget): Promise<MovScriptDecisionContext | undefined>
  replaceContentUnitCandidates(input: MovScriptContentUnitDecisionCandidatesInput): Promise<MovScriptDecisionContext>
  upsertContentUnitCandidate(input: MovScriptContentUnitDecisionCandidateInput): Promise<MovScriptDecisionContext>
  selectContentUnitCandidate(input: MovScriptContentUnitDecisionSelectionInput): Promise<MovScriptDecisionContext>
  clearContentUnitSelection(input: MovScriptContentUnitDecisionTarget): Promise<MovScriptDecisionContext>
}

export interface MovScriptBackendDecisionStoreOptions {
  baseUrl: string
  projectId: string | number
  token?: string
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export function createMovScriptBackendDecisionStore(
  options: MovScriptBackendDecisionStoreOptions,
): MovScriptDecisionStore {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const projectId = encodeURIComponent(String(options.projectId))
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) throw new Error('fetch is required for backend decision store')
  const headers = (): Record<string, string> => ({
    'content-type': 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers ?? {}),
  })
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T | undefined> => {
    const response = await fetchImpl(`${baseUrl}/api/v1/projects/${projectId}${path}`, {
      ...init,
      headers: {
        ...headers(),
        ...(init.headers ?? {}),
      },
    })
    if (response.status === 404) return undefined
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`backend decision request failed: ${response.status}${body ? ` ${body}` : ''}`)
    }
    if (response.status === 204) return undefined
    return await response.json() as T
  }
  return {
    getContentUnitDecision(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      return request<MovScriptDecisionContext>(`/decisions?target_kind=content_unit&target_ref=${encodeURIComponent(targetRef)}`)
    },
    replaceContentUnitCandidates(input) {
      return requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/candidates', {
        method: 'PUT',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: contentUnitDecisionTargetRef(input.contentUnitId),
          candidates: input.candidates,
        }),
      }))
    },
    upsertContentUnitCandidate(input) {
      return requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/candidates', {
        method: 'POST',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: contentUnitDecisionTargetRef(input.contentUnitId),
          candidate: input.candidate,
        }),
      }))
    },
    selectContentUnitCandidate(input) {
      return requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/selection', {
        method: 'PUT',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: contentUnitDecisionTargetRef(input.contentUnitId),
          candidate_id: input.candidateId,
          resource_id: input.resourceId,
          stale_policy: input.stalePolicy,
          reason: input.reason,
          selected_at: input.selectedAt,
          metadata: input.metadata,
        }),
      }))
    },
    clearContentUnitSelection(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      return requiredDecisionContext(request<MovScriptDecisionContext>(`/decisions/selection?target_kind=content_unit&target_ref=${encodeURIComponent(targetRef)}`, {
        method: 'DELETE',
      }))
    },
  }
}

export async function overlayMovScriptDecisionDocuments(
  documents: MovScriptWorkspaceDocument[],
  decisionStore?: Pick<MovScriptDecisionStore, 'getContentUnitDecision'>,
): Promise<MovScriptWorkspaceDocument[]> {
  if (!decisionStore) return documents
  const baseIndex = deriveMovScriptWorkspaceDomainIndex(documents)
  const contentUnits = baseIndex.byKind.get('content_unit') ?? []
  const overlays: MovScriptWorkspaceDocument[] = []
  for (const contentUnit of contentUnits) {
    if (contentUnit.id === undefined) continue
    const context = await decisionStore.getContentUnitDecision({ contentUnitId: contentUnit.id })
    if (!context) continue
    const contentUnitRef = entityDir(contentUnit.path)
    for (const candidate of context.candidates) {
      const candidateId = idField(candidate.id)
      if (candidateId === undefined) continue
      overlays.push({
        path: `${contentUnitRef}/candidates/${entityPathSlug(candidateId, 'candidate')}/content_candidate.json`,
        data: normalizeContentUnitCandidate(candidate, contentUnitRef),
      })
    }
    if (context.selection) {
      overlays.push({
        path: `${contentUnitRef}/selection.json`,
        data: normalizeContentUnitSelection(context.selection, contentUnitRef),
      })
    }
  }
  if (overlays.length === 0) return documents
  const overlayPaths = new Set(overlays.map((document) => document.path))
  return [
    ...documents.filter((document) => !overlayPaths.has(document.path)),
    ...overlays,
  ].sort((left, right) => left.path.localeCompare(right.path))
}

export function contentUnitDecisionTargetRef(contentUnitId: string | number): string {
  return `content_units/${entityPathSlug(contentUnitId, 'content_unit')}`
}

function normalizeContentUnitCandidate(
  candidate: Record<string, unknown>,
  contentUnitRef: string,
): Record<string, unknown> {
  return pruneUndefined({
    ...candidate,
    schema: candidate.schema ?? 'movscript.content_candidate.v1',
    content_unit_ref: candidate.content_unit_ref ?? contentUnitRef,
  })
}

function normalizeContentUnitSelection(
  selection: Record<string, unknown>,
  contentUnitRef: string,
): Record<string, unknown> {
  return pruneUndefined({
    schema: 'movscript.selection.v1',
    target: {
      kind: 'content_unit',
      ref: contentUnitRef,
    },
    candidate_id: selection.candidate_id,
    resource_id: selection.resource_id,
    stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
    reason: selection.reason,
    selected_at: selection.selected_at,
    selected_by: selection.selected_by,
    metadata: isRecord(selection.metadata) ? selection.metadata : undefined,
  })
}

async function requiredDecisionContext(
  promise: Promise<MovScriptDecisionContext | undefined>,
): Promise<MovScriptDecisionContext> {
  const context = await promise
  if (!context) throw new Error('backend decision context not found')
  return context
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
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

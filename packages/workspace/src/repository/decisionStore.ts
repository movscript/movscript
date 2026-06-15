import {
  deriveMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '../indexer/index.js'
import {
  entityPathSlug,
  isMovScriptContentUnitDecisionPath,
} from '../layout/index.js'

export interface MovScriptDecisionContext {
  [key: string]: unknown
  schema?: 'movscript.decision_context.v1'
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
  resourceId?: number
  stalePolicy?: 'strict' | 'accept_stale'
  reason?: string
  selectedAt?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptContentUnitCandidateDecisionInput extends MovScriptContentUnitDecisionTarget {
  candidateId: string | number
  decision: 'adopt' | 'reject' | 'defer'
  resourceId?: number
  stalePolicy?: 'strict' | 'accept_stale'
  reason?: string
  decidedAt?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptContentUnitDecisionSelectionResult {
  path: string
  record: Record<string, unknown>
  context: MovScriptDecisionContext
}

export interface MovScriptDecisionStore {
  getContentUnitDecision(input: MovScriptContentUnitDecisionTarget): Promise<MovScriptDecisionContext | undefined>
  getContentUnitDecisions?(input: { contentUnitIds: Array<string | number> }): Promise<Map<string, MovScriptDecisionContext>>
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
    if (response.status === 404) {
      console.info('[movscript-decision-store] backend decision request not found', {
        projectId: options.projectId,
        method: init.method ?? 'GET',
        path,
        status: response.status,
      })
      return undefined
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn('[movscript-decision-store] backend decision request failed', {
        projectId: options.projectId,
        method: init.method ?? 'GET',
        path,
        status: response.status,
        body,
      })
      throw new Error(`backend decision request failed: ${response.status}${body ? ` ${body}` : ''}`)
    }
    if (response.status === 204) return undefined
    return await response.json() as T
  }
  return {
    async getContentUnitDecision(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      const context = await request<MovScriptDecisionContext>(`/decisions?target_kind=content_unit&target_ref=${encodeURIComponent(targetRef)}`)
      console.info('[movscript-decision-store] get content unit decision', {
        projectId: options.projectId,
        contentUnitId: input.contentUnitId,
        targetRef,
        found: Boolean(context),
        candidateCount: context?.candidates.length ?? 0,
        candidateIds: decisionCandidateIds(context?.candidates ?? []),
        hasSelection: Boolean(context?.selection),
      })
      return context
    },
    async getContentUnitDecisions(input) {
      const ids = uniqueContentUnitIds(input.contentUnitIds)
      if (ids.length === 0) return new Map()
      const contexts = await request<MovScriptDecisionContext[]>('/decisions/query', {
        method: 'POST',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_refs: ids.map(contentUnitDecisionTargetRef),
        }),
      }) ?? []
      console.info('[movscript-decision-store] get content unit decisions', {
        projectId: options.projectId,
        requestedCount: ids.length,
        foundCount: contexts.length,
      })
      const byTargetRef = new Map(contexts.map((context) => [context.target_ref, context]))
      const out = new Map<string, MovScriptDecisionContext>()
      for (const id of ids) {
        const context = byTargetRef.get(contentUnitDecisionTargetRef(id))
        if (context) out.set(String(id), context)
      }
      return out
    },
    async replaceContentUnitCandidates(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      const context = await requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/candidates', {
        method: 'PUT',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: targetRef,
          candidates: input.candidates,
        }),
      }))
      console.info('[movscript-decision-store] replace content unit candidates', {
        projectId: options.projectId,
        contentUnitId: input.contentUnitId,
        targetRef,
        candidateCount: context.candidates.length,
        candidateIds: decisionCandidateIds(context.candidates),
      })
      return context
    },
    async upsertContentUnitCandidate(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      const context = await requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/candidates', {
        method: 'POST',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: targetRef,
          candidate: input.candidate,
        }),
      }))
      console.info('[movscript-decision-store] upsert content unit candidate', {
        projectId: options.projectId,
        contentUnitId: input.contentUnitId,
        targetRef,
        candidateId: idField(input.candidate.id),
        candidateCount: context.candidates.length,
        candidateIds: decisionCandidateIds(context.candidates),
      })
      return context
    },
    async selectContentUnitCandidate(input) {
      const targetRef = contentUnitDecisionTargetRef(input.contentUnitId)
      const context = await requiredDecisionContext(request<MovScriptDecisionContext>('/decisions/selection', {
        method: 'PUT',
        body: JSON.stringify({
          target_kind: 'content_unit',
          target_ref: targetRef,
          candidate_id: stringIdField(input.candidateId),
          resource_id: input.resourceId === undefined ? undefined : requiredResourceId(input.resourceId),
          stale_policy: input.stalePolicy,
          reason: input.reason,
          selected_at: input.selectedAt,
          metadata: input.metadata,
        }),
      }))
      console.info('[movscript-decision-store] select content unit candidate', {
        projectId: options.projectId,
        contentUnitId: input.contentUnitId,
        targetRef,
        candidateId: stringIdField(input.candidateId),
        candidateCount: context.candidates.length,
        candidateIds: decisionCandidateIds(context.candidates),
        hasSelection: Boolean(context.selection),
      })
      return context
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
  decisionStore?: Pick<MovScriptDecisionStore, 'getContentUnitDecision' | 'getContentUnitDecisions'>,
): Promise<MovScriptWorkspaceDocument[]> {
  if (!decisionStore) return documents
  const sourceDocuments = documents.filter((document) => !isMovScriptContentUnitDecisionPath(document.path))
  const baseIndex = deriveMovScriptWorkspaceDomainIndex(sourceDocuments)
  const contentUnits = baseIndex.byKind.get('content_unit') ?? []
  const decisionsByContentUnitId = await getOverlayDecisionContexts(decisionStore, contentUnits)
  const overlays: MovScriptWorkspaceDocument[] = []
  const rows: Array<{ contentUnitId: string | number; targetRef: string; candidateCount: number; candidateIds: Array<string | number> }> = []
  for (const contentUnit of contentUnits) {
    if (contentUnit.id === undefined) continue
    const context = decisionsByContentUnitId.get(String(contentUnit.id))
    if (!context) continue
    const contentUnitRef = entityDir(contentUnit.path)
    rows.push({
      contentUnitId: contentUnit.id,
      targetRef: context.target_ref,
      candidateCount: context.candidates.length,
      candidateIds: decisionCandidateIds(context.candidates),
    })
    overlays.push({
      path: contentUnitDecisionContextPath(contentUnit.id),
      data: normalizeDecisionContext(context, contentUnitRef),
    })
    for (const candidate of context.candidates) {
      const candidateId = idField(candidate.id)
      if (candidateId === undefined) continue
      overlays.push({
        path: `${contentUnitRef}/candidates/${entityPathSlug(candidateId, 'candidate')}/content_candidate.json`,
        data: normalizeContentUnitCandidate(candidate, contentUnitRef),
      })
    }
  }
  if (rows.length > 0) {
    console.info('[movscript-decision-store] overlay content unit decisions', {
      contentUnitCount: contentUnits.length,
      rows,
    })
  }
  const overlayPaths = new Set(overlays.map((document) => document.path))
  return [
    ...sourceDocuments.filter((document) => !overlayPaths.has(document.path)),
    ...overlays,
  ].sort((left, right) => left.path.localeCompare(right.path))
}

async function getOverlayDecisionContexts(
  decisionStore: Pick<MovScriptDecisionStore, 'getContentUnitDecision' | 'getContentUnitDecisions'>,
  contentUnits: { id?: string | number }[],
): Promise<Map<string, MovScriptDecisionContext>> {
  const contentUnitIds = uniqueContentUnitIds(contentUnits.map((unit) => unit.id).filter((id): id is string | number => id !== undefined))
  if (contentUnitIds.length === 0) return new Map()
  if (decisionStore.getContentUnitDecisions) {
    return decisionStore.getContentUnitDecisions({ contentUnitIds })
  }
  const out = new Map<string, MovScriptDecisionContext>()
  for (const contentUnitId of contentUnitIds) {
    const context = await decisionStore.getContentUnitDecision({ contentUnitId })
    if (context) out.set(String(contentUnitId), context)
  }
  return out
}

function uniqueContentUnitIds(values: Array<string | number>): Array<string | number> {
  const seen = new Set<string>()
  const out: Array<string | number> = []
  for (const value of values) {
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function contentUnitDecisionTargetRef(contentUnitId: string | number): string {
  return `content_units/${entityPathSlug(contentUnitId, 'content_unit')}`
}

export function contentUnitDecisionContextPath(contentUnitId: string | number): string {
  return `.movscript/decisions/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/decision_context.json`
}

export function normalizeDecisionContext(
  context: MovScriptDecisionContext,
  targetRef: string = context.target_ref,
): MovScriptDecisionContext {
  return pruneUndefined({
    ...context,
    schema: 'movscript.decision_context.v1' as const,
    target_kind: context.target_kind,
    target_ref: targetRef,
    candidates: context.candidates.map((candidate) => normalizeContentUnitCandidate(candidate, targetRef)),
    selection: isRecord(context.selection) ? normalizeContentUnitDecisionSelection(context.selection) : undefined,
  })
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

function normalizeContentUnitDecisionSelection(
  selection: Record<string, unknown>,
): Record<string, unknown> {
  return pruneUndefined({
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

function decisionCandidateIds(candidates: Record<string, unknown>[]): Array<string | number> {
  return candidates
    .map((candidate) => idField(candidate.id))
    .filter((id): id is string | number => id !== undefined)
}

function stringIdField(value: unknown): string | undefined {
  const id = idField(value)
  return id === undefined ? undefined : String(id)
}

function requiredResourceId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  throw new Error('resource_id must be a positive integer RawResource ID')
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

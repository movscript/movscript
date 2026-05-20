import { isRecord } from '../jsonValue.js'
import type { JSONValue } from '../types.js'
import type { AgentDraft, AgentDraftStore } from '../drafts/draftStore.js'
import { validateDraft } from '../drafts/draftStore.js'
import { buildApplyDraftPreview, markDraftApplied, rejectDraft, type ApplyDraftInput, type ApplyDraftReview } from '../drafts/draftApply.js'
import { BackendApplyHTTPError, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import {
  assetProposalContainsAssetSlots,
  canonicalizeProjectStandardsProposalDraftContent,
} from '../drafts/draftRuntimeContent.js'
import {
  buildRuntimeCreateDraftInput,
  buildRuntimeDraftBackendAuth,
  buildRuntimePatchDraftInput,
  buildRuntimeUpdateDraftInput,
  requireRuntimeDraftId,
  type RuntimeCreateDraftInput,
  type RuntimePatchDraftInput,
  type RuntimeUpdateDraftInput,
} from '../drafts/draftRuntimeInput.js'
import { normalizeDraftQuery } from '../context/normalizeRunInput.js'

export interface RuntimeDraftBackendApplyClient {
  previewApplyReview: (...args: Parameters<import('../drafts/backendApplyClient.js').BackendApplyClient['previewApplyReview']>) => Promise<BackendApplyResult>
  applyReview: (...args: Parameters<import('../drafts/backendApplyClient.js').BackendApplyClient['applyReview']>) => Promise<BackendApplyResult>
}

export function listRuntimeDrafts(input: {
  draftStore: AgentDraftStore
  query?: Parameters<typeof normalizeDraftQuery>[0]
}): AgentDraft[] {
  return input.draftStore.listDrafts(normalizeDraftQuery(input.query ?? {}))
}

export function createRuntimeLocalDraft(input: {
  draftStore: AgentDraftStore
  draftInput: RuntimeCreateDraftInput
}): AgentDraft {
  return input.draftStore.createDraft(buildRuntimeCreateDraftInput(input.draftInput))
}

export function getRuntimeDraft(input: {
  draftStore: AgentDraftStore
  draftId: string
}): AgentDraft | undefined {
  return input.draftStore.getDraft(input.draftId)
}

export function updateRuntimeDraft(input: {
  draftStore: AgentDraftStore
  draftInput: RuntimeUpdateDraftInput
}): AgentDraft {
  const { draftId, update } = buildRuntimeUpdateDraftInput(input.draftInput)
  return input.draftStore.updateDraft(draftId, update)
}

export function patchRuntimeDraft(input: {
  draftStore: AgentDraftStore
  patchInput: RuntimePatchDraftInput
}): JSONValue {
  const { draftId, patch } = buildRuntimePatchDraftInput(input.patchInput)
  const result = input.draftStore.patchDraft(draftId, patch)
  return {
    status: 'patched',
    ...result,
    validation: validateDraft(result.draft),
  } as unknown as JSONValue
}

export function validateRuntimeDraft(input: {
  draftStore: AgentDraftStore
  draftId?: unknown
}): JSONValue {
  const draftId = requireRuntimeDraftId(input.draftId, 'validate draft')
  const draft = input.draftStore.getDraft(draftId)
  if (!draft) throw new Error(`draft not found: ${draftId}`)
  return validateDraft(draft) as unknown as JSONValue
}

export function previewRuntimeDraftApply(input: {
  draftStore: AgentDraftStore
  applyInput: ApplyDraftInput
}): JSONValue {
  return buildApplyDraftPreview(input.draftStore, input.applyInput) as unknown as JSONValue
}

export async function simulateRuntimeDraftApply(input: {
  draftStore: AgentDraftStore
  backendApplyClient: Pick<RuntimeDraftBackendApplyClient, 'previewApplyReview'>
  applyInput: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
}): Promise<JSONValue> {
  const preview = buildApplyDraftPreview(input.draftStore, input.applyInput)
  const preparedReview = buildRuntimeProjectLayerProposalReviewForBackend(preview.review, input.draftStore)
  const validation = validateDraft(preview.draft)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      draftId: preview.draft.id,
      validation,
      message: 'Draft failed local validation. Patch the draft and validate again before simulating backend apply.',
    } as unknown as JSONValue
  }
  const snapshotBaseValidation = validateAssetProposalSnapshotBase(preview.draft, preparedReview)
  if (!snapshotBaseValidation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      draftId: preview.draft.id,
      validation,
      message: snapshotBaseValidation.message,
    } as unknown as JSONValue
  }
  if (isAssetPlanningDraft(preview.draft)) {
    return {
      ok: true,
      stage: 'local_validation',
      draftId: preview.draft.id,
      validation,
      message: 'Asset proposal draft is locally valid. It is a planning artifact; backend apply is intentionally not performed.',
    } as unknown as JSONValue
  }
  try {
    const backendApply = await input.backendApplyClient.previewApplyReview(
      preparedReview,
      buildRuntimeDraftBackendAuth(input.applyInput),
    )
    return {
      ok: true,
      stage: 'backend_apply_preview',
      draftId: preview.draft.id,
      validation,
      backendApply,
    } as unknown as JSONValue
  } catch (error) {
    return {
      ok: false,
      stage: 'backend_apply_preview',
      draftId: preview.draft.id,
      validation,
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
      message: 'Backend apply preview failed. Use backendError.response or backendError.responseText to patch the draft, then simulate again.',
    } as unknown as JSONValue
  }
}

export async function applyRuntimeDraftFromUI(input: {
  draftStore: AgentDraftStore
  backendApplyClient: Pick<RuntimeDraftBackendApplyClient, 'applyReview'>
  applyInput: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  now: () => string
  appliedBy?: string
}): Promise<JSONValue> {
  const appliedBy = input.appliedBy ?? 'movscript-ui'
  const preview = buildApplyDraftPreview(input.draftStore, input.applyInput)
  const preparedReview = buildRuntimeProjectLayerProposalReviewForBackend(preview.review, input.draftStore)
  if (isAssetPlanningDraft(preview.draft)) {
    const finalDraft = markDraftApplied(input.draftStore, preview.draft, preparedReview, input.applyInput, {
      appliedBy,
      backendWritePerformed: false,
      backendApplySkippedReason: 'asset proposal contains candidate plans only; project snapshot apply was skipped',
    })
    return {
      status: 'applied',
      review: preparedReview,
      draft: finalDraft,
      message: 'Asset candidate planning draft marked applied locally. Backend project snapshot apply was skipped.',
      backendApply: { performed: false, skippedReason: 'asset proposal contains candidate plans only' },
    } as unknown as JSONValue
  }
  const snapshotBaseValidation = validateAssetProposalSnapshotBase(preview.draft, preparedReview)
  if (!snapshotBaseValidation.ok) throw new Error(snapshotBaseValidation.message)

  let backendApply: BackendApplyResult
  try {
    backendApply = await input.backendApplyClient.applyReview(preparedReview, buildRuntimeDraftBackendAuth(input.applyInput, {
      includeAppliedByUserId: true,
    }))
  } catch (error) {
    input.draftStore.updateDraft(preview.draft.id, {
      metadata: {
        ...(isRecord(preview.draft.metadata) ? preview.draft.metadata : {}),
        backendWritePerformed: false,
        backendWriteError: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }

  const rebasedContent = canonicalizeProjectStandardsProposalDraftContent(preview.draft, backendApply)
  const nextCreativeReferenceClientIDMap = prepareProjectLayerProposalClientIDMap(preparedReview, backendApply, preview.draft)
  const mergedCreativeReferenceClientIDMap = mergeCreativeReferenceClientIDMap(
    isRecord(preview.draft.metadata) ? normalizeClientIDMap(preview.draft.metadata.creativeReferenceClientIDMap) : {},
    nextCreativeReferenceClientIDMap ?? {},
  )
  const rebasedDraft = rebasedContent
    ? input.draftStore.updateDraft(preview.draft.id, {
        content: rebasedContent,
        metadata: {
          canonicalizedAfterApply: true,
          canonicalizedAt: input.now(),
        },
      })
    : preview.draft
  const finalDraft = markDraftApplied(input.draftStore, rebasedDraft, preparedReview, input.applyInput, {
    appliedBy,
    backendWritePerformed: backendApply.performed,
    backendApply: backendApply as unknown as JSONValue,
    ...(Object.keys(mergedCreativeReferenceClientIDMap).length > 0 ? {
      creativeReferenceClientIDMap: mergedCreativeReferenceClientIDMap,
    } : {}),
    ...(rebasedContent ? { canonicalizedAfterApply: true } : {}),
  })
  return {
    status: 'applied',
    review: preparedReview,
    draft: finalDraft,
    message: backendApply.performed
      ? 'Draft applied by UI and backend business item patch completed.'
      : 'Draft marked applied by UI. Backend business item patch was skipped.',
    backendApply,
  } as unknown as JSONValue
}

export function rejectRuntimeDraft(input: {
  draftStore: AgentDraftStore
  draftId?: unknown
  reason?: unknown
}): AgentDraft {
  return rejectDraft(input.draftStore, input.draftId, input.reason)
}

function isAssetPlanningDraft(draft: AgentDraft): boolean {
  return draft.kind === 'asset_proposal' && !assetProposalContainsAssetSlots(draft.content)
}

const ASSET_PROPOSAL_SNAPSHOT_BASE_REQUIRED_MESSAGE = 'Asset proposal snapshot apply requires snapshot_base.asset_slots or a hydrated DraftDomainModel seed with data.asset_slots. Refresh the draft model/current project snapshot before applying so omitted asset slots are not treated as deletes.'

function validateAssetProposalSnapshotBase(
  draft: AgentDraft,
  review: ApplyDraftReview,
): { ok: true } | { ok: false; message: string } {
  if (draft.kind !== 'asset_proposal' || review.draftKind !== 'asset_proposal') return { ok: true }
  const proposed = parseJSONTextAsRecord(review.proposedValue)
  const proposal = isRecord(proposed?.proposal) ? proposed.proposal : undefined
  if (!Array.isArray(proposal?.asset_slots) || proposal.asset_slots.length === 0) return { ok: true }
  if (hasAssetSlotSnapshotBase(proposed)) return { ok: true }
  if (hasAssetSlotSnapshotBase(parseJSONTextAsRecord(draft.content))) return { ok: true }
  if (hasHydratedAssetSlotSeed(draft.metadata)) return { ok: true }
  return { ok: false, message: ASSET_PROPOSAL_SNAPSHOT_BASE_REQUIRED_MESSAGE }
}

function hasAssetSlotSnapshotBase(value: unknown): boolean {
  if (!isRecord(value)) return false
  const snapshotBase = isRecord(value.snapshot_base) ? value.snapshot_base : undefined
  return Array.isArray(snapshotBase?.asset_slots)
}

function hasHydratedAssetSlotSeed(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false
  const seed = isRecord(metadata.seed) ? metadata.seed : undefined
  const data = isRecord(seed?.data) ? seed.data : undefined
  return Array.isArray(data?.asset_slots)
}

function buildRuntimeProjectLayerProposalReviewForBackend(review: ApplyDraftReview, draftStore: AgentDraftStore): ApplyDraftReview {
  if (!isRecord(review) || review.draftKind !== 'asset_proposal' || !isRecord(review.target)) {
    return review
  }
  const projectID = resolveDraftProjectId(review.target)
  if (!projectID) return review
  const ownerIDByClientID = getCreativeReferenceIDMapFromProjectDrafts(draftStore, projectID)
  if (Object.keys(ownerIDByClientID).length === 0) return review
  const reviewProposedValue = parseJSONTextAsRecord(review.proposedValue)
  const proposal = isRecord(reviewProposedValue?.proposal) ? reviewProposedValue.proposal : undefined
  if (!isRecord(proposal)) return review
  const assetSlots = Array.isArray(proposal.asset_slots) ? proposal.asset_slots : []
  if (assetSlots.length === 0) return review
  let rewritten = false
  const nextAssetSlots = assetSlots.map((slot) => {
    if (!isRecord(slot)) return slot
    const owner = isRecord(slot.owner) ? slot.owner : undefined
    const hasCreativeOwnerType = readText(owner?.type) === 'creative_reference' || readText(slot.owner_type) === 'creative_reference'
    const ownerID = readPositiveInt(owner?.id) ?? readPositiveInt(slot.owner_id)
    const creativeReferenceClientID = firstMatchingClientID([
      owner?.client_id,
      ownerID === undefined ? owner?.id : undefined,
      hasCreativeOwnerType ? slot.creative_reference_id : undefined,
      hasCreativeOwnerType ? slot.owner_id : undefined,
    ], ownerIDByClientID)
    if (ownerID !== undefined && !creativeReferenceClientID) return slot
    if (!creativeReferenceClientID) return slot
    const resolved = ownerIDByClientID[creativeReferenceClientID]
    if (!resolved) return slot
    if (owner) {
      rewritten = true
      return {
        ...slot,
        owner: {
          ...owner,
          type: hasCreativeOwnerType ? readText(owner.type) : 'creative_reference',
          id: resolved,
        },
      }
    }
    rewritten = true
    return {
      ...slot,
      owner_type: 'creative_reference',
      creative_reference_id: resolved,
      owner_id: resolved,
    }
  })
  if (!rewritten) return review
  return {
    ...review,
    proposedValue: {
      ...(reviewProposedValue ?? {}),
      proposal: {
        ...proposal,
        asset_slots: nextAssetSlots,
      },
    },
  } as typeof review
}

function getCreativeReferenceIDMapFromProjectDrafts(draftStore: AgentDraftStore, projectID: number): Record<string, number> {
  const settings = draftStore.listDrafts({ projectId: projectID, kind: 'setting_proposal' })
  if (settings.length === 0) return {}
  const mergedByClientID: Record<string, { referenceID: number; updatedAt: string; createdAt: string; index: number }> = {}
  for (const [index, draft] of settings.entries()) {
    if (!isRecord(draft.metadata)) continue
    const map = normalizeClientIDMap(draft.metadata.creativeReferenceClientIDMap)
    for (const [clientID, referenceID] of Object.entries(map)) {
      const current = mergedByClientID[clientID]
      const candidateUpdatedAt = draft.updatedAt
      const candidateCreatedAt = draft.createdAt
      if (!current) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateUpdatedAt > current.updatedAt) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateUpdatedAt < current.updatedAt) continue
      if (candidateCreatedAt > current.createdAt) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateCreatedAt < current.createdAt) continue
      if (index > current.index) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
      }
    }
  }
  const merged: Record<string, number> = {}
  for (const [clientID, value] of Object.entries(mergedByClientID)) {
    merged[clientID] = value.referenceID
  }
  return merged
}

function firstMatchingClientID(values: unknown[], referenceMap: Record<string, number>): string {
  for (const value of values) {
    const candidate = readClientID(value)
    if (!candidate) continue
    if (Object.hasOwn(referenceMap, candidate)) return candidate
  }
  return ''
}

function normalizeClientIDMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, rawReferenceID] of Object.entries(value)) {
    const clientID = readClientID(key)
    const referenceID = readPositiveInt(rawReferenceID)
    if (!clientID || referenceID === undefined) continue
    out[clientID] = referenceID
  }
  return out
}

function mergeCreativeReferenceClientIDMap(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  if (Object.keys(left).length === 0) return { ...right }
  if (Object.keys(right).length === 0) return { ...left }
  return { ...left, ...right }
}

function prepareProjectLayerProposalClientIDMap(
  review: ApplyDraftReview,
  backendApply: BackendApplyResult,
  draft: AgentDraft,
): Record<string, number> | undefined {
  if (review.draftKind !== 'setting_proposal') return undefined
  if (!isRecord(review.target)) return undefined
  const reviewProposedValue = parseJSONTextAsRecord(review.proposedValue)
  const proposal = isRecord(reviewProposedValue?.proposal) ? reviewProposedValue.proposal : undefined
  if (!isRecord(proposal)) return undefined
  const requestedRefs = Array.isArray(proposal.creative_references) ? proposal.creative_references : []
  if (!isRecord(backendApply.response)) return undefined
  const snapshotRefs = normalizeCreativeReferenceSnapshot(backendApply.response)
  if (requestedRefs.length === 0 || snapshotRefs.length === 0) return undefined
  const sourceMap = isRecord(draft.metadata) ? normalizeClientIDMap(draft.metadata.creativeReferenceClientIDMap) : {}
  const nextMap = buildClientIDToReferenceIDMap(requestedRefs, snapshotRefs)
  return {
    ...sourceMap,
    ...nextMap,
  }
}

function buildClientIDToReferenceIDMap(requestedRefs: unknown[], snapshotRefs: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {}
  const usedRefIDs = new Set<number>()
  for (const requestedRef of requestedRefs) {
    if (!isRecord(requestedRef)) continue
    const clientID = readClientID(requestedRef.client_id)
    if (!clientID) continue
    const directID = readPositiveInt(requestedRef.id)
    if (directID !== undefined && directID > 0) {
      out[clientID] = directID
      usedRefIDs.add(directID)
      continue
    }
    const targetName = readText(requestedRef.name)
    const targetKind = readText(requestedRef.kind)
    const targetAlias = readText(requestedRef.alias)
    const matched = snapshotRefs.find((snapshotRef) => {
      if (!isRecord(snapshotRef)) return false
      const snapshotID = readPositiveInt(snapshotRef.id)
      if (snapshotID === undefined || usedRefIDs.has(snapshotID)) return false
      const snapshotName = readText(snapshotRef.name)
      const snapshotKind = readText(snapshotRef.kind)
      const snapshotAlias = readText(snapshotRef.alias)
      return snapshotName === targetName && snapshotKind === targetKind && (targetAlias === '' || targetAlias === snapshotAlias)
    })
    if (!matched) continue
    const snapshotID = readPositiveInt(matched.id)
    if (snapshotID === undefined) continue
    out[clientID] = snapshotID
    usedRefIDs.add(snapshotID)
  }
  return out
}

function parseJSONTextAsRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function normalizeCreativeReferenceSnapshot(response: Record<string, unknown>): Record<string, unknown>[] {
  const snapshot = response.canonical_snapshot
  if (!isRecord(snapshot)) return []
  const creativeReferences = snapshot.creative_references
  return Array.isArray(creativeReferences) ? creativeReferences.filter((value): value is Record<string, unknown> => isRecord(value)) : []
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readClientID(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== trimmed) return undefined
    return parsed
  }
  return undefined
}

function resolveDraftProjectId(target: Record<string, unknown>): number | undefined {
  const fromProject = readPositiveInt(target.projectId)
  if (fromProject !== undefined) return fromProject
  if (readText(target.entityType) !== 'project') return undefined
  return readPositiveInt(target.entityId)
}

import { isRecord } from '../jsonValue.js'
import type { JSONValue } from '../types.js'
import type { AgentDraft, AgentDraftStore } from '../drafts/draftStore.js'
import { validateDraft } from '../drafts/draftStore.js'
import { buildApplyDraftPreview, markDraftApplied, rejectDraft, type ApplyDraftInput } from '../drafts/draftApply.js'
import { BackendApplyHTTPError, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import {
  assetProposalContainsAssetSlots,
  canonicalizeProjectProposalDraftContent,
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
      preview.review,
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
}): Promise<JSONValue> {
  const preview = buildApplyDraftPreview(input.draftStore, input.applyInput)
  if (isAssetPlanningDraft(preview.draft)) {
    const finalDraft = markDraftApplied(input.draftStore, preview.draft, preview.review, input.applyInput, {
      appliedBy: 'movscript-ui',
      backendWritePerformed: false,
      backendApplySkippedReason: 'asset proposal contains candidate plans only; project snapshot apply was skipped',
    })
    return {
      status: 'applied',
      review: preview.review,
      draft: finalDraft,
      message: 'Asset candidate planning draft marked applied locally. Backend project snapshot apply was skipped.',
      backendApply: { performed: false, skippedReason: 'asset proposal contains candidate plans only' },
    } as unknown as JSONValue
  }

  let backendApply: BackendApplyResult
  try {
    backendApply = await input.backendApplyClient.applyReview(preview.review, buildRuntimeDraftBackendAuth(input.applyInput, {
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

  const rebasedContent = canonicalizeProjectProposalDraftContent(preview.draft, backendApply)
  const rebasedDraft = rebasedContent
    ? input.draftStore.updateDraft(preview.draft.id, {
        content: rebasedContent,
        metadata: {
          canonicalizedAfterApply: true,
          canonicalizedAt: input.now(),
        },
      })
    : preview.draft
  const finalDraft = markDraftApplied(input.draftStore, rebasedDraft, preview.review, input.applyInput, {
    appliedBy: 'movscript-ui',
    backendWritePerformed: backendApply.performed,
    backendApply: backendApply as unknown as JSONValue,
    ...(rebasedContent ? { canonicalizedAfterApply: true } : {}),
  })
  return {
    status: 'applied',
    review: preview.review,
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

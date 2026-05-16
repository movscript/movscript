import type { ApplyDraftInput } from '../drafts/draftApply.js'
import type { AgentDraft, AgentDraftStore } from '../drafts/draftStore.js'
import type { JSONValue } from '../types.js'
import { isoNow } from './runtimeIdentity.js'
import {
  applyRuntimeDraftFromUI,
  createRuntimeLocalDraft,
  getRuntimeDraft,
  listRuntimeDrafts,
  patchRuntimeDraft,
  previewRuntimeDraftApply,
  rejectRuntimeDraft,
  simulateRuntimeDraftApply,
  updateRuntimeDraft,
  validateRuntimeDraft,
  type RuntimeDraftBackendApplyClient,
} from './runtimeDraftOperations.js'

export interface RuntimeDraftOperationsBridge {
  listDrafts: (query?: Parameters<typeof listRuntimeDrafts>[0]['query']) => AgentDraft[]
  createLocalDraft: (input: Parameters<typeof createRuntimeLocalDraft>[0]['draftInput']) => AgentDraft
  getDraft: (id: string) => AgentDraft | undefined
  updateDraft: (input: Parameters<typeof updateRuntimeDraft>[0]['draftInput']) => AgentDraft
  patchDraft: (input: Parameters<typeof patchRuntimeDraft>[0]['patchInput']) => JSONValue
  validateDraft: (input: { draftId?: unknown }) => JSONValue
  previewApplyDraft: (input: ApplyDraftInput) => JSONValue
  simulateApplyDraft: (input: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }) => Promise<JSONValue>
  applyDraftFromUI: (input: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }) => Promise<JSONValue>
  rejectDraft: (input: { draftId?: unknown; reason?: unknown }) => AgentDraft
}

export function createRuntimeDraftOperationsBridge(input: {
  draftStore: AgentDraftStore
  backendApplyClient: RuntimeDraftBackendApplyClient
  now?: () => string
}): RuntimeDraftOperationsBridge {
  const now = input.now ?? isoNow
  return {
    listDrafts: (query = {}) => listRuntimeDrafts({ draftStore: input.draftStore, query }),
    createLocalDraft: (draftInput) => createRuntimeLocalDraft({ draftStore: input.draftStore, draftInput }),
    getDraft: (draftId) => getRuntimeDraft({ draftStore: input.draftStore, draftId }),
    updateDraft: (draftInput) => updateRuntimeDraft({ draftStore: input.draftStore, draftInput }),
    patchDraft: (patchInput) => patchRuntimeDraft({ draftStore: input.draftStore, patchInput }),
    validateDraft: (request) => validateRuntimeDraft({ draftStore: input.draftStore, draftId: request.draftId }),
    previewApplyDraft: (applyInput) => previewRuntimeDraftApply({ draftStore: input.draftStore, applyInput }),
    simulateApplyDraft: (applyInput) => simulateRuntimeDraftApply({
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      applyInput,
    }),
    applyDraftFromUI: (applyInput) => applyRuntimeDraftFromUI({
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      applyInput,
      now,
    }),
    rejectDraft: (request) => rejectRuntimeDraft({
      draftStore: input.draftStore,
      draftId: request.draftId,
      reason: request.reason,
    }),
  }
}

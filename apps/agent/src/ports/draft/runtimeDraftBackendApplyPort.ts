import type { ApplyDraftReview } from '../../drafts/draftApply.js'
import type { RuntimeDraftBackendAuthContext } from '../../drafts/draftRuntimeInput.js'
import type { JSONValue } from '../../state/types.js'

export interface RuntimeDraftBackendApplyResult {
  performed: boolean
  method?: 'GET' | 'PATCH' | 'POST'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

export type RuntimeDraftBackendApplyPreviewResult =
  | {
    ok: true
    backendApply: RuntimeDraftBackendApplyResult
  }
  | {
    ok: false
    error: string
    backendError?: JSONValue
  }

export interface RuntimeDraftBackendApplyPort {
  previewApplyReview(
    review: ApplyDraftReview,
    auth?: RuntimeDraftBackendAuthContext,
  ): Promise<RuntimeDraftBackendApplyPreviewResult>

  applyReview(
    review: ApplyDraftReview,
    auth?: RuntimeDraftBackendAuthContext,
  ): Promise<RuntimeDraftBackendApplyResult>
}

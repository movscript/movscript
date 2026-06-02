import type { ApplyWorkspaceReview } from '../../../workspaces/apply/workspaceApply.js'
import type { RuntimeWorkspaceBackendAuthContext } from '../../../workspaces/runtime/input/workspaceRuntimeInput.js'
import type { JSONValue } from '../../../state/shared/types.js'

export interface RuntimeWorkspaceBackendApplyResult {
  performed: boolean
  method?: 'GET' | 'PATCH' | 'POST'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

export type RuntimeWorkspaceBackendApplyPreviewResult =
  | {
    ok: true
    backendApply: RuntimeWorkspaceBackendApplyResult
  }
  | {
    ok: false
    error: string
    backendError?: JSONValue
  }

export interface RuntimeWorkspaceBackendApplyPort {
  previewApplyReview(
    review: ApplyWorkspaceReview,
    auth?: RuntimeWorkspaceBackendAuthContext,
  ): Promise<RuntimeWorkspaceBackendApplyPreviewResult>

  applyReview(
    review: ApplyWorkspaceReview,
    auth?: RuntimeWorkspaceBackendAuthContext,
  ): Promise<RuntimeWorkspaceBackendApplyResult>
}

import type { ApplyWorkspaceReview } from '../../../workspaces/apply/workspaceApply.js'
import type { JSONValue } from '../../../state/shared/types.js'

export type WorkspaceApplyPreviewResult =
  | {
    ok: true
    backendApply: JSONValue
  }
  | {
    ok: false
    error: string
    backendError?: JSONValue
  }

export interface WorkspaceApplyPreviewPort {
  previewApplyReview(review: ApplyWorkspaceReview): Promise<WorkspaceApplyPreviewResult>
}

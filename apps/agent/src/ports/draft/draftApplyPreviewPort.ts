import type { ApplyDraftReview } from '../../drafts/draftApply.js'
import type { JSONValue } from '../../state/types.js'

export type DraftApplyPreviewResult =
  | {
    ok: true
    backendApply: JSONValue
  }
  | {
    ok: false
    error: string
    backendError?: JSONValue
  }

export interface DraftApplyPreviewPort {
  previewApplyReview(review: ApplyDraftReview): Promise<DraftApplyPreviewResult>
}

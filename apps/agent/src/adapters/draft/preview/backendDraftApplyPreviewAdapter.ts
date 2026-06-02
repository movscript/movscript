import { BackendApplyHTTPError, type BackendApplyClient } from '../../../drafts/adapters/backend/backendApplyClient.js'
import type { DraftApplyPreviewPort, DraftApplyPreviewResult } from '../../../ports/draft/preview/draftApplyPreviewPort.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function createBackendDraftApplyPreviewPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview'>,
): DraftApplyPreviewPort {
  return {
    async previewApplyReview(review): Promise<DraftApplyPreviewResult> {
      try {
        return {
          ok: true,
          backendApply: await backendApplyClient.previewApplyReview(review) as unknown as JSONValue,
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        }
      }
    },
  }
}

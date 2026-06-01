import { BackendApplyHTTPError, type BackendApplyClient } from '../../drafts/backendApplyClient.js'
import type { DraftApplyPreviewPort, DraftApplyPreviewResult } from '../../ports/draft/draftApplyPreviewPort.js'
import type { JSONValue } from '../../state/types.js'

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

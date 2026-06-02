import { BackendApplyHTTPError, type BackendApplyClient } from '../../../workspaces/adapters/backend/backendApplyClient.js'
import type { WorkspaceApplyPreviewPort, WorkspaceApplyPreviewResult } from '../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function createBackendWorkspaceApplyPreviewPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview'>,
): WorkspaceApplyPreviewPort {
  return {
    async previewApplyReview(review): Promise<WorkspaceApplyPreviewResult> {
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

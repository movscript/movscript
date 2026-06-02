import {
  BackendApplyHTTPError,
  type BackendApplyAuthContext,
  type BackendApplyClient,
} from '../../../workspaces/adapters/backend/backendApplyClient.js'
import type {
  RuntimeWorkspaceBackendApplyPort,
  RuntimeWorkspaceBackendApplyPreviewResult,
  RuntimeWorkspaceBackendApplyResult,
} from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function createBackendRuntimeWorkspaceApplyPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview' | 'applyReview'>,
): RuntimeWorkspaceBackendApplyPort {
  return {
    async previewApplyReview(review, auth): Promise<RuntimeWorkspaceBackendApplyPreviewResult> {
      try {
        return {
          ok: true,
          backendApply: await backendApplyClient.previewApplyReview(review, auth as BackendApplyAuthContext | undefined) as RuntimeWorkspaceBackendApplyResult,
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        }
      }
    },
    async applyReview(review, auth): Promise<RuntimeWorkspaceBackendApplyResult> {
      return backendApplyClient.applyReview(review, auth as BackendApplyAuthContext | undefined) as Promise<RuntimeWorkspaceBackendApplyResult>
    },
  }
}

export function createBackendRuntimeWorkspaceApplyWriterPort(
  backendApplyClient: Pick<BackendApplyClient, 'applyReview'>,
): Pick<RuntimeWorkspaceBackendApplyPort, 'applyReview'> {
  return {
    async applyReview(review, auth): Promise<RuntimeWorkspaceBackendApplyResult> {
      return backendApplyClient.applyReview(review, auth as BackendApplyAuthContext | undefined) as Promise<RuntimeWorkspaceBackendApplyResult>
    },
  }
}

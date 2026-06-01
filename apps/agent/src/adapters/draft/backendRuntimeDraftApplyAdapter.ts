import {
  BackendApplyHTTPError,
  type BackendApplyAuthContext,
  type BackendApplyClient,
} from '../../drafts/backendApplyClient.js'
import type {
  RuntimeDraftBackendApplyPort,
  RuntimeDraftBackendApplyPreviewResult,
  RuntimeDraftBackendApplyResult,
} from '../../ports/draft/runtimeDraftBackendApplyPort.js'
import type { JSONValue } from '../../state/types.js'

export function createBackendRuntimeDraftApplyPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview' | 'applyReview'>,
): RuntimeDraftBackendApplyPort {
  return {
    async previewApplyReview(review, auth): Promise<RuntimeDraftBackendApplyPreviewResult> {
      try {
        return {
          ok: true,
          backendApply: await backendApplyClient.previewApplyReview(review, auth as BackendApplyAuthContext | undefined) as RuntimeDraftBackendApplyResult,
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        }
      }
    },
    async applyReview(review, auth): Promise<RuntimeDraftBackendApplyResult> {
      return backendApplyClient.applyReview(review, auth as BackendApplyAuthContext | undefined) as Promise<RuntimeDraftBackendApplyResult>
    },
  }
}

export function createBackendRuntimeDraftApplyWriterPort(
  backendApplyClient: Pick<BackendApplyClient, 'applyReview'>,
): Pick<RuntimeDraftBackendApplyPort, 'applyReview'> {
  return {
    async applyReview(review, auth): Promise<RuntimeDraftBackendApplyResult> {
      return backendApplyClient.applyReview(review, auth as BackendApplyAuthContext | undefined) as Promise<RuntimeDraftBackendApplyResult>
    },
  }
}

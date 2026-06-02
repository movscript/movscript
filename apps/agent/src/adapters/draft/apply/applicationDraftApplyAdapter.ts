import { applyRuntimeDraftFromUI } from '../../../application/draft/operations/runtimeDraftOperations.js'
import type { DraftApplyPort } from '../../../ports/draft/apply/draftApplyPort.js'
import type { RuntimeDraftBackendApplyPort } from '../../../ports/draft/backend/runtimeDraftBackendApplyPort.js'

export function createApplicationDraftApplyPort(
  backendApplyPort: Pick<RuntimeDraftBackendApplyPort, 'applyReview'>,
): DraftApplyPort {
  return {
    apply(input) {
      return applyRuntimeDraftFromUI({
        ...input,
        backendApplyPort,
      })
    },
  }
}

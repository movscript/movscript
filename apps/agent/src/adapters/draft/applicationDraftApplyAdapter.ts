import { applyRuntimeDraftFromUI } from '../../application/runtimeDraftOperations.js'
import type { DraftApplyPort } from '../../ports/draft/draftApplyPort.js'
import type { RuntimeDraftBackendApplyPort } from '../../ports/draft/runtimeDraftBackendApplyPort.js'

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

import { applyRuntimeWorkspaceFromUI } from '../../../application/workspace/operations/runtimeWorkspaceOperations.js'
import type { WorkspaceApplyPort } from '../../../ports/workspace/apply/workspaceApplyPort.js'
import type { RuntimeWorkspaceBackendApplyPort } from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'

export function createApplicationWorkspaceApplyPort(
  backendApplyPort: Pick<RuntimeWorkspaceBackendApplyPort, 'applyReview'>,
): WorkspaceApplyPort {
  return {
    apply(input) {
      return applyRuntimeWorkspaceFromUI({
        ...input,
        backendApplyPort,
      })
    },
  }
}

import { getMCPContextSnapshot } from './context/store'
import {
  getMCPServerStatus,
  startMCPHTTPServer,
  stopMCPServer,
} from './serverLifecycle'
import { listTools } from './toolRegistry'
import { handleMCPHTTP } from './rpc/http'

export { getMCPContextSnapshot, getMCPFocusSnapshot, updateMCPContextSnapshot } from './context/store'
export { normalizeBackendHTTPErrorForMCP, setMCPAPIBaseURL } from './backendClient'
export { getMCPServerStatus, stopMCPServer } from './serverLifecycle'
export { listTools } from './toolRegistry'
export { summarizeModelContractForAgent } from './modelContracts'
export { listModels } from './modelCatalog'
export { listScripts } from './scriptList'
export { locateScriptPassages } from './scriptLocate'
export { getWorkspaceModelContract } from './workspaceModelContract'
export { applyWorkspaceReview } from './workspaceReviewApply'
export { readResource } from './resources'
export {
  attachAssetSlotCandidate,
  attachKeyframeCandidate,
} from './candidateAttach'
export {
  queryCreativeReferences,
  queryProductionContext,
} from './semanticQuery'
export { queryShotLibrary } from './shotLibrary'

export async function startMCPServer(): Promise<number> {
  return startMCPHTTPServer(handleMCPHTTP)
}

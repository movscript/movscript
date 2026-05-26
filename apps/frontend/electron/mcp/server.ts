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
export { locateScriptPassages } from './scriptLocate'
export { getDraftModelContract } from './draftModelContract'
export { applyDraftReview } from './draftReviewApply'
export { readResource } from './resources'
export {
  attachAssetSlotCandidate,
  attachKeyframeCandidate,
} from './candidateAttach'
export {
  buildGenerationModelParamRules,
  buildGenerationParamValidationAudit,
  normalizeGenerationExtraParams,
  preflightGenerationParams,
} from './generationModelContracts'
export {
  createGenerationJob,
  waitGenerationJobs,
} from './generationJobs'
export {
  callComfyUITool,
  callWebUITool,
  setMCPGenerationToolsSettings,
  testMCPGenerationToolServer,
} from './generationConnectors'
export {
  queryCreativeReferences,
  queryProductionContext,
} from './semanticQuery'

export async function startMCPServer(): Promise<number> {
  return startMCPHTTPServer(handleMCPHTTP)
}

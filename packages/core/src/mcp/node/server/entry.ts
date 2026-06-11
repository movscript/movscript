import { getMCPContextSnapshot, getMCPFocusSnapshot, updateMCPContextSnapshot } from '../tools/focus/store.js'
import { startMCPHTTPServer } from './lifecycle.js'
import { listTools } from './toolRegistry.js'
import { handleMCPHTTP } from '../protocol/http.js'

export {
  getMCPContextSnapshot,
  getMCPFocusSnapshot,
  updateMCPContextSnapshot,
} from '../tools/focus/store.js'
export { normalizeBackendHTTPErrorForMCP } from '../../../backend/errors.js'
export { listTools } from './toolRegistry.js'
export { summarizeModelContractForAgent } from '../../tools/model/contracts/index.js'
export { listModels } from '../tools/model/actions.js'
export { workspaceInterpret, workspaceGetModel, workspaceReview } from '../tools/workspace/actions.js'
export { readResource } from './resourceRegistry.js'
export { queryShotLibrary } from '../tools/shot-library/actions.js'

export async function startMCPServer(): Promise<number> {
  return startMCPHTTPServer(handleMCPHTTP)
}

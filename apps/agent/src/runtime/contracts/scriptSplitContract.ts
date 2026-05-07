import type { AgentRuntimeContract } from './runtimeContract.js'

export const SCRIPT_SPLIT_RUNTIME_CONTRACT_ID = 'script-split-agent'

export const SCRIPT_SPLIT_RUNTIME_CONTRACT: AgentRuntimeContract = {
  id: SCRIPT_SPLIT_RUNTIME_CONTRACT_ID,
  matches: (manifest) => manifest.id === SCRIPT_SPLIT_RUNTIME_CONTRACT_ID,
  requiresConfiguredModel: true,
}

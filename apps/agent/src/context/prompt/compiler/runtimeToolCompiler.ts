import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { RuntimeModelChatTool } from '../../../model/config/modelConfig.js'
import type { ResolvedToolCatalog } from '../../../state/shared/types.js'
import { resolveRuntimeToolParameters } from './toolSchemas.js'

export function buildRuntimeChatTools(
  catalog: ResolvedToolCatalog,
  contract?: ReturnType<AgentRuntimeContractResolver['find']>,
): RuntimeModelChatTool[] {
  return catalog.available.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(resolveRuntimeToolParameters(tool, contract) ? { parameters: resolveRuntimeToolParameters(tool, contract) } : {}),
    },
  }))
}

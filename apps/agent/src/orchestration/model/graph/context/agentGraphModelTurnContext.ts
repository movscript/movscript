import { modelTurnContext, type ComposedModelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import type { ContextLedger } from '../../../../context/ledger/shared/contextLedgerTypes.js'
import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { AgentGraphInput } from '../../../graph/types/agentGraphTypes.js'
import type { PreparedModelInput } from '../input/agentGraphModelInput.js'

export function composeAgentGraphModelTurn(input: AgentGraphInput, options: {
  preparedInput: PreparedModelInput
  toolLoopHistory: RuntimeModelChatMessage[]
  warnings: string[]
  roundIndex: number
  roundLabel: string
}): ComposedModelTurnContext {
  const { preparedInput } = options
  return modelTurnContext.composeModelTurn({
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
    context: input.context,
    tools: input.capabilities,
    runtimeLimits: input.runtimeLimits,
    memories: input.memories,
    warnings: options.warnings,
    history: preparedInput.promptHistory.messages,
    historyProjection: preparedInput.promptHistory,
    userMessage: preparedInput.effectiveUserMessage,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.historicalVisionContext ? { historicalVisionContext: input.historicalVisionContext } : {}),
    toolLoopHistory: options.toolLoopHistory,
    ...(preparedInput.promptHistory.summary ? { threadSummary: preparedInput.promptHistory.summary } : {}),
    ...(input.runtimeState !== undefined ? { runtimeState: input.runtimeState } : {}),
    ...(input.command ? { command: input.command } : {}),
    ...(input.contractResolver ? { contractResolver: input.contractResolver } : {}),
    ...(input.run.metadata?.contextLedger ? { ledger: input.run.metadata.contextLedger as unknown as ContextLedger } : {}),
    runId: input.run.id,
    threadId: input.run.threadId,
    roundIndex: options.roundIndex,
    roundLabel: options.roundLabel,
  })
}

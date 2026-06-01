import { contextManager, type ComposedModelTurnContext } from '../contextManager/contextManager.js'
import type { ContextLedger } from '../contextManager/types.js'
import type { RuntimeModelChatMessage } from '../model/modelConfig.js'
import type { AgentGraphInput } from './agentGraphTypes.js'
import type { PreparedModelInput } from './agentGraphModelInput.js'

export function composeAgentGraphModelTurn(input: AgentGraphInput, options: {
  preparedInput: PreparedModelInput
  toolLoopHistory: RuntimeModelChatMessage[]
  warnings: string[]
  roundIndex: number
  roundLabel: string
}): ComposedModelTurnContext {
  const { preparedInput } = options
  return contextManager.composeModelTurn({
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
    context: input.context,
    tools: input.capabilities,
    policy: input.policy,
    memories: input.memories,
    warnings: options.warnings,
    history: preparedInput.promptHistory.messages,
    historyProjection: preparedInput.promptHistory,
    userMessage: preparedInput.effectiveUserMessage,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
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

import { parseAgentCommand } from '../context/commandRouter.js'
import { renderLocalFinalAssistantContent } from '../context/localDiagnosticCommands.js'
import { isRecord } from '../jsonValue.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRun, ToolCallOutcome } from '../state/types.js'

export function buildFinalAssistantContent(input: {
  userMessage: string
  modelContent: string
  toolResults: ToolCallOutcome[]
  warnings: string[]
  memories: AgentMemory[]
  run: AgentRun
  memoryStorePath?: string
}): string {
  const command = parseAgentCommand(input.userMessage)
  return renderLocalFinalAssistantContent({
    command,
    run: input.run,
    context: isRecord(input.run.metadata?.context) ? input.run.metadata.context : undefined,
    warnings: input.warnings,
    memories: input.memories,
    toolResults: input.toolResults,
    memoryStorePath: input.memoryStorePath,
    modelContent: input.modelContent,
  })
}

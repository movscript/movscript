import { parseAgentCommand } from '../../../../context/command/commandRouter.js'
import { renderLocalFinalAssistantContent } from '../../../../context/diagnostics/commands/localDiagnosticCommands.js'
import { isRecord } from '../../../../shared/json/jsonValue.js'
import type { AgentMemory } from '../../../../memory/shared/types.js'
import type { AgentRun, ToolCallOutcome } from '../../../../state/shared/types.js'

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

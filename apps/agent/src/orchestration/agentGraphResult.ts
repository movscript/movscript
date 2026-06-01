import type { RuntimeModelChatMessage } from '../model/modelConfig.js'
import { runtimeModelContentText } from '../domains/message/modelMessage.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunStatus, ToolCallOutcome } from '../state/types.js'

export type AgentGraphResult =
  | { status: 'completed'; finalContent: string; assistantContents: string[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'requires_action'; pendingApprovals: AgentApprovalRequest[]; pendingInputRequests?: AgentInputRequest[]; messages: RuntimeModelChatMessage[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'cancelled'; reason?: string }
  | { status: 'failed'; error: string }

export interface AgentGraphResultState {
  history: RuntimeModelChatMessage[]
  warnings: string[]
  toolOutcomes: ToolCallOutcome[]
  finalContent?: string
  status?: AgentRunStatus
  error?: string
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
}

export function buildAgentGraphResult(result: AgentGraphResultState): AgentGraphResult {
  if (result.error) return { status: 'failed', error: result.error }
  if (result.status === 'cancelled') return { status: 'cancelled', reason: 'Run was cancelled.' }
  if (result.status === 'requires_action') {
    return {
      status: 'requires_action',
      pendingApprovals: result.pendingApprovals ?? [],
      pendingInputRequests: result.pendingInputRequests ?? [],
      messages: result.history,
      toolOutcomes: result.toolOutcomes,
      warnings: result.warnings,
    }
  }

  return {
    status: 'completed',
    finalContent: result.finalContent ?? '',
    assistantContents: collectAssistantContents(result.history),
    toolOutcomes: result.toolOutcomes,
    warnings: result.warnings,
  }
}

export function collectAssistantContents(history: RuntimeModelChatMessage[]): string[] {
  const contents: string[] = []
  for (const message of history) {
    if (message.role !== 'assistant') continue
    const content = runtimeModelContentText(message.content).trim()
    if (!content) continue
    if (contents.at(-1) === content) continue
    contents.push(content)
  }
  return contents
}

export function getLastAssistantContent(history: RuntimeModelChatMessage[]): string | undefined {
  for (const message of [...history].reverse()) {
    if (message.role !== 'assistant') continue
    const content = runtimeModelContentText(message.content).trim()
    if (content) return content
  }
  return undefined
}

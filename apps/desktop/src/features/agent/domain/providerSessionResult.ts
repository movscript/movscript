import { isAgentTranscriptAssistantMessage } from '@movscript/agent-protocol'
import i18n from '@/i18n'
import type { AgentRun, AgentThread } from '@movscript/agent-protocol'

export function formatProviderSessionAssistantContent(run: AgentRun, thread: Pick<AgentThread, 'messages'>) {
  const t = i18n.t.bind(i18n)
  const assistant = thread.messages.find((item) => item.id === run.assistantMessageId && isTranscriptAssistantMessage(item))
    ?? [...thread.messages].reverse().find((item) => isTranscriptAssistantMessage(item) && item.runId === run.id)
  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
  const content = assistant?.content
    ?? (run.status === 'failed'
      ? t('agents.chat.task.failed', { error: run.error ?? t('agents.chat.task.unknownError') })
      : run.status === 'cancelled'
        ? t('agents.chat.task.cancelledMessage')
        : run.status === 'requires_action'
          ? pendingInputs.length > 0
            ? t('agents.chat.task.needsInput', {
              items: pendingInputs.map((request) => `- ${request.title}: ${request.question}`).join('\n'),
            })
            : t('agents.chat.task.needsApproval', {
              items: pendingApprovals.map((approval) => `- ${approval.toolName}: ${approval.reason}`).join('\n') || t('agents.chat.task.waitingForToolCallConfirmation'),
            })
          : t('agents.chat.task.noAssistantMessage'))

  if (run.status !== 'completed_with_warnings' || !run.warnings?.length) return content
  const missing = run.warnings.filter((warning) => !content.includes(warning))
  if (missing.length === 0) return content
  return `${content}\n\n${t('agents.chat.task.warnings')}:\n${missing.map((warning) => `- ${warning}`).join('\n')}`
}

function isTranscriptAssistantMessage(message: Pick<AgentThread['messages'][number], 'role' | 'metadata'>): boolean {
  return isAgentTranscriptAssistantMessage(message)
}

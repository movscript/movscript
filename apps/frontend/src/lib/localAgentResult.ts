import i18n from '@/i18n'
import type { AgentRun, AgentThread } from '@/lib/localAgentClient'

export function formatLocalAgentAssistantContent(run: AgentRun, thread: Pick<AgentThread, 'messages'>) {
  const t = i18n.t.bind(i18n)
  const assistant = thread.messages.find((item) => item.id === run.assistantMessageId)
    ?? [...thread.messages].reverse().find((item) => item.role === 'assistant' && item.runId === run.id)
  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
  const content = assistant?.content
    ?? (run.status === 'failed'
      ? t('agents.chat.workflow.failed', { error: run.error ?? t('agents.chat.workflow.unknownError') })
      : run.status === 'cancelled'
        ? t('agents.chat.workflow.cancelledMessage')
        : run.status === 'requires_action'
          ? pendingInputs.length > 0
            ? t('agents.chat.workflow.needsInput', {
              items: pendingInputs.map((request) => `- ${request.title}: ${request.question}`).join('\n'),
            })
            : t('agents.chat.workflow.needsApproval', {
              items: pendingApprovals.map((approval) => `- ${approval.toolName}: ${approval.reason}`).join('\n') || t('agents.chat.workflow.waitingForToolCallConfirmation'),
            })
          : t('agents.chat.workflow.noAssistantMessage'))

  if (run.status !== 'completed_with_warnings' || !run.warnings?.length) return content
  const missing = run.warnings.filter((warning) => !content.includes(warning))
  if (missing.length === 0) return content
  return `${content}\n\n${t('agents.chat.workflow.warnings')}:\n${missing.map((warning) => `- ${warning}`).join('\n')}`
}

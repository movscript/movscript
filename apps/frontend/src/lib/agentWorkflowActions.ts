import { formatLocalAgentAssistantContent } from '@/lib/localAgentResult'
import {
  optimisticApprovalRun,
  optimisticInputAnswerRun,
  upsertWorkflowRunSnapshot,
  type AgentInputAnswer,
} from '@/lib/agentWorkflowInteraction'
import type { AgentRun, AgentThread } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

export type WorkflowConversationRuntimePatch = {
  approving?: boolean
  loading?: boolean
  error?: string
}

export interface AgentWorkflowActionDeps {
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setConversationRuntime: (patch: WorkflowConversationRuntimePatch) => void
  setConversationRun: (run: AgentRun, patch: WorkflowConversationRuntimePatch) => void
  addAssistantMessage: (message: Pick<ChatMessage, 'role' | 'content'> & { meta?: ChatMessage['meta'] }) => void
  getThread: (threadId: string) => Promise<AgentThread>
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  liveEvents: () => ChatRunActivityEvent[]
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
}

export async function approveWorkflowRunAction(input: {
  run: AgentRun
  approvalIds?: string[]
  approveRun: (runId: string, input: { approvalIds?: string[] }) => Promise<AgentRun>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, approvalIds, approveRun, deps } = input
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'approved')))
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    const approvedRun = await approveRun(run.id, { approvalIds })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, approvedRun))
    deps.setConversationRun(approvedRun, { approving: true, loading: true })
    const finalRun = await deps.streamFollowUpRun(approvedRun.id)
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, finalRun))
    const thread = await deps.getThread(finalRun.threadId)
    if (finalRun.status !== 'requires_action') {
      await deps.appendAssistantRunResult(finalRun, thread, deps.liveEvents())
    }
    if (deps.runTouchesAgentCatalog(finalRun)) deps.refreshAgentCatalogContext()
  } catch (error) {
    deps.addAssistantMessage({
      role: 'assistant',
      content: `工具确认失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}

export async function rejectWorkflowRunAction(input: {
  run: AgentRun
  approvalIds?: string[]
  rejectRun: (runId: string, input: { approvalIds?: string[] }) => Promise<AgentRun>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, approvalIds, rejectRun, deps } = input
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'rejected')))
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    const rejectedRun = await rejectRun(run.id, { approvalIds })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, rejectedRun))
    deps.setConversationRun(rejectedRun, { approving: true, loading: true })
    const thread = await deps.getThread(rejectedRun.threadId)
    deps.addAssistantMessage({
      role: 'assistant',
      content: formatLocalAgentAssistantContent(rejectedRun, thread),
      meta: { contextLabels: [`run ${rejectedRun.status}`] },
    })
    if (deps.runTouchesAgentCatalog(rejectedRun)) deps.refreshAgentCatalogContext()
  } catch (error) {
    deps.addAssistantMessage({
      role: 'assistant',
      content: `工具拒绝失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}

export async function answerWorkflowRunInputAction(input: {
  run: AgentRun
  requestId: string
  answer: AgentInputAnswer
  answerRunInput: (runId: string, input: { requestId: string } & AgentInputAnswer) => Promise<AgentRun>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, requestId, answer, answerRunInput, deps } = input
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticInputAnswerRun(run, requestId, answer)))
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    const answeredRun = await answerRunInput(run.id, { requestId, ...answer })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, answeredRun))
    deps.setConversationRun(answeredRun, { approving: true, loading: true })
    const finalRun = await deps.streamFollowUpRun(answeredRun.id)
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, finalRun))
    const thread = await deps.getThread(finalRun.threadId)
    if (finalRun.status !== 'requires_action') {
      await deps.appendAssistantRunResult(finalRun, thread, deps.liveEvents())
    }
    if (deps.runTouchesAgentCatalog(finalRun)) deps.refreshAgentCatalogContext()
  } catch (error) {
    deps.addAssistantMessage({
      role: 'assistant',
      content: `补充信息提交失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}

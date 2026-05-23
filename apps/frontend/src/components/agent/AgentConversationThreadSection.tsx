import React, { type RefObject, type UIEvent } from 'react'
import {
  AgentBody,
  AgentThread,
} from '@movscript/ui'
import { AgentPlanOverviewPanel } from '@/components/agent/AgentPlanOverviewPanel'
import { LocalAgentWorkflowBubble } from '@/components/agent/AgentWorkflowBubble'
import { AgentPinnedStatusShelf } from '@/components/agent/AgentPinnedStatusShelf'
import { LiveRunActivityBubble } from '@/components/agent/AgentRunActivityPanel'
import {
  GenerationProgressBubble,
  MessageBubble,
  StreamingAssistantBubble,
  ThinkingBubble,
  type ThinkingBubbleState,
} from '@/components/agent/AgentChatBubbles'
import { buildAgentConversationThreadItems, type AgentConversationMessageItem } from '@/lib/agentConversationThreadItems'
import { runHasContinuationResumeApproval, type AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { AgentConversationBlock } from '@/lib/agentConversationPresentation'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { PlanDispatchSettings } from '@/lib/agentPlanActions'
import type { AgentTaskGraphSnapshot, AgentPlan, AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'
import { cn } from '@/lib/utils'

export interface AgentConversationThreadSectionProps {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  activeRun: AgentRun | null
  approvingLocalRun: boolean
  bottomRef: RefObject<HTMLDivElement>
  conversationBlocks: AgentConversationBlock[]
  generationProgressStates: GenerationProgressState[]
  messages: ChatMessage[]
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  projectId?: number
  showLocalWorkflow: boolean
  thinkingState: ThinkingBubbleState
  threadRef: RefObject<HTMLDivElement>
  workflowAnswerEchoes: Set<string>
  workflowRunsByResultMessageId: Map<string, AgentRun[]>
  workflowRunsWithoutResultMessage: AgentRun[]
  onAcceptPlanReview: (taskId: string) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onCancelPlanTree: () => void
  onDispatchTaskGraph: () => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectPlanReview: (taskId: string) => void
  onRetaskGraph: () => void
  onReworkPlanReview: (taskId: string) => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onUpdatePlanDispatchSettings: (settings: PlanDispatchSettings) => void
}

export function AgentConversationThreadSection({
  activePlanSnapshot,
  activeRun,
  approvingLocalRun,
  bottomRef,
  conversationBlocks,
  generationProgressStates,
  messages,
  planActionBusy,
  planDispatchSettings,
  projectId,
  showLocalWorkflow,
  thinkingState,
  threadRef,
  workflowAnswerEchoes,
  workflowRunsByResultMessageId,
  workflowRunsWithoutResultMessage,
  onAcceptPlanReview,
  onAnswerLocalRunInput,
  onApproveLocalRun,
  onCancelPlanTree,
  onDispatchTaskGraph,
  onRejectLocalRun,
  onRejectPlanReview,
  onRetaskGraph,
  onReworkPlanReview,
  onScroll,
  onUpdatePlanDispatchSettings,
}: AgentConversationThreadSectionProps) {
  const currentPlan = latestPlanFromMessages(messages)
  const activeRunId = activeRun?.id
  const suppressedWorkflowRunIds = activeRunId && !isTerminalAgentRunStatus(activeRun?.status)
    ? new Set([activeRunId])
    : new Set<string>()
  const threadItems = buildAgentConversationThreadItems({
    messages,
    workflowAnswerEchoes,
    workflowRunsByResultMessageId,
    suppressedWorkflowRunIds,
  })
  const activeRunHasThreadGroup = !!activeRunId
    && threadItems.some((item) => item.type === 'run_group' && item.runId === activeRunId)
  const liveActivityRunIds = new Set(conversationBlocks
    .filter((block) => block.type === 'live_run_activity' && block.run?.id)
    .map((block) => block.type === 'live_run_activity' ? block.run?.id : undefined)
    .filter((id): id is string => Boolean(id)))
  const renderConversationBlock = (block: AgentConversationBlock) => {
    if (block.type === 'assistant_stream') {
      return <StreamingAssistantBubble key={block.id} content={block.content} />
    }
    if (block.type === 'generation_progress') {
      return <GenerationProgressBubble key={block.id} state={block.state} />
    }
    if (block.type === 'live_run_activity') {
      return (
        <LiveRunActivityBubble
          key={block.id}
          run={block.run}
          events={block.events}
          approving={approvingLocalRun}
          onApprove={(approvalIds) => block.run && onApproveLocalRun(block.run.id, approvalIds)}
          onReject={(approvalIds) => block.run && onRejectLocalRun(block.run.id, approvalIds)}
          onAnswerInput={(requestId, answer) => block.run && onAnswerLocalRunInput(block.run.id, requestId, answer)}
        />
      )
    }
    return <ThinkingBubble key={block.id} run={activeRun} state={thinkingState} />
  }

  return (
    <AgentBody className="flex flex-col">
      <AgentPinnedStatusShelf
        plan={currentPlan}
        generationProgressStates={generationProgressStates}
        planSnapshot={activePlanSnapshot}
      />
      <AgentThread
        ref={threadRef}
        onScroll={onScroll}
        className="min-h-0 flex-1"
      >
        {threadItems.map((threadItem) => {
          if (threadItem.type === 'message') {
            return (
              <ThreadMessageBubble
                key={threadItem.id}
                item={threadItem.item}
                projectId={projectId}
                approvingLocalRun={approvingLocalRun}
                onApproveLocalRun={onApproveLocalRun}
                onRejectLocalRun={onRejectLocalRun}
                onAnswerLocalRunInput={onAnswerLocalRunInput}
              />
            )
          }
          return (
            <div
              key={threadItem.id}
              className={cn(
                'space-y-2 border-l border-border/80 pl-3',
                threadItem.items.some((item) => item.message.role === 'user') && 'py-1',
              )}
              data-agent-run-group-id={threadItem.runId}
            >
              {threadItem.items.map((item) => (
                <ThreadMessageBubble
                  key={item.message.id}
                  item={item}
                  projectId={projectId}
                  approvingLocalRun={approvingLocalRun}
                  onApproveLocalRun={onApproveLocalRun}
                  onRejectLocalRun={onRejectLocalRun}
                  onAnswerLocalRunInput={onAnswerLocalRunInput}
                />
              ))}
              {activeRunId === threadItem.runId && conversationBlocks.map(renderConversationBlock)}
            </div>
          )
        })}
        {activeRunId && !activeRunHasThreadGroup && conversationBlocks.length > 0 && (
          <div
            className="space-y-2 border-l border-border/80 pl-3 py-1"
            data-agent-run-group-id={activeRunId}
          >
            {conversationBlocks.map(renderConversationBlock)}
          </div>
        )}
        {!activeRunId && conversationBlocks.map(renderConversationBlock)}
        {showLocalWorkflow && workflowRunsWithoutResultMessage
          .filter((run) => !liveActivityRunIds.has(run.id) || runHasContinuationResumeApproval(run))
          .map((run) => {
            const continuationResumeRun = runHasContinuationResumeApproval(run)
            if (continuationResumeRun) {
              return (
                <LocalAgentWorkflowBubble
                  key={`workflow-resume-${run.id}`}
                  run={run}
                  approving={approvingLocalRun}
                  onApprove={(approvalIds) => onApproveLocalRun(run.id, approvalIds)}
                  onReject={(approvalIds) => onRejectLocalRun(run.id, approvalIds)}
                  onAnswerInput={(requestId, answer) => onAnswerLocalRunInput(run.id, requestId, answer)}
                />
              )
            }
            return (
              <LiveRunActivityBubble
                key={`workflow-live-${run.id}`}
                run={run}
                events={[]}
                approving={approvingLocalRun}
                onApprove={(approvalIds) => onApproveLocalRun(run.id, approvalIds)}
                onReject={(approvalIds) => onRejectLocalRun(run.id, approvalIds)}
                onAnswerInput={(requestId, answer) => onAnswerLocalRunInput(run.id, requestId, answer)}
              />
            )
          })}
        <AgentPlanOverviewPanel
          id="agent-taskGraph-overview"
          snapshot={activePlanSnapshot}
          busy={planActionBusy}
          onDispatch={onDispatchTaskGraph}
          onRetaskGraph={onRetaskGraph}
          onCancelTree={onCancelPlanTree}
          onAcceptReview={onAcceptPlanReview}
          onReworkReview={onReworkPlanReview}
          onRejectReview={onRejectPlanReview}
          dispatchSettings={planDispatchSettings}
          onDispatchSettingsChange={onUpdatePlanDispatchSettings}
        />
        <div ref={bottomRef} />
      </AgentThread>
    </AgentBody>
  )
}

function ThreadMessageBubble({
  item,
  projectId,
  approvingLocalRun,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
}: {
  item: AgentConversationMessageItem
  projectId?: number
  approvingLocalRun: boolean
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
}) {
  const { afterMessageWorkflowRuns, beforeMessageWorkflowRuns, liveWorkflowRuns, message, showMessage } = item
  const workflowRuns = liveWorkflowRuns ?? [...beforeMessageWorkflowRuns, ...afterMessageWorkflowRuns]
  const canInteractWithWorkflowRun = !!liveWorkflowRuns?.length
  const beforeWorkflowRunIds = new Set(beforeMessageWorkflowRuns.map((run) => run.id))
  const beforeWorkflowRuns = liveWorkflowRuns
    ? workflowRuns.filter((run) => beforeWorkflowRunIds.has(run.id))
    : beforeMessageWorkflowRuns
  const afterWorkflowRuns = liveWorkflowRuns
    ? workflowRuns.filter((run) => !beforeWorkflowRunIds.has(run.id))
    : afterMessageWorkflowRuns
  const renderWorkflowRun = (workflowRun: AgentRun) => (
    <LocalAgentWorkflowBubble
      key={`workflow-${workflowRun.id}-${message.id}`}
      run={workflowRun}
      approving={approvingLocalRun}
      onApprove={canInteractWithWorkflowRun ? (approvalIds) => onApproveLocalRun(workflowRun.id, approvalIds) : undefined}
      onReject={canInteractWithWorkflowRun ? (approvalIds) => onRejectLocalRun(workflowRun.id, approvalIds) : undefined}
      onAnswerInput={canInteractWithWorkflowRun ? (requestId, answer) => onAnswerLocalRunInput(workflowRun.id, requestId, answer) : undefined}
    />
  )
  return (
    <React.Fragment>
      {beforeWorkflowRuns.map(renderWorkflowRun)}
      {showMessage && (
        <MessageBubble
          msg={message}
          projectId={projectId}
        />
      )}
      {afterWorkflowRuns.map(renderWorkflowRun)}
    </React.Fragment>
  )
}

function isTerminalAgentRunStatus(status: AgentRun['status'] | undefined): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

function latestPlanFromMessages(messages: ChatMessage[]): AgentPlan | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const plan = messages[index].meta?.planRevision?.snapshot
    if (plan) return plan
  }
  return undefined
}

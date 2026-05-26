import React, { type RefObject, type UIEvent } from 'react'
import {
  AgentBody,
  AgentThread,
} from '@movscript/ui'
import { AgentPlanOverviewPanel } from '@/features/agent/components/AgentPlanOverviewPanel'
import { LocalAgentWorkflowBubble } from '@/features/agent/components/AgentWorkflowBubble'
import { AgentPinnedStatusShelf } from '@/features/agent/components/AgentPinnedStatusShelf'
import { LiveRunActivityBubble } from '@/features/agent/components/AgentRunActivityPanel'
import {
  GenerationProgressBubble,
  MessageBubble,
  StreamingAssistantBubble,
  ThinkingBubble,
} from '@/features/agent/components/AgentChatBubbles'
import {
  type ThinkingBubbleState,
} from '@/features/agent/presentation/agentThinkingBubbleState'
import { buildAgentConversationThreadItems, type AgentConversationMessageItem } from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentInputAnswer } from '@/features/agent/domain/agentWorkflowInteraction'
import type { AgentConversationBlock } from '@/features/agent/domain/agentConversationPresentation'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentTaskGraphSnapshot, AgentPlan, AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { cn } from '@/shared/ui/cn'

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
  const embeddedWorkflowRunIds = workflowRunIdsEmbeddedInAssistantMessages(messages)
  const liveActivityEventsByRunId = liveActivityEventsByRunIdFromBlocks(conversationBlocks)
  const renderableConversationBlocks = conversationBlocks.filter((block) => {
    if (block.type !== 'live_run_activity') return true
    const runId = normalizeRunId(block.run?.id)
    return !runId || !embeddedWorkflowRunIds.has(runId)
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
                embeddedWorkflowRunIds={embeddedWorkflowRunIds}
                liveActivityEventsByRunId={liveActivityEventsByRunId}
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
                  embeddedWorkflowRunIds={embeddedWorkflowRunIds}
                  liveActivityEventsByRunId={liveActivityEventsByRunId}
                  onApproveLocalRun={onApproveLocalRun}
                  onRejectLocalRun={onRejectLocalRun}
                  onAnswerLocalRunInput={onAnswerLocalRunInput}
                />
              ))}
              {activeRunId === threadItem.runId && renderableConversationBlocks.map(renderConversationBlock)}
            </div>
          )
        })}
        {activeRunId && !activeRunHasThreadGroup && renderableConversationBlocks.length > 0 && (
          <div
            className="space-y-2 border-l border-border/80 pl-3 py-1"
            data-agent-run-group-id={activeRunId}
          >
            {renderableConversationBlocks.map(renderConversationBlock)}
          </div>
        )}
        {!activeRunId && renderableConversationBlocks.map(renderConversationBlock)}
        {showLocalWorkflow && workflowRunsWithoutResultMessage
          .filter((run) => !liveActivityRunIds.has(run.id))
          .filter((run) => !embeddedWorkflowRunIds.has(run.id))
          .map((run) => {
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
  embeddedWorkflowRunIds,
  liveActivityEventsByRunId,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
}: {
  item: AgentConversationMessageItem
  projectId?: number
  approvingLocalRun: boolean
  embeddedWorkflowRunIds: Set<string>
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
}) {
  const { afterMessageWorkflowRuns, beforeMessageWorkflowRuns, liveWorkflowRuns, message, showMessage } = item
  const workflowRuns = liveWorkflowRuns ?? [...beforeMessageWorkflowRuns, ...afterMessageWorkflowRuns]
  const canInteractWithWorkflowRun = !!liveWorkflowRuns?.length
  const embeddedWorkflowRun = liveWorkflowRuns?.find((run) => workflowRunEmbedsInMessage(run, message)) ?? null
  const beforeWorkflowRunIds = new Set(beforeMessageWorkflowRuns.map((run) => run.id))
  const beforeWorkflowRuns = liveWorkflowRuns
    ? workflowRuns.filter((run) => run.id !== embeddedWorkflowRun?.id && !embeddedWorkflowRunIds.has(run.id) && beforeWorkflowRunIds.has(run.id))
    : beforeMessageWorkflowRuns
  const afterWorkflowRuns = liveWorkflowRuns
    ? workflowRuns.filter((run) => run.id !== embeddedWorkflowRun?.id && !embeddedWorkflowRunIds.has(run.id) && !beforeWorkflowRunIds.has(run.id))
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
          liveWorkflowRun={embeddedWorkflowRun}
          liveWorkflowEvents={embeddedWorkflowRun ? liveActivityEventsByRunId.get(embeddedWorkflowRun.id) ?? [] : []}
          approvingLocalRun={approvingLocalRun}
          onApproveLocalRun={onApproveLocalRun}
          onRejectLocalRun={onRejectLocalRun}
          onAnswerLocalRunInput={onAnswerLocalRunInput}
        />
      )}
      {afterWorkflowRuns.map(renderWorkflowRun)}
    </React.Fragment>
  )
}

function workflowRunEmbedsInMessage(run: AgentRun, message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false
  const runId = normalizeRunId(message.meta?.runtimeMessage?.runId)
    ?? normalizeRunId(message.meta?.localRunActivity?.runId)
  return runId === run.id
}

function workflowRunIdsEmbeddedInAssistantMessages(messages: ChatMessage[]): Set<string> {
  const runIds = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const runId = normalizeRunId(message.meta?.runtimeMessage?.runId)
      ?? normalizeRunId(message.meta?.localRunActivity?.runId)
    if (runId) runIds.add(runId)
  }
  return runIds
}

function liveActivityEventsByRunIdFromBlocks(blocks: AgentConversationBlock[]): Map<string, ChatRunActivityEvent[]> {
  const byRunId = new Map<string, ChatRunActivityEvent[]>()
  for (const block of blocks) {
    if (block.type !== 'live_run_activity') continue
    const runId = normalizeRunId(block.run?.id)
    if (!runId || block.events.length === 0) continue
    byRunId.set(runId, [...(byRunId.get(runId) ?? []), ...block.events])
  }
  return byRunId
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

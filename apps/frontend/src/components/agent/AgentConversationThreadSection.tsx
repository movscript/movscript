import React, { type RefObject, type UIEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecks, Search, Sparkles, Workflow } from 'lucide-react'
import {
  AgentBody,
  AgentEmpty,
  AgentSuggestion,
  AgentSuggestions,
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
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
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
  onDraftInput: (input: string) => void
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
  onDraftInput,
  onRejectLocalRun,
  onRejectPlanReview,
  onRetaskGraph,
  onReworkPlanReview,
  onScroll,
  onUpdatePlanDispatchSettings,
}: AgentConversationThreadSectionProps) {
  const { t } = useTranslation()
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
        {messages.length === 0 && (
          <AgentEmpty className="min-h-0 py-6">
            <p className="type-body font-medium text-foreground">
              {t('agents.chat.startChat')}
            </p>
            <AgentSuggestions className="grid w-full grid-cols-2 gap-2">
              {[
                { icon: <ListChecks size={14} />, label: t('agents.chat.suggestions.planProject') },
                { icon: <Sparkles size={14} />, label: t('agents.chat.suggestions.createContentUnit') },
                { icon: <Search size={14} />, label: t('agents.chat.suggestions.reviewAssets') },
                { icon: <Workflow size={14} />, label: t('agents.chat.suggestions.buildWorkflow') },
              ].map((item) => (
                <AgentSuggestion
                  key={item.label}
                  onClick={() => onDraftInput(item.label)}
                  className="justify-start rounded-md text-left type-caption"
                >
                  {item.icon}
                  <span className="leading-tight">{item.label}</span>
                </AgentSuggestion>
              ))}
            </AgentSuggestions>
          </AgentEmpty>
        )}
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
        {showLocalWorkflow && workflowRunsWithoutResultMessage.filter((run) => !liveActivityRunIds.has(run.id)).map((run) => (
          <LiveRunActivityBubble
            key={`workflow-live-${run.id}`}
            run={run}
            events={[]}
            approving={approvingLocalRun}
            onApprove={(approvalIds) => onApproveLocalRun(run.id, approvalIds)}
            onReject={(approvalIds) => onRejectLocalRun(run.id, approvalIds)}
            onAnswerInput={(requestId, answer) => onAnswerLocalRunInput(run.id, requestId, answer)}
          />
        ))}
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
  const { beforeMessageWorkflowRuns, liveWorkflowRuns, message, showMessage } = item
  const workflowRuns = liveWorkflowRuns ?? beforeMessageWorkflowRuns
  const canInteractWithWorkflowRun = !!liveWorkflowRuns?.length
  return (
    <React.Fragment>
      {workflowRuns.map((workflowRun) => (
        <LocalAgentWorkflowBubble
          key={`workflow-${workflowRun.id}-${message.id}`}
          run={workflowRun}
          approving={approvingLocalRun}
          onApprove={canInteractWithWorkflowRun ? (approvalIds) => onApproveLocalRun(workflowRun.id, approvalIds) : undefined}
          onReject={canInteractWithWorkflowRun ? (approvalIds) => onRejectLocalRun(workflowRun.id, approvalIds) : undefined}
          onAnswerInput={canInteractWithWorkflowRun ? (requestId, answer) => onAnswerLocalRunInput(workflowRun.id, requestId, answer) : undefined}
        />
      ))}
      {showMessage && (
        <MessageBubble
          msg={message}
          projectId={projectId}
        />
      )}
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

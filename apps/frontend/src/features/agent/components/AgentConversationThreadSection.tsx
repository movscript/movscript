import React, { type RefObject, type UIEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AgentBody,
  AgentThreadFill,
  Button,
} from '@movscript/ui'
import { AgentPlanOverviewPanel } from '@/features/agent/components/AgentPlanOverviewPanel'
import { LocalAgentRunInteractionBubble } from '@/features/agent/components/AgentRunInteractionBubble'
import { AgentPinnedStatusShelf, hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
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
import {
  AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE,
  buildAgentThreadRenderWindow,
} from '@/features/agent/domain/agentMessageRenderWindow'
import {
  agentConversationMessageItemHasInteractionRuns,
  agentConversationMessageItemsEqual,
  agentConversationMessageItemUsesLiveRunInteractionState,
} from '@/features/agent/presentation/agentMessageRenderMemo'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentConversationBlock } from '@/features/agent/domain/agentConversationPresentation'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentTaskGraphSnapshot, AgentPlan, AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

const EMPTY_RUN_ACTIVITY_EVENTS: ChatRunActivityEvent[] = []

export interface AgentConversationThreadSectionProps {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  activeRun: AgentRun | null
  approvingLocalRun: boolean
  bottomRef: RefObject<HTMLDivElement>
  conversationId: string
  conversationBlocks: AgentConversationBlock[]
  generationProgressStates: GenerationProgressState[]
  messages: ChatMessage[]
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  pinnedStatusExpanded?: boolean
  projectId?: number
  showLocalRunInteraction: boolean
  thinkingState: ThinkingBubbleState
  threadRef: RefObject<HTMLDivElement>
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  interactionRunsWithoutResultMessage: AgentRun[]
  onAcceptPlanReview: (taskId: string) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onCancelPlanTree: () => void
  onDispatchTaskGraph: () => void
  onPinnedStatusExpandedChange?: (expanded: boolean) => void
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
  conversationId,
  conversationBlocks,
  generationProgressStates,
  messages,
  planActionBusy,
  planDispatchSettings,
  pinnedStatusExpanded,
  projectId,
  showLocalRunInteraction,
  thinkingState,
  threadRef,
  runInteractionAnswerEchoes,
  interactionRunsByResultMessageId,
  interactionRunsWithoutResultMessage,
  onAcceptPlanReview,
  onAnswerLocalRunInput,
  onApproveLocalRun,
  onCancelPlanTree,
  onDispatchTaskGraph,
  onPinnedStatusExpandedChange,
  onRejectLocalRun,
  onRejectPlanReview,
  onRetaskGraph,
  onReworkPlanReview,
  onScroll,
  onUpdatePlanDispatchSettings,
}: AgentConversationThreadSectionProps) {
  const { t } = useTranslation()
  const [visibleThreadItemCount, setVisibleThreadItemCount] = useState(AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE)
  useEffect(() => {
    setVisibleThreadItemCount(AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE)
  }, [conversationId])

  const currentPlan = useMemo(() => latestPlanFromMessages(messages), [messages])
  const showPinnedStatus = useMemo(() => hasAgentPinnedStatus({
    plan: currentPlan,
    generationProgressStates,
    planSnapshot: activePlanSnapshot,
  }) && (pinnedStatusExpanded ?? true), [activePlanSnapshot, currentPlan, generationProgressStates, pinnedStatusExpanded])
  const activeRunId = activeRun?.id
  const suppressedInteractionRunIds = useMemo(() => activeRunId && !isTerminalAgentRunStatus(activeRun?.status)
    ? new Set([activeRunId])
    : new Set<string>(), [activeRun?.status, activeRunId])
  const threadItems = useMemo(() => buildAgentConversationThreadItems({
    messages,
    runInteractionAnswerEchoes,
    interactionRunsByResultMessageId,
    suppressedInteractionRunIds,
  }), [messages, suppressedInteractionRunIds, runInteractionAnswerEchoes, interactionRunsByResultMessageId])
  const embeddedInteractionRunIds = useMemo(() => interactionRunIdsEmbeddedInAssistantMessages(messages), [messages])
  const liveActivityEventsByRunId = useMemo(() => liveActivityEventsByRunIdFromBlocks(conversationBlocks), [conversationBlocks])
  const renderableConversationBlocks = useMemo(() => conversationBlocks.filter((block) => {
    if (block.type !== 'live_run_activity') return true
    const runId = normalizeRunId(block.run?.id)
    return !runId || !embeddedInteractionRunIds.has(runId)
  }), [conversationBlocks, embeddedInteractionRunIds])
  const threadWindow = useMemo(() => buildAgentThreadRenderWindow({
    items: threadItems,
    visibleCount: visibleThreadItemCount,
    keepItemIds: activeRunId ? [`run-group:${activeRunId}`] : [],
  }), [activeRunId, threadItems, visibleThreadItemCount])
  const activeRunHasThreadGroup = !!activeRunId
    && threadWindow.visibleItems.some((item) => item.type === 'run_group' && item.runId === activeRunId)
  const liveActivityRunIds = useMemo(() => new Set(conversationBlocks
    .filter((block) => block.type === 'live_run_activity' && block.run?.id)
    .map((block) => block.type === 'live_run_activity' ? block.run?.id : undefined)
    .filter((id): id is string => Boolean(id))), [conversationBlocks])

  function showOlderThreadItems() {
    const thread = threadRef.current
    const previousScrollHeight = thread?.scrollHeight ?? 0
    const previousScrollTop = thread?.scrollTop ?? 0
    setVisibleThreadItemCount(threadWindow.nextVisibleCount)
    requestAnimationFrame(() => {
      if (!thread) return
      thread.scrollTop = previousScrollTop + Math.max(0, thread.scrollHeight - previousScrollHeight)
    })
  }

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
    <AgentBody className="ai-agent-panel-thread-body">
      {showPinnedStatus ? (
        <AgentPinnedStatusShelf
          plan={currentPlan}
          generationProgressStates={generationProgressStates}
          planSnapshot={activePlanSnapshot}
          expanded={pinnedStatusExpanded}
          onExpandedChange={onPinnedStatusExpandedChange}
        />
      ) : null}
      <AgentThreadFill
        ref={threadRef}
        onScroll={onScroll}
        data-agent-thread-hidden-items={threadWindow.hiddenCount}
        data-agent-thread-visible-items={threadWindow.visibleCount}
        data-agent-thread-total-items={threadWindow.totalCount}
      >
        {threadWindow.hiddenCount > 0 && (
          <div className="ai-agent-panel-thread-window-control">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={showOlderThreadItems}
            >
              {t('agents.chat.loadMoreHistory')} ({threadWindow.hiddenCount})
            </Button>
          </div>
        )}
        {threadWindow.visibleItems.map((threadItem) => {
          if (threadItem.type === 'message') {
            return (
              <ThreadMessageBubble
                key={threadItem.id}
                item={threadItem.item}
                projectId={projectId}
                approvingLocalRun={approvingLocalRun}
                embeddedInteractionRunIds={embeddedInteractionRunIds}
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
              className="ai-agent-panel-run-group"
              data-has-user={threadItem.items.some((item) => item.message.role === 'user') ? 'true' : undefined}
              data-agent-run-group-id={threadItem.runId}
            >
              {threadItem.items.map((item) => (
                <ThreadMessageBubble
                  key={item.message.id}
                  item={item}
                  projectId={projectId}
                  approvingLocalRun={approvingLocalRun}
                  embeddedInteractionRunIds={embeddedInteractionRunIds}
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
            className="ai-agent-panel-run-group"
            data-has-user="true"
            data-agent-run-group-id={activeRunId}
          >
            {renderableConversationBlocks.map(renderConversationBlock)}
          </div>
        )}
        {!activeRunId && renderableConversationBlocks.map(renderConversationBlock)}
        {showLocalRunInteraction && interactionRunsWithoutResultMessage
          .filter((run) => !liveActivityRunIds.has(run.id))
          .filter((run) => !embeddedInteractionRunIds.has(run.id))
          .map((run) => {
            return (
              <LiveRunActivityBubble
                key={`run-interaction-live-${run.id}`}
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
      </AgentThreadFill>
    </AgentBody>
  )
}

interface ThreadMessageBubbleProps {
  item: AgentConversationMessageItem
  projectId?: number
  approvingLocalRun: boolean
  embeddedInteractionRunIds: Set<string>
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
}

const ThreadMessageBubble = React.memo(function ThreadMessageBubble({
  item,
  projectId,
  approvingLocalRun,
  embeddedInteractionRunIds,
  liveActivityEventsByRunId,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
}: ThreadMessageBubbleProps) {
  const { afterMessageInteractionRuns, beforeMessageInteractionRuns, liveInteractionRuns, message, showMessage } = item
  const interactionRuns = liveInteractionRuns ?? [...beforeMessageInteractionRuns, ...afterMessageInteractionRuns]
  const canInteractWithInteractionRun = !!liveInteractionRuns?.length
  const embeddedInteractionRun = liveInteractionRuns?.find((run) => interactionRunEmbedsInMessage(run, message)) ?? null
  const beforeInteractionRunIds = new Set(beforeMessageInteractionRuns.map((run) => run.id))
  const beforeInteractionRuns = liveInteractionRuns
    ? interactionRuns.filter((run) => run.id !== embeddedInteractionRun?.id && !embeddedInteractionRunIds.has(run.id) && beforeInteractionRunIds.has(run.id))
    : beforeMessageInteractionRuns
  const afterInteractionRuns = liveInteractionRuns
    ? interactionRuns.filter((run) => run.id !== embeddedInteractionRun?.id && !embeddedInteractionRunIds.has(run.id) && !beforeInteractionRunIds.has(run.id))
    : afterMessageInteractionRuns
  const renderInteractionRun = (interactionRun: AgentRun) => (
    <LocalAgentRunInteractionBubble
      key={`run-interaction-${interactionRun.id}-${message.id}`}
      run={interactionRun}
      approving={approvingLocalRun}
      onApprove={canInteractWithInteractionRun ? (approvalIds) => onApproveLocalRun(interactionRun.id, approvalIds) : undefined}
      onReject={canInteractWithInteractionRun ? (approvalIds) => onRejectLocalRun(interactionRun.id, approvalIds) : undefined}
      onAnswerInput={canInteractWithInteractionRun ? (requestId, answer) => onAnswerLocalRunInput(interactionRun.id, requestId, answer) : undefined}
    />
  )
  return (
    <React.Fragment>
      {beforeInteractionRuns.map(renderInteractionRun)}
      {showMessage && (
        <MessageBubble
          msg={message}
          projectId={projectId}
          liveInteractionRun={embeddedInteractionRun}
          liveInteractionEvents={embeddedInteractionRun ? liveActivityEventsByRunId.get(embeddedInteractionRun.id) ?? EMPTY_RUN_ACTIVITY_EVENTS : EMPTY_RUN_ACTIVITY_EVENTS}
          approvingLocalRun={approvingLocalRun}
          onApproveLocalRun={onApproveLocalRun}
          onRejectLocalRun={onRejectLocalRun}
          onAnswerLocalRunInput={onAnswerLocalRunInput}
        />
      )}
      {afterInteractionRuns.map(renderInteractionRun)}
    </React.Fragment>
  )
}, areThreadMessageBubblePropsEqual)

function areThreadMessageBubblePropsEqual(
  prev: ThreadMessageBubbleProps,
  next: ThreadMessageBubbleProps,
) {
  const comparesLiveRunInteractionState = agentConversationMessageItemUsesLiveRunInteractionState(prev.item)
    || agentConversationMessageItemUsesLiveRunInteractionState(next.item)
  const comparesRunInteractionActions = agentConversationMessageItemHasInteractionRuns(prev.item)
    || agentConversationMessageItemHasInteractionRuns(next.item)
  return agentConversationMessageItemsEqual(prev.item, next.item)
    && prev.projectId === next.projectId
    && (!comparesRunInteractionActions || prev.approvingLocalRun === next.approvingLocalRun)
    && (!comparesLiveRunInteractionState || prev.embeddedInteractionRunIds === next.embeddedInteractionRunIds)
    && (!comparesLiveRunInteractionState || prev.liveActivityEventsByRunId === next.liveActivityEventsByRunId)
    && (!comparesRunInteractionActions || prev.onApproveLocalRun === next.onApproveLocalRun)
    && (!comparesRunInteractionActions || prev.onRejectLocalRun === next.onRejectLocalRun)
    && (!comparesRunInteractionActions || prev.onAnswerLocalRunInput === next.onAnswerLocalRunInput)
}

function interactionRunEmbedsInMessage(run: AgentRun, message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false
  const runId = normalizeRunId(message.meta?.runtimeMessage?.runId)
    ?? normalizeRunId(message.meta?.localRunActivity?.runId)
  return runId === run.id
}

function interactionRunIdsEmbeddedInAssistantMessages(messages: ChatMessage[]): Set<string> {
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

export function latestPlanFromMessages(messages: ChatMessage[]): AgentPlan | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const plan = messages[index].meta?.planRevision?.snapshot
    if (plan) return plan
  }
  return undefined
}

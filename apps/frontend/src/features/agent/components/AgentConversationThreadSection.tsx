import React, { type RefObject, type UIEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  AgentBody,
  AgentEmpty,
  AgentThreadFill,
  Button,
} from '@movscript/ui'
import { AgentPlanOverviewPanel } from '@/features/agent/components/AgentPlanOverviewPanel'
import { LocalAgentRunInteractionBubble } from '@/features/agent/components/AgentRunInteractionBubble'
import { AgentPinnedStatusShelf, hasAgentPinnedStatus } from '@/features/agent/components/AgentPinnedStatusShelf'
import { LiveRunActivityBubble } from '@/features/agent/components/AgentRunActivityPanel'
import {
  MessageBubble,
  StreamingAssistantBubble,
  ThinkingBubble,
} from '@/features/agent/components/AgentChatBubbles'
import {
  type ThinkingBubbleState,
} from '@/features/agent/presentation/agentThinkingBubbleState'
import {
  buildAgentConversationThreadItems,
  runIdsWithTimelineActivityItems,
  splitRunGroupItemsForLiveBlocks,
  type AgentTranscriptMessageItem,
} from '@/features/agent/domain/agentConversationThreadItems'
import { transcriptAssistantRelatedRunId } from '@/features/agent/domain/agentMessageBoundaries'
import {
  AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE,
  buildAgentThreadRenderWindow,
} from '@/features/agent/domain/agentMessageRenderWindow'
import {
  agentTranscriptMessageItemHasInteractionRuns,
  agentTranscriptMessageItemsEqual,
  agentTranscriptMessageItemUsesLiveRunInteractionState,
} from '@/features/agent/presentation/agentMessageRenderMemo'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentConversationBlock } from '@/features/agent/domain/agentConversationPresentation'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import { isTerminalAgentRunStatus } from '@/features/agent/domain/agentRunControl'
import type { AgentTaskGraphSnapshot, AgentPlan, AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
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
  timelineLoading?: boolean
  timelineItems: AgentTimelineItem[]
  transcriptMessages: ChatMessage[]
  transcriptMessageCount?: number
  lastTranscriptAt?: number
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
  timelineLoading = false,
  timelineItems,
  transcriptMessages,
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

  const currentPlan = useMemo(() => latestPlanFromTimelineItems(timelineItems), [timelineItems])
  const showPinnedStatus = useMemo(() => hasAgentPinnedStatus({
    plan: currentPlan,
    generationProgressStates,
    planSnapshot: activePlanSnapshot,
  }), [activePlanSnapshot, currentPlan, generationProgressStates])
  const activeRunId = activeRun?.id
  const suppressedInteractionRunIds = useMemo(() => activeRunId
    && activeRun?.status !== 'requires_action'
    && !isTerminalAgentRunStatus(activeRun?.status)
    ? new Set([activeRunId])
    : new Set<string>(), [activeRun?.status, activeRunId])
  const threadItems = useMemo(() => buildAgentConversationThreadItems({
    transcriptMessages,
    timelineItems,
    runInteractionAnswerEchoes,
    interactionRunsByResultMessageId,
    suppressedInteractionRunIds,
  }), [timelineItems, transcriptMessages, suppressedInteractionRunIds, runInteractionAnswerEchoes, interactionRunsByResultMessageId])
  const anchoredInteractionRunIds = useMemo(() => new Set(Array.from(interactionRunsByResultMessageId.values())
    .flat()
    .map((run) => run.id)), [interactionRunsByResultMessageId])
  const activityMessageRunIds = useMemo(() => runIdsWithTimelineActivityItems(timelineItems), [timelineItems])
  const embeddedInteractionRunIds = useMemo(() => interactionRunIdsEmbeddedInAssistantMessages(threadItems), [threadItems])
  const hiddenActivityActionItemIds = useMemo(
    () => standaloneInteractionActionItemIds(threadItems),
    [threadItems],
  )
  const liveActivityEventsByRunId = useMemo(() => liveActivityEventsByRunIdFromBlocks(conversationBlocks), [conversationBlocks])
  const renderableConversationBlocks = useMemo(() => conversationBlocks.filter((block) => {
    if (block.type !== 'live_run_activity') return true
    const runId = normalizeRunId(block.run?.id)
    if (!runId) return true
    if (activityMessageRunIds.has(runId)) return false
    return !(block.run?.status === 'requires_action' && anchoredInteractionRunIds.has(runId))
  }), [activityMessageRunIds, anchoredInteractionRunIds, conversationBlocks])
  const threadWindow = useMemo(() => buildAgentThreadRenderWindow({
    items: threadItems,
    visibleCount: visibleThreadItemCount,
    keepItemIds: activeRunId ? [`run-group:${activeRunId}`] : [],
  }), [activeRunId, threadItems, visibleThreadItemCount])
  const activeRunHasThreadGroup = !!activeRunId
    && threadWindow.visibleItems.some((item) => item.type === 'run_group' && item.runId === activeRunId)
  const showTimelineLoading = timelineLoading
    && transcriptMessages.length === 0
    && threadWindow.visibleItems.length === 0
    && renderableConversationBlocks.length === 0
    && !activeRunId
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
          hiddenActionItemIds={hiddenActivityActionItemIds}
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
        {showTimelineLoading && (
          <AgentEmpty role="status" aria-live="polite">
            <Loader2 size={16} className="animate-spin" />
            <span>{t('agents.chat.loadingConversationTimeline')}</span>
          </AgentEmpty>
        )}
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
                hiddenActivityActionItemIds={hiddenActivityActionItemIds}
                liveActivityEventsByRunId={liveActivityEventsByRunId}
                onApproveLocalRun={onApproveLocalRun}
                onRejectLocalRun={onRejectLocalRun}
                onAnswerLocalRunInput={onAnswerLocalRunInput}
              />
            )
          }
          const activeRunGroupSplit = activeRunId === threadItem.runId
            ? splitRunGroupItemsForLiveBlocks(threadItem.items)
            : null
          const beforeLiveBlocks = activeRunGroupSplit?.beforeLiveBlocks ?? threadItem.items
          const afterLiveBlocks = activeRunGroupSplit?.afterLiveBlocks ?? []
          return (
            <div
              key={threadItem.id}
              className="ai-agent-panel-run-group"
              data-has-user={threadItem.items.some((item) => item.message.role === 'user') ? 'true' : undefined}
              data-agent-run-group-id={threadItem.runId}
            >
              {beforeLiveBlocks.map((item) => (
                <ThreadMessageBubble
                  key={item.message.id}
                  item={item}
                  projectId={projectId}
                  approvingLocalRun={approvingLocalRun}
                  hiddenActivityActionItemIds={hiddenActivityActionItemIds}
                  liveActivityEventsByRunId={liveActivityEventsByRunId}
                  onApproveLocalRun={onApproveLocalRun}
                  onRejectLocalRun={onRejectLocalRun}
                  onAnswerLocalRunInput={onAnswerLocalRunInput}
                />
              ))}
              {activeRunId === threadItem.runId && renderableConversationBlocks.map(renderConversationBlock)}
              {afterLiveBlocks.map((item) => (
                <ThreadMessageBubble
                  key={item.message.id}
                  item={item}
                  projectId={projectId}
                  approvingLocalRun={approvingLocalRun}
                  hiddenActivityActionItemIds={hiddenActivityActionItemIds}
                  liveActivityEventsByRunId={liveActivityEventsByRunId}
                  onApproveLocalRun={onApproveLocalRun}
                  onRejectLocalRun={onRejectLocalRun}
                  onAnswerLocalRunInput={onAnswerLocalRunInput}
                />
              ))}
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
                hiddenActionItemIds={hiddenActivityActionItemIds}
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
  item: AgentTranscriptMessageItem
  projectId?: number
  approvingLocalRun: boolean
  hiddenActivityActionItemIds: Set<string>
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>
  onApproveLocalRun: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
}

const ThreadMessageBubble = React.memo(function ThreadMessageBubble({
  item,
  projectId,
  approvingLocalRun,
  hiddenActivityActionItemIds,
  liveActivityEventsByRunId,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
}: ThreadMessageBubbleProps) {
  const { afterMessageInteractionRuns, beforeMessageInteractionRuns, liveInteractionRuns, message, showMessage } = item
  const canInteractWithInteractionRun = !!liveInteractionRuns?.length
  const {
    afterInteractionRuns,
    beforeInteractionRuns,
    embeddedInteractionRun,
  } = renderedInteractionRunsForMessageItem(item)
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
          timelineActivity={item.timelineActivity}
          liveInteractionRun={embeddedInteractionRun}
          liveInteractionEvents={embeddedInteractionRun ? liveActivityEventsByRunId.get(embeddedInteractionRun.id) ?? EMPTY_RUN_ACTIVITY_EVENTS : EMPTY_RUN_ACTIVITY_EVENTS}
          approvingLocalRun={approvingLocalRun}
          onApproveLocalRun={onApproveLocalRun}
          onRejectLocalRun={onRejectLocalRun}
          onAnswerLocalRunInput={onAnswerLocalRunInput}
          hiddenActivityActionItemIds={hiddenActivityActionItemIds}
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
  const comparesLiveRunInteractionState = agentTranscriptMessageItemUsesLiveRunInteractionState(prev.item)
    || agentTranscriptMessageItemUsesLiveRunInteractionState(next.item)
  const comparesRunInteractionActions = agentTranscriptMessageItemHasInteractionRuns(prev.item)
    || agentTranscriptMessageItemHasInteractionRuns(next.item)
  return agentTranscriptMessageItemsEqual(prev.item, next.item)
    && prev.projectId === next.projectId
    && (!comparesRunInteractionActions || prev.approvingLocalRun === next.approvingLocalRun)
    && prev.hiddenActivityActionItemIds === next.hiddenActivityActionItemIds
    && (!comparesLiveRunInteractionState || prev.liveActivityEventsByRunId === next.liveActivityEventsByRunId)
    && (!comparesRunInteractionActions || prev.onApproveLocalRun === next.onApproveLocalRun)
    && (!comparesRunInteractionActions || prev.onRejectLocalRun === next.onRejectLocalRun)
    && (!comparesRunInteractionActions || prev.onAnswerLocalRunInput === next.onAnswerLocalRunInput)
}

function renderedInteractionRunsForMessageItem(
  item: AgentTranscriptMessageItem,
): {
  beforeInteractionRuns: AgentRun[]
  afterInteractionRuns: AgentRun[]
  embeddedInteractionRun: AgentRun | null
} {
  const { afterMessageInteractionRuns, beforeMessageInteractionRuns, liveInteractionRuns } = item
  const interactionRuns = liveInteractionRuns ?? [...beforeMessageInteractionRuns, ...afterMessageInteractionRuns]
  const embeddedInteractionRun = liveInteractionRuns?.find((run) => interactionRunEmbedsInMessage(run, item)) ?? null
  const beforeInteractionRunIds = new Set(beforeMessageInteractionRuns.map((run) => run.id))
  if (liveInteractionRuns) {
    return {
      embeddedInteractionRun,
      beforeInteractionRuns: interactionRuns.filter((run) => (
        run.id !== embeddedInteractionRun?.id
        && beforeInteractionRunIds.has(run.id)
      )),
      afterInteractionRuns: interactionRuns.filter((run) => (
        run.id !== embeddedInteractionRun?.id
        && !beforeInteractionRunIds.has(run.id)
      )),
    }
  }
  return {
    embeddedInteractionRun,
    beforeInteractionRuns: beforeMessageInteractionRuns,
    afterInteractionRuns: afterMessageInteractionRuns,
  }
}

function standaloneInteractionActionItemIds(
  threadItems: ReturnType<typeof buildAgentConversationThreadItems>,
): Set<string> {
  const ids = new Set<string>()
  for (const threadItem of threadItems) {
    const messageItems = threadItem.type === 'message' ? [threadItem.item] : threadItem.items
    for (const item of messageItems) {
      const { beforeInteractionRuns, afterInteractionRuns } = renderedInteractionRunsForMessageItem(item)
      for (const run of [...beforeInteractionRuns, ...afterInteractionRuns]) collectInteractionActionItemIds(run, ids)
    }
  }
  return ids
}

function collectInteractionActionItemIds(run: AgentRun, ids: Set<string>) {
  for (const approval of run.pendingApprovals ?? []) ids.add(`approval-${approval.id}`)
  for (const request of run.pendingInputRequests ?? []) ids.add(`input-${request.id}`)
}

function interactionRunEmbedsInMessage(run: AgentRun, item: AgentTranscriptMessageItem): boolean {
  const runId = transcriptAssistantRelatedRunId(item.message)
    ?? normalizeRunId(item.timelineActivity?.runId)
  return runId === run.id
}

function interactionRunIdsEmbeddedInAssistantMessages(threadItems: ReturnType<typeof buildAgentConversationThreadItems>): Set<string> {
  const runIds = new Set<string>()
  for (const threadItem of threadItems) {
    const messageItems = threadItem.type === 'message' ? [threadItem.item] : threadItem.items
    for (const item of messageItems) {
      const runId = transcriptAssistantRelatedRunId(item.message)
        ?? normalizeRunId(item.timelineActivity?.runId)
      if (runId) runIds.add(runId)
    }
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

export function latestPlanFromTimelineItems(items: AgentTimelineItem[]): AgentPlan | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item || !isPlanStatusTimelineItem(item)) continue
    const plan = item.meta?.planRevision?.snapshot
    if (plan) return plan
  }
  return undefined
}

function isPlanStatusTimelineItem(item: AgentTimelineItem): boolean {
  return item.origin === 'system_runtime'
    && item.purpose === 'status'
    && item.surface === 'status_strip'
    && item.contentPromptEligibility === 'exclude'
    && !!item.meta?.planRevision
}

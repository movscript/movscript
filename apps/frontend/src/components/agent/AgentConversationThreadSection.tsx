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
import { LiveRunActivityBubble } from '@/components/agent/AgentRunActivityPanel'
import {
  GenerationProgressBubble,
  MessageBubble,
  StreamingAssistantBubble,
  ThinkingBubble,
  type ThinkingBubbleState,
} from '@/components/agent/AgentChatBubbles'
import { LocalAgentWorkflowBubble } from '@/components/agent/AgentWorkflowBubble'
import { buildAgentConversationMessageItems } from '@/lib/agentConversationThreadItems'
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { AgentConversationBlock } from '@/lib/agentConversationPresentation'
import type { PlanDispatchSettings } from '@/lib/agentPlanActions'
import type { AgentPlanSnapshot, AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

export interface AgentConversationThreadSectionProps {
  activePlanSnapshot?: AgentPlanSnapshot
  activeRun: AgentRun | null
  approvingLocalRun: boolean
  bottomRef: RefObject<HTMLDivElement>
  conversationBlocks: AgentConversationBlock[]
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
  onAnswerLocalRunInput: (requestId: string, answer: AgentInputAnswer) => void
  onApproveLocalRun: (approvalIds?: string[]) => void
  onCancelPlanTree: () => void
  onDispatchPlan: () => void
  onDraftInput: (input: string) => void
  onRejectLocalRun: (approvalIds?: string[]) => void
  onRejectPlanReview: (taskId: string) => void
  onReplan: () => void
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
  onDispatchPlan,
  onDraftInput,
  onRejectLocalRun,
  onRejectPlanReview,
  onReplan,
  onReworkPlanReview,
  onScroll,
  onUpdatePlanDispatchSettings,
}: AgentConversationThreadSectionProps) {
  const { t } = useTranslation()

  return (
    <AgentBody>
      <AgentThread
        ref={threadRef}
        onScroll={onScroll}
      >
        {messages.length === 0 && (
          <AgentEmpty className="min-h-0 py-6">
            <p className="text-sm font-medium text-foreground">
              {t('agents.chat.startChat')}
            </p>
            <AgentSuggestions className="grid w-full grid-cols-2 gap-2">
              {[
                { icon: <ListChecks size={13} />, label: t('agents.chat.suggestions.planProject') },
                { icon: <Sparkles size={13} />, label: t('agents.chat.suggestions.createContentUnit') },
                { icon: <Search size={13} />, label: t('agents.chat.suggestions.reviewAssets') },
                { icon: <Workflow size={13} />, label: t('agents.chat.suggestions.buildWorkflow') },
              ].map((item) => (
                <AgentSuggestion
                  key={item.label}
                  onClick={() => onDraftInput(item.label)}
                  className="justify-start rounded-md text-left text-[11px]"
                >
                  {item.icon}
                  <span className="leading-tight">{item.label}</span>
                </AgentSuggestion>
              ))}
            </AgentSuggestions>
          </AgentEmpty>
        )}
        {buildAgentConversationMessageItems({
          messages,
          workflowAnswerEchoes,
          workflowRunsByResultMessageId,
        }).map(({ beforeMessageWorkflowRuns, liveWorkflowRuns, message, showMessage }) => {
          return (
            <React.Fragment key={message.id}>
              {beforeMessageWorkflowRuns.map((run) => (
                <LocalAgentWorkflowBubble
                  key={`workflow-before-result-${run.id}`}
                  run={run}
                  approving={approvingLocalRun}
                  onApprove={liveWorkflowRuns ? onApproveLocalRun : undefined}
                  onReject={liveWorkflowRuns ? onRejectLocalRun : undefined}
                  onAnswerInput={liveWorkflowRuns ? onAnswerLocalRunInput : undefined}
                />
              ))}
              {showMessage && <MessageBubble msg={message} projectId={projectId} />}
            </React.Fragment>
          )
        })}
        {conversationBlocks.map((block) => {
          if (block.type === 'assistant_stream') {
            return <StreamingAssistantBubble key={block.id} content={block.content} />
          }
          if (block.type === 'generation_progress') {
            return <GenerationProgressBubble key={block.id} state={block.state} />
          }
          if (block.type === 'live_run_activity') {
            return <LiveRunActivityBubble key={block.id} run={block.run} events={block.events} />
          }
          return <ThinkingBubble key={block.id} run={activeRun} state={thinkingState} />
        })}
        {showLocalWorkflow && workflowRunsWithoutResultMessage.map((run) => (
          <LocalAgentWorkflowBubble
            key={`workflow-live-${run.id}`}
            run={run}
            approving={approvingLocalRun}
            onApprove={onApproveLocalRun}
            onReject={onRejectLocalRun}
            onAnswerInput={onAnswerLocalRunInput}
          />
        ))}
        <AgentPlanOverviewPanel
          snapshot={activePlanSnapshot}
          busy={planActionBusy}
          onDispatch={onDispatchPlan}
          onReplan={onReplan}
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

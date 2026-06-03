import React, { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Bot, Check, Copy, Loader2, Settings2 } from 'lucide-react'
import {
  AgentChatAttachmentGrid,
  AgentChatBubbleStack,
  AgentChatContentStack,
  AgentChatFooterBadges,
  AgentChatMessage,
  AgentChatResultStack,
  AgentChatStatusLine,
  AgentChatTinyBadge,
  AgentChatTinyStatusBadge,
  AgentModelSetupCallout,
  AgentModelSetupCalloutAction,
  AgentModelSetupCalloutBody,
  AgentModelSetupCalloutContent,
  AgentModelSetupCalloutDescription,
  AgentModelSetupCalloutIcon,
  AgentModelSetupCalloutTitle,
  Button,
} from '@movscript/ui'
import { agentMessageDividerLabel, formatAgentDividerTime } from '@/features/agent/domain/agentMessageDivider'
import { toolNameFromToolCallStreamEvent } from '@/features/agent/domain/agentRunActivity'
import { type ThinkingBubbleState } from '@/features/agent/presentation/agentThinkingBubbleState'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { GenerationParamAuditCard, GenerationValidationErrorCard } from '@/features/agent/components/GenerationCards'
import { GeneratedResultCard } from '@/features/agent/components/GeneratedResultCard'
import {
  AgentAttachmentPreview as AttachmentPreview,
  AgentMarkdownContent as MarkdownContent,
  AgentMessageSection,
} from '@/features/agent/components/AgentMessageContent'
import { AgentWorkspaceResultCards } from '@/features/agent/components/AgentWorkspaceResultCards'
import { AgentActivityDividerMenu, AgentActivityFeedView } from '@/features/agent/components/AgentActivityFeed'
import { buildAgentActivityFeed } from '@/features/agent/domain/agentActivityFeed'
import { transcriptAssistantRuntimeMessageRunId } from '@/features/agent/domain/agentMessageBoundaries'
import { runtimeInputDisplayDeliveryStatus } from '@/features/agent/domain/agentConversationThreadItems'
import { RunActivityTitleBubble } from '@/features/agent/components/AgentRunActivityPanel'
import { localAgentApprovalDetails } from '@/features/agent/components/AgentRunInteractionBubble'
import { shallowReferenceArrayEqual } from '@/features/agent/presentation/agentMessageRenderMemo'
import { useAgentMessagePresentationModel } from '@/features/agent/presentation/useAgentMessagePresentationModel'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { ChatMessage, ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function ThinkingBubble({ state = { status: 'thinking' } }: { run: AgentRun | null; state?: ThinkingBubbleState }) {
  const reasoning = state.reasoning?.trim() ?? ''
  const toolLabel = state.toolName ? agentToolNameLabel(state.toolName) : undefined
  const label = state.status === 'calling_tool'
    ? `调用工具${toolLabel ? `：${toolLabel}` : ''}`
    : state.status === 'preparing_tool_call'
      ? `准备调用工具${toolLabel ? `：${toolLabel}` : ''}`
      : state.status === 'preparing_request'
        ? '准备请求中'
        : state.status === 'retrying_model' ? state.label ?? '模型请求重试中' : '思考中'
  const detail = reasoning || fallbackThinkingDetail(state)
  return (
    <AgentChatBubbleStack>
      <AgentChatMessage
        role="assistant"
        avatar={<Bot size={14} />}
        head={<AgentMessageHeadLabel>{formatAgentDividerTime(undefined)}</AgentMessageHeadLabel>}
        footer={(
          <AgentChatTinyBadge variant="outline">
            {label}
          </AgentChatTinyBadge>
        )}
      >
        <AgentChatContentStack>
          <AgentChatStatusLine>
            <Loader2 size={12} className="animate-spin" />
            <span>{label}</span>
          </AgentChatStatusLine>
          {detail ? <MarkdownContent text={detail} /> : null}
        </AgentChatContentStack>
      </AgentChatMessage>
    </AgentChatBubbleStack>
  )
}

function fallbackThinkingDetail(state: ThinkingBubbleState): string {
  if (state.status === 'calling_tool' || state.status === 'preparing_tool_call') return ''
  if (state.status === 'preparing_request') return '正在准备请求'
  if (state.status === 'retrying_model') return state.label ?? '模型请求重试中'
  return '正在分析请求和上下文'
}

interface MessageBubbleProps {
  msg: ChatMessage
  projectId?: number
  timelineActivity?: ChatRunActivity
  liveInteractionRun?: AgentRun | null
  liveInteractionEvents?: ChatRunActivityEvent[]
  approvingLocalRun?: boolean
  onApproveLocalRun?: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun?: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput?: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  hiddenActivityActionItemIds?: Set<string>
}

export const MessageBubble = React.memo(function MessageBubble({
  msg,
  projectId,
  timelineActivity,
  liveInteractionRun,
  liveInteractionEvents = [],
  approvingLocalRun = false,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
  hiddenActivityActionItemIds,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = useMemo(() => new Date(msg.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }), [locale, msg.timestamp])
  const presentation = useAgentMessagePresentationModel(msg, timelineActivity)
  const runtimeInput = msg.meta?.runtimeInput
  const runtimeRunId = transcriptAssistantRuntimeMessageRunId(msg)
  const runtimeInputDeliveryStatus = runtimeInputDisplayDeliveryStatus(msg)
  const runtimeInputDeliveryLabel = runtimeInputDeliveryStatus === 'pending'
    ? '正在同步到运行中对话'
    : runtimeInputDeliveryStatus === 'accepted'
      ? '已加入运行中对话'
      : runtimeInputDeliveryStatus === 'consumed'
        ? '已被模型读取'
        : runtimeInputDeliveryStatus === 'failed' ? '同步失败' : undefined
  const {
    contextLabels,
    workspaceArtifacts,
    generationJobs,
    generationParamAudits,
    generationValidationErrors,
    timelineActivity: historicalTimelineActivity,
    messageAttachments,
    generatedMediaAttachments,
    compactAttachments,
    displayContent,
    showModelSetupAction,
    showLargeMedia,
    hasResultSection,
    hasDiagnosticSection,
  } = presentation
  const activityFeedRun = !isUser ? liveInteractionRun ?? null : null
  const hasActivityContent = useMemo(() => !isUser && (
    activityFeedRun
      ? runActivityHasVisibleContent(undefined, activityFeedRun, liveInteractionEvents, hiddenActivityActionItemIds)
      : !!historicalTimelineActivity && runActivityHasVisibleContent(historicalTimelineActivity, undefined, undefined, hiddenActivityActionItemIds)
  ), [activityFeedRun, hiddenActivityActionItemIds, historicalTimelineActivity, isUser, liveInteractionEvents])
  const hasMessageBody = isUser
    ? !!displayContent.trim() || compactAttachments.length > 0
    : hasActivityContent
      || !!displayContent.trim()
      || showModelSetupAction
      || hasResultSection
      || hasDiagnosticSection
  const hasFooter = contextLabels.length > 0 || !!runtimeInputDeliveryLabel
  const assistantHeadLabel = !isUser ? agentMessageDividerLabel(time, historicalTimelineActivity) : undefined

  if (!hasMessageBody && !hasFooter) return null

  function copy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentChatMessage
      role={isUser ? 'user' : 'assistant'}
      avatar={isUser ? '我' : <Bot size={14} />}
      author={isUser ? 'You' : undefined}
      time={isUser ? time : undefined}
      data-agent-message-id={msg.id}
      data-agent-runtime-thread-id={msg.meta?.runtimeMessage?.threadId}
      data-agent-runtime-message-id={msg.meta?.runtimeMessage?.messageId}
      data-agent-runtime-run-id={runtimeRunId}
      head={assistantHeadLabel ? <AgentMessageHeadLabel>{assistantHeadLabel}</AgentMessageHeadLabel> : undefined}
      actions={isUser ? (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={copy}
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      ) : hasActivityContent && !activityFeedRun ? (
        <AgentActivityDividerMenu activity={historicalTimelineActivity} />
      ) : undefined}
      footer={(contextLabels.length > 0 || runtimeInputDeliveryLabel) && (
        <AgentChatFooterBadges align={isUser ? 'end' : 'start'}>
          {runtimeInputDeliveryLabel && (
            <AgentChatTinyStatusBadge
              tone={runtimeInputDeliveryStatus === 'failed' ? 'danger' : runtimeInputDeliveryStatus === 'pending' ? 'neutral' : 'neutral'}
              title={runtimeInput?.error}
            >
              {runtimeInputDeliveryStatus === 'pending' && <Loader2 size={10} className="mr-1 inline animate-spin" />}
              {runtimeInputDeliveryStatus === 'failed' && <AlertCircle size={10} className="mr-1 inline" />}
              {runtimeInputDeliveryLabel}
            </AgentChatTinyStatusBadge>
          )}
          {contextLabels.map((label) => (
            <AgentChatTinyBadge key={label}>
              {label}
            </AgentChatTinyBadge>
          ))}
        </AgentChatFooterBadges>
      )}
    >
      {!isUser && hasActivityContent && activityFeedRun && (
        <AgentActivityFeedView
          activity={undefined}
          run={activityFeedRun}
          events={liveInteractionEvents}
          className={displayContent ? 'mb-2' : undefined}
          approving={approvingLocalRun}
          onApprove={onApproveLocalRun ? (approvalIds) => onApproveLocalRun(activityFeedRun.id, approvalIds) : undefined}
          onReject={onRejectLocalRun ? (approvalIds) => onRejectLocalRun(activityFeedRun.id, approvalIds) : undefined}
          onAnswerInput={onAnswerLocalRunInput ? (requestId, answer) => onAnswerLocalRunInput(activityFeedRun.id, requestId, answer) : undefined}
          approvalDetails={localAgentApprovalDetails}
          hiddenActionItemIds={hiddenActivityActionItemIds}
        />
      )}
      {!isUser && hasActivityContent && !activityFeedRun && historicalTimelineActivity && (
        <RunActivityTitleBubble
          activity={historicalTimelineActivity}
          title="运行过程"
          className={displayContent ? 'mb-2' : undefined}
        />
      )}
      {displayContent && <MarkdownContent text={displayContent} attachments={messageAttachments} />}
      {showModelSetupAction && (
        <AgentModelSetupCallout>
          <AgentModelSetupCalloutBody>
            <AgentModelSetupCalloutIcon>
              <Settings2 size={14} />
            </AgentModelSetupCalloutIcon>
            <AgentModelSetupCalloutContent>
              <AgentModelSetupCalloutTitle>{t('agents.chat.modelSetupAction.title')}</AgentModelSetupCalloutTitle>
              <AgentModelSetupCalloutDescription>{t('agents.chat.modelSetupAction.description')}</AgentModelSetupCalloutDescription>
              <AgentModelSetupCalloutAction
                type="button"
                onClick={() => void openAdminConsole(apiBaseURL, '/models')}
              >
                {t('agents.chat.modelSetupAction.openModels')}
              </AgentModelSetupCalloutAction>
            </AgentModelSetupCalloutContent>
          </AgentModelSetupCalloutBody>
        </AgentModelSetupCallout>
      )}
      {hasResultSection && (
        <AgentChatResultStack>
          {showLargeMedia && <GeneratedResultCard attachments={generatedMediaAttachments} projectId={projectId} />}
          <AgentWorkspaceResultCards artifacts={workspaceArtifacts} />
          {compactAttachments.length > 0 && (
            <AgentChatAttachmentGrid columns={compactAttachments.length > 1 ? 2 : 1}>
              {compactAttachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} compact />
              ))}
            </AgentChatAttachmentGrid>
          )}
        </AgentChatResultStack>
      )}
      {hasDiagnosticSection && (
        <AgentMessageSection title={t('agents.chat.messageSections.diagnostics')} tone="diagnostic" defaultOpen={!displayContent}>
          <GenerationValidationErrorCard errors={generationValidationErrors} />
          <GenerationParamAuditCard audits={generationParamAudits} />
        </AgentMessageSection>
      )}
      {isUser && compactAttachments.length > 0 && (
        <AgentChatAttachmentGrid columns={compactAttachments.length > 1 ? 2 : 1}>
          {compactAttachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} compact />
          ))}
        </AgentChatAttachmentGrid>
      )}
    </AgentChatMessage>
  )
}, areMessageBubblePropsEqual)

function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps) {
  return prev.msg === next.msg
    && prev.projectId === next.projectId
    && prev.timelineActivity === next.timelineActivity
    && prev.liveInteractionRun === next.liveInteractionRun
    && shallowReferenceArrayEqual(prev.liveInteractionEvents, next.liveInteractionEvents)
    && prev.approvingLocalRun === next.approvingLocalRun
    && prev.onApproveLocalRun === next.onApproveLocalRun
    && prev.onRejectLocalRun === next.onRejectLocalRun
    && prev.onAnswerLocalRunInput === next.onAnswerLocalRunInput
    && prev.hiddenActivityActionItemIds === next.hiddenActivityActionItemIds
}

function runActivityHasVisibleContent(
  activity?: ChatRunActivity,
  run?: AgentRun | null,
  events?: ChatRunActivityEvent[],
  hiddenActionItemIds?: Set<string>,
): boolean {
  const feed = buildAgentActivityFeed({ activity, run, events, hiddenActionItemIds })
  return !!feed && (feed.items.length > 0 || feed.rounds.length > 0)
}

export function StreamingAssistantBubble({ content }: { content: string }) {
  const { t } = useTranslation()
  if (!content.trim()) return null
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      head={<AgentMessageHeadLabel>{formatAgentDividerTime(undefined)}</AgentMessageHeadLabel>}
      footer={(
        <AgentChatFooterBadges>
          <AgentChatTinyBadge>
            {t('agents.chat.streaming')}
          </AgentChatTinyBadge>
        </AgentChatFooterBadges>
      )}
    >
      <StreamingAssistantText text={content} />
    </AgentChatMessage>
  )
}

function StreamingAssistantText({ text }: { text: string }) {
  return (
    <div>
      {text.split('\n').map((line, index, lines) => (
        <React.Fragment key={index}>
          {line}
          {index < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  )
}

function AgentMessageHeadLabel({ children }: { children: ReactNode }) {
  return <span className="ms-agent-message__head-label">{children}</span>
}

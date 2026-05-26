import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  AgentRuntimeStatusContent,
  AgentRuntimeStatusDetail,
  AgentRuntimeStatusHeader,
  AgentRuntimeStatusSuccessIcon,
  Button,
} from '@movscript/ui'
import { buildAgentMessagePresentation } from '@/features/agent/domain/agentMessagePresentation'
import { hydrateHistoricalGeneratedAttachments } from '@/features/agent/domain/agentMessageViewModel'
import { agentMessageDividerLabel, formatAgentDividerTime } from '@/features/agent/domain/agentMessageDivider'
import { toolNameFromToolCallStreamEvent } from '@/features/agent/domain/agentRunActivity'
import { type ThinkingBubbleState } from '@/features/agent/presentation/agentThinkingBubbleState'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { GenerationParamAuditCard, GenerationProgressCard, GenerationValidationErrorCard } from '@/features/agent/components/GenerationCards'
import { GeneratedResultCard } from '@/features/agent/components/GeneratedResultCard'
import {
  AgentAttachmentPreview as AttachmentPreview,
  AgentMarkdownContent as MarkdownContent,
  AgentMessageSection,
} from '@/features/agent/components/AgentMessageContent'
import { ContextDiagnosticCard } from '@/features/agent/components/ContextDiagnosticCard'
import { AgentDraftResultCards } from '@/features/agent/components/AgentDraftResultCards'
import { AgentPlanRevisionCard } from '@/features/agent/components/AgentPlanCard'
import { AgentActivityDividerMenu, AgentActivityFeedView } from '@/features/agent/components/AgentActivityFeed'
import { buildAgentActivityFeed } from '@/features/agent/domain/agentActivityFeed'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import { shouldRenderRuntimeStatusOnly, type RuntimeStatusMessage } from '@/features/agent/domain/agentRuntimeStatusMessage'
import { localAgentApprovalDetails } from '@/features/agent/components/AgentWorkflowBubble'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentWorkflowInteraction'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

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
        data-agent-divider-label={formatAgentDividerTime(undefined)}
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

export function GenerationProgressBubble({ state }: { state: GenerationProgressState }) {
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      data-agent-divider-label={formatAgentDividerTime(state.firstSeenAt ?? state.updatedAt)}
      footer={(
        <AgentChatTinyBadge variant={state.terminal ? 'outline' : 'soft'}>
          {state.terminal ? '生成已结束' : '生成监控中'}
        </AgentChatTinyBadge>
      )}
    >
      <GenerationProgressCard state={state} />
    </AgentChatMessage>
  )
}

export function MessageBubble({
  msg,
  projectId,
  liveWorkflowRun,
  liveWorkflowEvents = [],
  approvingLocalRun = false,
  onApproveLocalRun,
  onRejectLocalRun,
  onAnswerLocalRunInput,
}: {
  msg: ChatMessage
  projectId?: number
  liveWorkflowRun?: AgentRun | null
  liveWorkflowEvents?: ChatRunActivityEvent[]
  approvingLocalRun?: boolean
  onApproveLocalRun?: (runId: string, approvalIds?: string[]) => void
  onRejectLocalRun?: (runId: string, approvalIds?: string[]) => void
  onAnswerLocalRunInput?: (runId: string, requestId: string, answer: AgentInputAnswer) => void
}) {
  const { t, i18n } = useTranslation()
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = new Date(msg.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const initialPresentation = useMemo(() => buildAgentMessagePresentation(msg), [msg])
  const { data: historicalGeneratedAttachments = [] } = useQuery({
    queryKey: ['agent-historical-generated-attachments', msg.id, initialPresentation.missingTextOutputResourceIds],
    queryFn: () => hydrateHistoricalGeneratedAttachments(msg.content, msg.attachments ?? []),
    enabled: !isUser && initialPresentation.missingTextOutputResourceIds.length > 0,
    staleTime: 60_000,
  })
  const presentation = useMemo(
    () => buildAgentMessagePresentation(msg, historicalGeneratedAttachments),
    [historicalGeneratedAttachments, msg],
  )
  const runtimeInput = msg.meta?.runtimeInput
  const planRevision = msg.meta?.planRevision
  const runtimeInputStatus = runtimeInput?.status
  const runtimeInputLabel = runtimeInput?.status === 'pending'
    ? '等待送达运行中任务'
    : runtimeInput?.status === 'accepted'
      ? '已进入运行中任务'
      : runtimeInput?.status === 'consumed'
        ? '已被模型读取'
        : runtimeInput?.status === 'failed' ? '送达失败' : undefined
  const {
    contextDiagnostic,
    contextLabels,
    draftArtifacts,
    generationJobs,
    generationParamAudits,
    generationValidationErrors,
    localRunActivity,
    runtimeStatus,
    messageAttachments,
    generatedMediaAttachments,
    compactAttachments,
    displayContent,
    showModelSetupAction,
    showLargeMedia,
    hasResultSection,
    hasDiagnosticSection,
  } = presentation
  const activityFeedRun = !isUser ? liveWorkflowRun ?? null : null
  const hasActivityContent = !isUser && (
    activityFeedRun
      ? runActivityHasVisibleContent(undefined, activityFeedRun, liveWorkflowEvents)
      : !!localRunActivity && runActivityHasVisibleContent(localRunActivity)
  )
  const hasMessageBody = isUser
    ? !!displayContent.trim() || compactAttachments.length > 0
    : hasActivityContent
      || !!planRevision
      || !!displayContent.trim()
      || showModelSetupAction
      || hasResultSection
      || hasDiagnosticSection
  const hasFooter = contextLabels.length > 0 || !!runtimeInputLabel
  const asyncWorkHandoffOnly = !isUser
    && shouldRenderRuntimeStatusOnly({
      content: msg.content,
      runtimeStatus,
      hasDiagnosticSection,
      hasResultSection,
      planRevision,
      showModelSetupAction,
    })

  if (asyncWorkHandoffOnly && runtimeStatus) return <RuntimeStatusBubble status={runtimeStatus} />
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
      data-agent-runtime-run-id={msg.meta?.runtimeMessage?.runId}
      data-agent-divider-label={!isUser ? agentMessageDividerLabel(time, localRunActivity) : undefined}
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
      ) : undefined}
      footer={(contextLabels.length > 0 || runtimeInputLabel) && (
        <AgentChatFooterBadges align={isUser ? 'end' : 'start'}>
          {runtimeInputLabel && (
            <AgentChatTinyStatusBadge
              tone={runtimeInputStatus === 'failed' ? 'danger' : runtimeInputStatus === 'pending' ? 'neutral' : 'neutral'}
              title={runtimeInput?.error}
            >
              {runtimeInputStatus === 'pending' && <Loader2 size={10} className="mr-1 inline animate-spin" />}
              {runtimeInputStatus === 'failed' && <AlertCircle size={10} className="mr-1 inline" />}
              {runtimeInputLabel}
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
      {!isUser && hasActivityContent && !activityFeedRun && <AgentActivityDividerMenu activity={localRunActivity} />}
      {!isUser && hasActivityContent && (
        <AgentActivityFeedView
          activity={activityFeedRun ? undefined : localRunActivity}
          run={activityFeedRun}
          events={activityFeedRun ? liveWorkflowEvents : undefined}
          className={displayContent || planRevision ? 'mb-2' : undefined}
          approving={approvingLocalRun}
          onApprove={activityFeedRun && onApproveLocalRun ? (approvalIds) => onApproveLocalRun(activityFeedRun.id, approvalIds) : undefined}
          onReject={activityFeedRun && onRejectLocalRun ? (approvalIds) => onRejectLocalRun(activityFeedRun.id, approvalIds) : undefined}
          onAnswerInput={activityFeedRun && onAnswerLocalRunInput ? (requestId, answer) => onAnswerLocalRunInput(activityFeedRun.id, requestId, answer) : undefined}
          approvalDetails={localAgentApprovalDetails}
        />
      )}
      {planRevision
        ? <AgentPlanRevisionCard revision={planRevision} />
        : displayContent && <MarkdownContent text={displayContent} attachments={messageAttachments} />}
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
          <AgentDraftResultCards artifacts={draftArtifacts} />
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
        <AgentMessageSection title={t('agents.chat.messageSections.diagnostics')} tone="diagnostic" defaultOpen={!!contextDiagnostic && !displayContent}>
          {contextDiagnostic && <ContextDiagnosticCard diagnostic={contextDiagnostic} />}
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
}

function runActivityHasVisibleContent(activity?: NonNullable<ChatMessage['meta']>['localRunActivity'], run?: AgentRun | null, events?: ChatRunActivityEvent[]): boolean {
  const feed = buildAgentActivityFeed({ activity, run, events })
  return !!feed && (feed.items.length > 0 || feed.rounds.length > 0)
}

function RuntimeStatusBubble({ status }: { status: RuntimeStatusMessage }) {
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      data-agent-divider-label={formatAgentDividerTime(undefined)}
      footer={(
        <AgentChatTinyBadge variant="outline">
          Runtime
        </AgentChatTinyBadge>
      )}
    >
      <AgentRuntimeStatusContent>
        <AgentRuntimeStatusHeader>
          <AgentRuntimeStatusSuccessIcon>
            <Check size={12} />
          </AgentRuntimeStatusSuccessIcon>
          <span>{status.title}</span>
        </AgentRuntimeStatusHeader>
        <AgentRuntimeStatusDetail>{status.detail}</AgentRuntimeStatusDetail>
        {(status.workId || status.workKind || status.workStatus) && (
          <AgentChatFooterBadges>
            {status.workKind && <AgentChatTinyBadge>{status.workKind}</AgentChatTinyBadge>}
            {status.workStatus && <AgentChatTinyBadge variant="outline">{status.workStatus}</AgentChatTinyBadge>}
            {status.workId && <AgentChatTinyBadge variant="outline">{status.workId}</AgentChatTinyBadge>}
          </AgentChatFooterBadges>
        )}
      </AgentRuntimeStatusContent>
    </AgentChatMessage>
  )
}

export function StreamingAssistantBubble({ content }: { content: string }) {
  const { t } = useTranslation()
  if (!content.trim()) return null
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      data-agent-divider-label={formatAgentDividerTime(undefined)}
      footer={(
        <AgentChatFooterBadges>
          <AgentChatTinyBadge>
            {t('agents.chat.streaming')}
          </AgentChatTinyBadge>
        </AgentChatFooterBadges>
      )}
    >
      <MarkdownContent text={content} />
    </AgentChatMessage>
  )
}

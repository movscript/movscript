import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Bot, Check, Copy, Loader2, Settings2 } from 'lucide-react'
import { AgentChatMessage, Badge, Button, ReviewCallout, semanticToneClass } from '@movscript/ui'
import { buildAgentMessagePresentation } from '@/lib/agentMessagePresentation'
import { hydrateHistoricalGeneratedAttachments } from '@/lib/agentMessageViewModel'
import { agentMessageDividerLabel, formatAgentDividerTime } from '@/lib/agentMessageDivider'
import { reasoningTextFromStreamEvent, toolNameFromToolCallStreamEvent } from '@/lib/agentRunActivity'
import { openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { cn } from '@/lib/utils'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { GenerationParamAuditCard, GenerationProgressCard, GenerationValidationErrorCard } from '@/components/agent/GenerationCards'
import { GeneratedResultCard } from '@/components/agent/GeneratedResultCard'
import {
  AgentAttachmentPreview as AttachmentPreview,
  AgentMarkdownContent as MarkdownContent,
  AgentMessageSection,
} from '@/components/agent/AgentMessageContent'
import { ContextDiagnosticCard } from '@/components/agent/ContextDiagnosticCard'
import { AgentDraftResultCards } from '@/components/agent/AgentDraftResultCards'
import { AgentPlanRevisionCard } from '@/components/agent/AgentPlanCard'
import { AgentActivityDividerMenu, AgentActivityFeedView } from '@/components/agent/AgentActivityFeed'
import { buildAgentActivityFeed } from '@/lib/agentActivityFeed'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import { shouldRenderRuntimeStatusOnly, type RuntimeStatusMessage } from '@/lib/agentRuntimeStatusMessage'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

export type ThinkingBubbleState = AgentLivePendingAssistantState

export function getThinkingBubbleState(run: AgentRun | null, events: ChatRunActivityEvent[]): ThinkingBubbleState {
  const retryStatus = latestModelRetryStatus(events)
  if (retryStatus) return { status: 'retrying_model', label: retryStatus }
  const reasoning = latestReasoningStatus(events)
  if (!run || run.status !== 'in_progress') return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  const activeToolStep = [...run.steps].reverse().find((step) => step.type === 'tool_call' && step.status === 'in_progress')
  if (activeToolStep) {
    return {
      status: 'calling_tool',
      ...(activeToolStep.toolName ? { toolName: activeToolStep.toolName } : {}),
      ...(reasoning ? { reasoning } : {}),
    }
  }
  const latestToolCallEvent = [...events].reverse().find((event) => event.kind === 'tool_call' && event.title === 'Model tool call delta')
  if (!latestToolCallEvent) return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  if (latestToolCallEvent.status !== 'started' && latestToolCallEvent.status !== 'info') return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  const eventMs = new Date(latestToolCallEvent.createdAt).getTime()
  const hasNewerToolStep = Number.isFinite(eventMs)
    ? run.steps.some((step) => step.type === 'tool_call' && new Date(step.createdAt).getTime() >= eventMs)
    : false
  if (hasNewerToolStep) return { status: 'thinking', ...(reasoning ? { reasoning } : {}) }
  return {
    status: 'preparing_tool_call',
    ...(toolNameFromToolCallStreamEvent(latestToolCallEvent) ? { toolName: toolNameFromToolCallStreamEvent(latestToolCallEvent) } : {}),
    ...(reasoning ? { reasoning } : {}),
  }
}

function latestReasoningStatus(events: ChatRunActivityEvent[]): string | undefined {
  for (const event of [...events].reverse()) {
    if (event.kind !== 'reasoning' && event.title !== 'Model reasoning delta') continue
    const reasoning = reasoningTextFromStreamEvent(event)
    if (reasoning) return reasoning
  }
  return undefined
}

function latestModelRetryStatus(events: ChatRunActivityEvent[]): string | undefined {
  const event = [...events].reverse().find((candidate) => candidate.kind === 'model_call' && candidate.title === 'Model retry scheduled')
  if (!event) return undefined
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const retry = data?.retry && typeof data.retry === 'object' ? data.retry as Record<string, unknown> : undefined
  const nextAttempt = typeof retry?.nextAttempt === 'number' ? retry.nextAttempt : undefined
  const maxAttempts = typeof retry?.maxAttempts === 'number' ? retry.maxAttempts : undefined
  const delayMs = typeof retry?.delayMs === 'number' ? retry.delayMs : undefined
  const attemptLabel = nextAttempt !== undefined && maxAttempts !== undefined ? `第 ${nextAttempt}/${maxAttempts} 次` : '下一次'
  const delayLabel = delayMs !== undefined ? `，等待 ${formatDurationLabel(delayMs)}` : ''
  return `模型请求暂时不可用，正在${attemptLabel}重试${delayLabel}`
}

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
    <div className="space-y-1">
      <AgentChatMessage
        role="assistant"
        avatar={<Bot size={14} />}
        data-agent-divider-label={formatAgentDividerTime(undefined)}
        footer={(
          <Badge variant="outline" className="type-micro leading-4 px-1.5 py-0">
            {label}
          </Badge>
        )}
      >
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 type-tiny text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            <span>{label}</span>
          </div>
          {detail ? <MarkdownContent text={detail} /> : null}
        </div>
      </AgentChatMessage>
    </div>
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
        <Badge variant={state.terminal ? 'outline' : 'secondary'} className="type-micro leading-4 px-1.5 py-0">
          {state.terminal ? '生成已结束' : '生成监控中'}
        </Badge>
      )}
    >
      <GenerationProgressCard state={state} />
    </AgentChatMessage>
  )
}

function formatDurationLabel(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

export function MessageBubble({
  msg,
  projectId,
}: {
  msg: ChatMessage
  projectId?: number
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
  const hasActivityContent = !isUser && !!localRunActivity && runActivityHasVisibleContent(localRunActivity)
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
        <div className={cn('flex flex-wrap gap-1', isUser ? 'justify-end' : 'justify-start')}>
          {runtimeInputLabel && (
            <Badge
              variant={runtimeInputStatus === 'failed' ? 'destructive' : runtimeInputStatus === 'pending' ? 'secondary' : 'outline'}
              className="type-micro leading-4 px-1.5 py-0"
              title={runtimeInput?.error}
            >
              {runtimeInputStatus === 'pending' && <Loader2 size={10} className="mr-1 inline animate-spin" />}
              {runtimeInputStatus === 'failed' && <AlertCircle size={10} className="mr-1 inline" />}
              {runtimeInputLabel}
            </Badge>
          )}
          {contextLabels.map((label) => (
            <Badge key={label} variant="secondary" className="type-micro leading-4 px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      )}
    >
      {!isUser && hasActivityContent && <AgentActivityDividerMenu activity={localRunActivity} />}
      {!isUser && hasActivityContent && (
        <AgentActivityFeedView
          activity={localRunActivity}
          className={displayContent || planRevision ? 'mb-2' : undefined}
        />
      )}
      {planRevision
        ? <AgentPlanRevisionCard revision={planRevision} />
        : displayContent && <MarkdownContent text={displayContent} attachments={messageAttachments} />}
      {showModelSetupAction && (
        <ReviewCallout tone="warning" compact className="mt-2 type-tiny">
          <div className="flex items-start gap-2">
            <Settings2 size={14} className={cn('mt-0.5 shrink-0', semanticToneClass('warning', 'icon'))} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{t('agents.chat.modelSetupAction.title')}</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">{t('agents.chat.modelSetupAction.description')}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => void openAdminConsole(apiBaseURL, '/models')}
              >
                {t('agents.chat.modelSetupAction.openModels')}
              </Button>
            </div>
          </div>
        </ReviewCallout>
      )}
      {hasResultSection && (
        <div className="mt-2 space-y-2">
          {showLargeMedia && <GeneratedResultCard attachments={generatedMediaAttachments} projectId={projectId} />}
          <AgentDraftResultCards artifacts={draftArtifacts} />
          {compactAttachments.length > 0 && (
            <div className={cn('grid gap-1.5', compactAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {compactAttachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} compact />
              ))}
            </div>
          )}
        </div>
      )}
      {hasDiagnosticSection && (
        <AgentMessageSection title={t('agents.chat.messageSections.diagnostics')} tone="diagnostic" defaultOpen={!!contextDiagnostic && !displayContent}>
          {contextDiagnostic && <ContextDiagnosticCard diagnostic={contextDiagnostic} />}
          <GenerationValidationErrorCard errors={generationValidationErrors} />
          <GenerationParamAuditCard audits={generationParamAudits} />
        </AgentMessageSection>
      )}
      {isUser && compactAttachments.length > 0 && (
        <div className={cn('mt-2 grid gap-1.5', compactAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {compactAttachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} compact />
          ))}
        </div>
      )}
    </AgentChatMessage>
  )
}

function runActivityHasVisibleContent(activity: NonNullable<ChatMessage['meta']>['localRunActivity']): boolean {
  const feed = activity ? buildAgentActivityFeed({ activity }) : undefined
  return !!feed && (feed.items.length > 0 || feed.rounds.length > 0)
}

function RuntimeStatusBubble({ status }: { status: RuntimeStatusMessage }) {
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      data-agent-divider-label={formatAgentDividerTime(undefined)}
      footer={(
        <Badge variant="outline" className="type-micro leading-4 px-1.5 py-0">
          Runtime
        </Badge>
      )}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 type-tiny font-medium text-foreground">
          <Check size={12} className={semanticToneClass('success', 'icon')} />
          <span>{status.title}</span>
        </div>
        <p className="type-caption leading-relaxed text-muted-foreground">{status.detail}</p>
        {(status.workId || status.workKind || status.workStatus) && (
          <div className="flex flex-wrap gap-1">
            {status.workKind && <Badge variant="secondary" className="type-micro leading-4 px-1.5 py-0">{status.workKind}</Badge>}
            {status.workStatus && <Badge variant="outline" className="type-micro leading-4 px-1.5 py-0">{status.workStatus}</Badge>}
            {status.workId && <Badge variant="outline" className="type-micro leading-4 px-1.5 py-0">{status.workId}</Badge>}
          </div>
        )}
      </div>
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
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="type-micro leading-4 px-1.5 py-0">
            {t('agents.chat.streaming')}
          </Badge>
        </div>
      )}
    >
      <MarkdownContent text={content} />
    </AgentChatMessage>
  )
}

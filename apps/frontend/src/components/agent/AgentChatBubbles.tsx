import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Bot, Check, Copy, Loader2, Settings2 } from 'lucide-react'
import { AgentChatMessage, Badge, Button } from '@movscript/ui'
import { buildAgentMessagePresentation } from '@/lib/agentMessagePresentation'
import { hydrateHistoricalGeneratedAttachments } from '@/lib/agentMessageViewModel'
import { agentMessageDividerLabel, formatAgentDividerTime } from '@/lib/agentMessageDivider'
import { toolNameFromToolCallStreamEvent } from '@/lib/agentRunActivity'
import { openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { cn } from '@/lib/utils'
import { GenerationJobSummaryCard, GenerationParamAuditCard, GenerationProgressCard, GenerationTraceSummaryCard, GenerationValidationErrorCard } from '@/components/agent/GenerationCards'
import { GeneratedResultCard } from '@/components/agent/GeneratedResultCard'
import {
  AgentAttachmentPreview as AttachmentPreview,
  AgentMarkdownContent as MarkdownContent,
  AgentMessageSection,
} from '@/components/agent/AgentMessageContent'
import { ContextDiagnosticCard } from '@/components/agent/ContextDiagnosticCard'
import { RunActivityPanel } from '@/components/agent/AgentRunActivityPanel'
import { AgentDraftResultCards } from '@/components/agent/AgentDraftResultCards'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

export type ThinkingBubbleState = AgentLivePendingAssistantState

export function getThinkingBubbleState(run: AgentRun | null, events: ChatRunActivityEvent[]): ThinkingBubbleState {
  const retryStatus = latestModelRetryStatus(events)
  if (retryStatus) return { status: 'retrying_model', label: retryStatus }
  if (!run || run.status !== 'in_progress') return { status: 'thinking' }
  const activeToolStep = [...run.steps].reverse().find((step) => step.type === 'tool_call' && step.status === 'in_progress')
  if (activeToolStep) {
    return {
      status: 'calling_tool',
      ...(activeToolStep.toolName ? { toolName: activeToolStep.toolName } : {}),
    }
  }
  const latestToolCallEvent = [...events].reverse().find((event) => event.kind === 'tool_call' && event.title === 'Model tool call delta')
  if (!latestToolCallEvent) return { status: 'thinking' }
  if (latestToolCallEvent.status !== 'started' && latestToolCallEvent.status !== 'info') return { status: 'thinking' }
  const eventMs = new Date(latestToolCallEvent.createdAt).getTime()
  const hasNewerToolStep = Number.isFinite(eventMs)
    ? run.steps.some((step) => step.type === 'tool_call' && new Date(step.createdAt).getTime() >= eventMs)
    : false
  if (hasNewerToolStep) return { status: 'thinking' }
  return {
    status: 'preparing_tool_call',
    ...(toolNameFromToolCallStreamEvent(latestToolCallEvent) ? { toolName: toolNameFromToolCallStreamEvent(latestToolCallEvent) } : {}),
  }
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
  const reasoning = ''
  const label = state.status === 'calling_tool'
    ? `调用工具${state.toolName ? `：${state.toolName}` : ''}`
    : state.status === 'preparing_tool_call'
      ? `准备调用工具${state.toolName ? `：${state.toolName}` : ''}`
      : state.status === 'preparing_request'
        ? '准备请求中'
        : state.status === 'retrying_model' ? state.label ?? '模型请求重试中' : '思考中'
  return (
    <div className="space-y-1">
      <AgentBubbleStatusText label={label} />
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
          {reasoning ? <MarkdownContent text={reasoning} /> : <div className="type-caption text-muted-foreground">...</div>}
        </div>
      </AgentChatMessage>
    </div>
  )
}

function AgentBubbleStatusText({ label }: { label?: string }) {
  if (!label) return null
  return (
    <div className="flex justify-start">
      <div className="inline-flex max-w-[80%] items-center gap-1.5 type-tiny leading-4 text-muted-foreground">
        <Loader2 size={10} className="animate-spin" />
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
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

export function MessageBubble({ msg, projectId }: { msg: ChatMessage; projectId?: number }) {
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
    messageAttachments,
    generatedMediaAttachments,
    compactAttachments,
    displayContent,
    showModelSetupAction,
    showLargeMedia,
    hasResultSection,
    hasProcessSection,
    hasDiagnosticSection,
  } = presentation

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
      {displayContent && <MarkdownContent text={displayContent} attachments={messageAttachments} />}
      {showModelSetupAction && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 type-tiny">
          <div className="flex items-start gap-2">
            <Settings2 size={14} className="mt-0.5 shrink-0 text-amber-600" />
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
        </div>
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
      {hasProcessSection && (
        <AgentMessageSection title={t('agents.chat.messageSections.process')} tone="process" defaultOpen={false}>
          {localRunActivity && (
            <RunActivityPanel
              activity={localRunActivity}
              title={t('agents.chat.messageSections.processOverview')}
              className="mt-0"
            />
          )}
          <GenerationTraceSummaryCard jobs={generationJobs} />
          <GenerationJobSummaryCard jobs={generationJobs} />
        </AgentMessageSection>
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

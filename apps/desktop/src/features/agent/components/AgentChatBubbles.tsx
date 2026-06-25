import React, { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Bot, Check, Copy, Loader2, Settings2 } from 'lucide-react'
import {
  ProviderSessionStatusContent,
  ProviderSessionStatusDetail,
  ProviderSessionStatusHeader,
  ProviderSessionStatusSuccessIcon
} from '@movscript/ui/business/agent'
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
} from '@/shared/ui/AgentMessageUi'
import { Button } from '@movscript/ui/primitives'
import { formatAgentDividerTime } from '@/features/agent/presentation/agentMessageDivider'
import { toolNameFromToolCallStreamEvent } from '@/features/agent/domain/agentRunActivity'
import { type AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { GenerationParamAuditCard, GenerationValidationErrorCard } from '@/features/agent/components/GenerationCards'
import { GeneratedResultCard } from '@/features/agent/components/GeneratedResultCard'
import {
  AgentAttachmentPreview as AttachmentPreview,
  AgentMarkdownContent as MarkdownContent,
  AgentMessageSection,
} from '@/features/agent/components/AgentMessageContent'
import { AgentArtifactResultCards } from '@/features/agent/components/AgentArtifactResultCards'
import { AgentActivityDividerMenu, AgentActivityFeedView } from '@/features/agent/components/AgentActivityFeed'
import { providerSessionApprovalDetails } from '@/features/agent/components/AgentRunInteractionBubble'
import { shallowReferenceArrayEqual } from '@/features/agent/components/AgentRenderEquality'
import { useAgentMessageBubbleModel } from '@/features/agent/presentation/useAgentMessageFactsModel'
import type { AgentRun } from '@movscript/agent-protocol'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRunApprovalDecisionInput } from '@/features/agent/application/agentRunInteractionActions'
import type { ChatMessage, ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

type MessageBubbleModel = ReturnType<typeof useAgentMessageBubbleModel>
type MessageBubbleFooterModel = MessageBubbleModel['footer']
type MessageBubbleActivityModel = MessageBubbleModel['activity']
type MessageBubbleSectionsModel = MessageBubbleModel['sections']

export function ThinkingBubble({ state = { status: 'thinking' } }: { run: AgentRun | null; state?: AgentThinkingState }) {
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
          <ProviderSessionStatusContent>
            <ProviderSessionStatusHeader>
              <AgentChatStatusLine>
                <ProviderSessionStatusSuccessIcon>
                  <Loader2 size={12} className="animate-spin" />
                </ProviderSessionStatusSuccessIcon>
                <span>{label}</span>
              </AgentChatStatusLine>
            </ProviderSessionStatusHeader>
            {detail ? <ProviderSessionStatusDetail>{detail}</ProviderSessionStatusDetail> : null}
          </ProviderSessionStatusContent>
        </AgentChatContentStack>
      </AgentChatMessage>
    </AgentChatBubbleStack>
  )
}

function fallbackThinkingDetail(state: AgentThinkingState): string {
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
  approvingActiveRun?: boolean
  onApproveRun?: (runId: string, approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => void
  onRejectRun?: (runId: string, approvalIds?: string[]) => void
  onAnswerRunInput?: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  hiddenActivityActionItemIds?: Set<string>
}

export const MessageBubble = React.memo(function MessageBubble({
  msg,
  projectId,
  timelineActivity,
  liveInteractionRun,
  liveInteractionEvents = [],
  approvingActiveRun = false,
  onApproveRun,
  onRejectRun,
  onAnswerRunInput,
  hiddenActivityActionItemIds,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const {
    shell,
    footer,
    sections,
    activity,
    action,
    visibility,
  } = useAgentMessageBubbleModel({
    message: msg,
    timelineActivity,
    liveInteractionRun,
    liveInteractionEvents,
    hiddenActivityActionItemIds,
  })

  if (!visibility.hasRenderableBubble) return null

  function copy() {
    if (action.kind !== 'copy') return
    navigator.clipboard.writeText(action.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AgentChatMessage
      role={shell.role}
      avatar={shell.avatar === 'user' ? '我' : <Bot size={14} />}
      author={shell.author}
      time={shell.time}
      data-agent-message-id={shell.messageId}
      data-agent-session-thread-id={shell.providerThreadId}
      data-agent-session-message-id={shell.providerSessionMessageId}
      data-agent-session-run-id={shell.providerSessionRunId}
      head={shell.headLabel ? <AgentMessageHeadLabel>{shell.headLabel}</AgentMessageHeadLabel> : undefined}
      actions={action.kind === 'copy' ? (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={copy}
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      ) : action.kind === 'activityMenu' ? (
        <AgentActivityDividerMenu activity={action.activity} />
      ) : undefined}
      footer={<MessageBubbleFooter footer={footer} />}
    >
      <MessageBubbleActivity
        activity={activity}
        liveInteractionEvents={liveInteractionEvents}
        approvingActiveRun={approvingActiveRun}
        onApproveRun={onApproveRun}
        onRejectRun={onRejectRun}
        onAnswerRunInput={onAnswerRunInput}
        hiddenActivityActionItemIds={hiddenActivityActionItemIds}
      />
      <MessageBubbleSections sections={sections} projectId={projectId} />
    </AgentChatMessage>
  )
}, areMessageBubblePropsEqual)

function MessageBubbleFooter({ footer }: { footer: MessageBubbleFooterModel }) {
  if (!footer.hasFooter) return null
  return (
    <AgentChatFooterBadges align={footer.align}>
      {footer.activeRunInputBadge && (
        <AgentChatTinyStatusBadge
          tone={footer.activeRunInputBadge.tone}
          title={footer.activeRunInputBadge.title}
        >
          {footer.activeRunInputBadge.icon === 'spinner' && <Loader2 size={10} className="mr-1 inline animate-spin" />}
          {footer.activeRunInputBadge.icon === 'error' && <AlertCircle size={10} className="mr-1 inline" />}
          {footer.activeRunInputBadge.label}
        </AgentChatTinyStatusBadge>
      )}
      {footer.contextLabels.map((label) => (
        <AgentChatTinyBadge key={label}>
          {label}
        </AgentChatTinyBadge>
      ))}
    </AgentChatFooterBadges>
  )
}

function MessageBubbleActivity({
  activity,
  liveInteractionEvents,
  approvingActiveRun,
  onApproveRun,
  onRejectRun,
  onAnswerRunInput,
  hiddenActivityActionItemIds,
}: {
  activity: MessageBubbleActivityModel
  liveInteractionEvents: ChatRunActivityEvent[]
  approvingActiveRun: boolean
  onApproveRun?: (runId: string, approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => void
  onRejectRun?: (runId: string, approvalIds?: string[]) => void
  onAnswerRunInput?: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  hiddenActivityActionItemIds?: Set<string>
}) {
  const liveRun = activity.liveRun
  return (
    <React.Fragment>
      {liveRun && (
        <AgentActivityFeedView
          activity={undefined}
          run={liveRun}
          events={liveInteractionEvents}
          className={activity.className}
          approving={approvingActiveRun}
          onApprove={onApproveRun ? (approvalIds) => onApproveRun(liveRun.id, approvalIds) : undefined}
          onApproveForSession={onApproveRun ? (approvalIds) => onApproveRun(liveRun.id, approvalIds, { scope: 'session' }) : undefined}
          onReject={onRejectRun ? (approvalIds) => onRejectRun(liveRun.id, approvalIds) : undefined}
          onAnswerInput={onAnswerRunInput ? (requestId, answer) => onAnswerRunInput(liveRun.id, requestId, answer) : undefined}
          approvalDetails={providerSessionApprovalDetails}
          hiddenActionItemIds={hiddenActivityActionItemIds}
        />
      )}
      {activity.historicalActivity && (
        <AgentActivityFeedView
          activity={activity.historicalActivity}
          className={activity.className}
          hiddenActionItemIds={hiddenActivityActionItemIds}
        />
      )}
    </React.Fragment>
  )
}

function MessageBubbleSections({
  sections,
  projectId,
}: {
  sections: MessageBubbleSectionsModel
  projectId?: number
}) {
  const { t } = useTranslation()
  const canOpenAdmin = useUserStore((s) => s.currentUser?.system_role === 'super_admin')
  return (
    <React.Fragment>
      {sections.showContent && <MarkdownContent text={sections.contentText} attachments={sections.contentAttachments} />}
      {sections.showModelSetupAction && canOpenAdmin && (
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
                onClick={() => void openAdminConsole(undefined, '/models')}
              >
                {t('agents.chat.modelSetupAction.openModels')}
              </AgentModelSetupCalloutAction>
            </AgentModelSetupCalloutContent>
          </AgentModelSetupCalloutBody>
        </AgentModelSetupCallout>
      )}
      {sections.showResultSection && (
        <AgentChatResultStack>
          {sections.showLargeMedia && <GeneratedResultCard attachments={sections.largeMediaAttachments} projectId={projectId} />}
          <AgentArtifactResultCards artifacts={sections.workspaceArtifacts} />
          {sections.showCompactAttachmentGrid && (
            <AgentChatAttachmentGrid columns={sections.compactAttachmentColumns}>
              {sections.compactAttachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} compact />
              ))}
            </AgentChatAttachmentGrid>
          )}
        </AgentChatResultStack>
      )}
      {sections.showDiagnosticSection && (
        <AgentMessageSection title={t('agents.chat.messageSections.diagnostics')} tone="diagnostic" defaultOpen={sections.diagnosticDefaultOpen}>
          <GenerationValidationErrorCard errors={sections.diagnosticValidationErrors} />
          <GenerationParamAuditCard audits={sections.diagnosticParamAudits} />
        </AgentMessageSection>
      )}
      {sections.showUserAttachmentGrid && (
        <AgentChatAttachmentGrid columns={sections.userAttachmentColumns}>
          {sections.userAttachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} compact />
          ))}
        </AgentChatAttachmentGrid>
      )}
    </React.Fragment>
  )
}

function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps) {
  return prev.msg === next.msg
    && prev.projectId === next.projectId
    && prev.timelineActivity === next.timelineActivity
    && prev.liveInteractionRun === next.liveInteractionRun
    && shallowReferenceArrayEqual(prev.liveInteractionEvents, next.liveInteractionEvents)
    && prev.approvingActiveRun === next.approvingActiveRun
    && prev.onApproveRun === next.onApproveRun
    && prev.onRejectRun === next.onRejectRun
    && prev.onAnswerRunInput === next.onAnswerRunInput
    && prev.hiddenActivityActionItemIds === next.hiddenActivityActionItemIds
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

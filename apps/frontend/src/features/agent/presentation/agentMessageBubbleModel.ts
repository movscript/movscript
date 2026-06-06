import { buildAgentActivityFeed } from '@/features/agent/presentation/agentActivityFeed'
import { transcriptAssistantProviderSessionRunId } from '@/features/agent/domain/agentMessageBoundaries'
import { providerSessionMessageRef } from '@/features/agent/domain/providerSessionMessageRefs'
import { agentMessageDividerLabel } from '@/features/agent/presentation/agentMessageDivider'
import type { AgentMessageFacts } from '@/features/agent/domain/agentMessageFacts'
import { activeRunInputDeliveryBadge, type AgentActiveRunInputDeliveryBadge } from '@/features/agent/presentation/agentActiveRunInputDeliveryBadge'
import { needsModelSetupAction } from '@/shared/domain/actionableErrors'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { AgentAttachment, ChatMessage, ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

type ChatMessageMeta = NonNullable<ChatMessage['meta']>

interface AgentMessageBubbleVisibility {
  hasMessageBody: boolean
  hasFooter: boolean
  hasRenderableBubble: boolean
}

interface AgentMessageProviderSessionAttributes {
  threadId?: string
  messageId?: string
  runId?: string
}

interface AgentMessageBubbleShell {
  role: 'user' | 'assistant'
  avatar: 'user' | 'assistant'
  author?: string
  time?: string
  headLabel?: string
  messageId: string
  providerThreadId?: string
  providerSessionMessageId?: string
  providerSessionRunId?: string
}

interface AgentMessageActivityContentState {
  activityFeedRun: AgentRun | null
  hasActivityContent: boolean
  showLiveActivity: boolean
  showHistoricalActivity: boolean
}

interface AgentMessageBubbleActivity {
  liveRun: AgentRun | null
  historicalActivity?: ChatRunActivity
  className?: string
}

interface AgentMessageBubbleChrome {
  role: 'user' | 'assistant'
  avatar: 'user' | 'assistant'
  author?: string
  time?: string
  showCopyAction: boolean
  headLabel?: string
}

type AgentMessageBubbleAction =
  | { kind: 'copy'; text: string }
  | { kind: 'activityMenu'; activity: ChatRunActivity }
  | { kind: 'none' }

interface AgentMessageBubbleFooter {
  hasFooter: boolean
  align: 'end' | 'start'
  activeRunInputBadge: AgentActiveRunInputDeliveryBadge | null
  contextLabels: string[]
}

interface AgentMessageBubbleSections {
  showContent: boolean
  contentText: string
  contentAttachments: AgentAttachment[]
  activityClassName?: string
  showModelSetupAction: boolean
  showResultSection: boolean
  showLargeMedia: boolean
  largeMediaAttachments: AgentAttachment[]
  workspaceArtifacts: NonNullable<ChatMessageMeta['workspaceArtifacts']>
  showCompactAttachmentGrid: boolean
  compactAttachments: AgentAttachment[]
  compactAttachmentColumns: 1 | 2
  showDiagnosticSection: boolean
  diagnosticDefaultOpen: boolean
  diagnosticValidationErrors: NonNullable<ChatMessageMeta['generationValidationErrors']>
  diagnosticParamAudits: NonNullable<ChatMessageMeta['generationParamAudits']>
  showUserAttachmentGrid: boolean
  userAttachments: AgentAttachment[]
  userAttachmentColumns: 1 | 2
}

interface AgentMessageBubbleModel {
  shell: AgentMessageBubbleShell
  footer: AgentMessageBubbleFooter
  sections: AgentMessageBubbleSections
  activity: AgentMessageBubbleActivity
  action: AgentMessageBubbleAction
  visibility: AgentMessageBubbleVisibility
}

interface AgentMessageBubbleModelInput {
  time: string
  liveInteractionRun?: AgentRun | null
  liveInteractionEvents?: ChatRunActivityEvent[]
  hiddenActivityActionItemIds?: Set<string>
}

export function agentMessageBubbleModel(
  facts: AgentMessageFacts,
  message: Pick<ChatMessage, 'id' | 'meta' | 'role' | 'content'>,
  input: AgentMessageBubbleModelInput,
): AgentMessageBubbleModel {
  const shell = agentMessageBubbleShell(facts, message, { time: input.time })
  const footer = agentMessageBubbleFooter(facts, message)
  const sections = agentMessageBubbleSections(facts, message)
  const activityState = agentMessageActivityContentState(facts, {
    liveInteractionRun: input.liveInteractionRun,
    liveInteractionEvents: input.liveInteractionEvents,
    hiddenActivityActionItemIds: input.hiddenActivityActionItemIds,
  })
  return {
    shell,
    footer,
    sections,
    activity: agentMessageBubbleActivity(activityState, facts, sections),
    action: agentMessageBubbleAction(facts, activityState, message),
    visibility: agentMessageBubbleVisibility(
      facts,
      sections,
      {
        hasActivityContent: activityState.hasActivityContent,
        hasActiveRunInputBadge: !!footer.activeRunInputBadge,
      },
    ),
  }
}

function agentMessageBubbleVisibility(
  facts: Pick<AgentMessageFacts, 'isUser' | 'contextLabels'>,
  sections: Pick<
    AgentMessageBubbleSections,
    | 'contentText'
    | 'compactAttachments'
    | 'showModelSetupAction'
    | 'showResultSection'
    | 'showDiagnosticSection'
  >,
  input: { hasActivityContent: boolean; hasActiveRunInputBadge: boolean },
): AgentMessageBubbleVisibility {
  const hasMessageBody = facts.isUser
    ? !!sections.contentText.trim() || sections.compactAttachments.length > 0
    : input.hasActivityContent
      || !!sections.contentText.trim()
      || sections.showModelSetupAction
      || sections.showResultSection
      || sections.showDiagnosticSection
  const hasFooter = facts.contextLabels.length > 0 || input.hasActiveRunInputBadge
  return {
    hasMessageBody,
    hasFooter,
    hasRenderableBubble: hasMessageBody || hasFooter,
  }
}

function agentMessageProviderSessionAttributes(message: Pick<ChatMessage, 'meta' | 'role'>): AgentMessageProviderSessionAttributes {
  const providerSessionMessage = providerSessionMessageRef(message)
  const threadId = providerSessionMessage?.threadId
  const messageId = providerSessionMessage?.messageId
  const runId = transcriptAssistantProviderSessionRunId(message)
  return {
    ...(threadId ? { threadId } : {}),
    ...(messageId ? { messageId } : {}),
    ...(runId ? { runId } : {}),
  }
}

function agentMessageActivityContentState(
  facts: Pick<AgentMessageFacts, 'isUser' | 'timelineActivity'>,
  input: {
    liveInteractionRun?: AgentRun | null
    liveInteractionEvents?: ChatRunActivityEvent[]
    hiddenActivityActionItemIds?: Set<string>
  },
): AgentMessageActivityContentState {
  if (facts.isUser) return emptyAgentMessageActivityContentState()
  const activityFeedRun = input.liveInteractionRun ?? null
  const hasActivityContent = activityFeedRun
    ? runActivityHasVisibleContent({
        run: activityFeedRun,
        events: input.liveInteractionEvents,
        hiddenActionItemIds: input.hiddenActivityActionItemIds,
      })
    : !!facts.timelineActivity && runActivityHasVisibleContent({
        activity: facts.timelineActivity,
        hiddenActionItemIds: input.hiddenActivityActionItemIds,
      })
  return {
    activityFeedRun,
    hasActivityContent,
    showLiveActivity: hasActivityContent && !!activityFeedRun,
    showHistoricalActivity: hasActivityContent && !activityFeedRun && !!facts.timelineActivity,
  }
}

function agentMessageBubbleChrome(
  facts: Pick<AgentMessageFacts, 'isUser' | 'timelineActivity'>,
  input: { time: string },
): AgentMessageBubbleChrome {
  if (facts.isUser) {
    return {
      role: 'user',
      avatar: 'user',
      author: 'You',
      time: input.time,
      showCopyAction: true,
    }
  }
  const headLabel = agentMessageDividerLabel(input.time, facts.timelineActivity)
  return {
    role: 'assistant',
    avatar: 'assistant',
    showCopyAction: false,
    ...(headLabel ? { headLabel } : {}),
  }
}

function agentMessageBubbleShell(
  facts: Pick<AgentMessageFacts, 'isUser' | 'timelineActivity'>,
  message: Pick<ChatMessage, 'id' | 'meta' | 'role'>,
  input: { time: string },
): AgentMessageBubbleShell {
  const chrome = agentMessageBubbleChrome(facts, input)
  const providerSessionAttributes = agentMessageProviderSessionAttributes(message)
  return {
    role: chrome.role,
    avatar: chrome.avatar,
    ...(chrome.author ? { author: chrome.author } : {}),
    ...(chrome.time ? { time: chrome.time } : {}),
    ...(chrome.headLabel ? { headLabel: chrome.headLabel } : {}),
    messageId: message.id,
    ...(providerSessionAttributes.threadId ? { providerThreadId: providerSessionAttributes.threadId } : {}),
    ...(providerSessionAttributes.messageId ? { providerSessionMessageId: providerSessionAttributes.messageId } : {}),
    ...(providerSessionAttributes.runId ? { providerSessionRunId: providerSessionAttributes.runId } : {}),
  }
}

function agentMessageBubbleActivity(
  activityState: Pick<AgentMessageActivityContentState, 'activityFeedRun' | 'showLiveActivity' | 'showHistoricalActivity'>,
  facts: Pick<AgentMessageFacts, 'timelineActivity'>,
  sections: Pick<AgentMessageBubbleSections, 'activityClassName'>,
): AgentMessageBubbleActivity {
  const liveRun = activityState.showLiveActivity ? activityState.activityFeedRun : null
  const historicalActivity = activityState.showHistoricalActivity ? facts.timelineActivity : undefined
  const hasActivity = !!liveRun || !!historicalActivity
  return {
    liveRun,
    ...(historicalActivity ? { historicalActivity } : {}),
    ...(hasActivity && sections.activityClassName ? { className: sections.activityClassName } : {}),
  }
}

function agentMessageBubbleAction(
  facts: Pick<AgentMessageFacts, 'isUser' | 'timelineActivity'>,
  activityState: Pick<AgentMessageActivityContentState, 'showHistoricalActivity'>,
  message: Pick<ChatMessage, 'content'>,
): AgentMessageBubbleAction {
  if (facts.isUser) return { kind: 'copy', text: message.content }
  if (activityState.showHistoricalActivity && facts.timelineActivity) {
    return { kind: 'activityMenu', activity: facts.timelineActivity }
  }
  return { kind: 'none' }
}

function agentMessageBubbleFooter(
  facts: Pick<AgentMessageFacts, 'isUser' | 'contextLabels'>,
  message: Pick<ChatMessage, 'meta'>,
): AgentMessageBubbleFooter {
  const activeRunInputBadge = activeRunInputDeliveryBadge(message)
  return {
    hasFooter: facts.contextLabels.length > 0 || !!activeRunInputBadge,
    align: facts.isUser ? 'end' : 'start',
    activeRunInputBadge,
    contextLabels: facts.contextLabels,
  }
}

function agentMessageBubbleSections(
  facts: Pick<
    AgentMessageFacts,
    | 'isUser'
    | 'displayContent'
    | 'messageAttachments'
    | 'generatedMediaAttachments'
    | 'workspaceArtifacts'
    | 'generationParamAudits'
    | 'generationValidationErrors'
  >,
  message: Pick<ChatMessage, 'content'>,
): AgentMessageBubbleSections {
  const hasDisplayContent = !!facts.displayContent
  const showLargeMedia = !facts.isUser && facts.generatedMediaAttachments.length > 0
  const compactAttachments = compactMessageAttachments(facts, { showLargeMedia })
  const compactAttachmentColumns = attachmentGridColumns(compactAttachments.length)
  const showModelSetupAction = !facts.isUser && needsModelSetupAction(message.content)
  const showResultSection = !facts.isUser && (
    showLargeMedia
    || compactAttachments.length > 0
    || facts.workspaceArtifacts.length > 0
  )
  const showDiagnosticSection = !facts.isUser && (
    facts.generationValidationErrors.length > 0
    || facts.generationParamAudits.length > 0
  )
  return {
    showContent: hasDisplayContent,
    contentText: facts.displayContent,
    contentAttachments: facts.messageAttachments,
    ...(hasDisplayContent ? { activityClassName: 'mb-2' } : {}),
    showModelSetupAction,
    showResultSection,
    showLargeMedia,
    largeMediaAttachments: facts.generatedMediaAttachments,
    workspaceArtifacts: facts.workspaceArtifacts,
    showCompactAttachmentGrid: compactAttachments.length > 0,
    compactAttachments,
    compactAttachmentColumns,
    showDiagnosticSection,
    diagnosticDefaultOpen: !hasDisplayContent,
    diagnosticValidationErrors: facts.generationValidationErrors,
    diagnosticParamAudits: facts.generationParamAudits,
    showUserAttachmentGrid: facts.isUser && compactAttachments.length > 0,
    userAttachments: compactAttachments,
    userAttachmentColumns: compactAttachmentColumns,
  }
}

function compactMessageAttachments(
  facts: Pick<AgentMessageFacts, 'generatedMediaAttachments' | 'messageAttachments'>,
  input: { showLargeMedia: boolean },
): AgentAttachment[] {
  if (!input.showLargeMedia) return facts.messageAttachments
  const generatedAttachmentIds = new Set(facts.generatedMediaAttachments.map((attachment) => attachment.id))
  return facts.messageAttachments.filter((attachment) => !generatedAttachmentIds.has(attachment.id))
}

function emptyAgentMessageActivityContentState(): AgentMessageActivityContentState {
  return {
    activityFeedRun: null,
    hasActivityContent: false,
    showLiveActivity: false,
    showHistoricalActivity: false,
  }
}

function attachmentGridColumns(count: number): 1 | 2 {
  return count > 1 ? 2 : 1
}

function runActivityHasVisibleContent(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  hiddenActionItemIds?: Set<string>
}): boolean {
  const feed = buildAgentActivityFeed(input)
  return !!feed && (feed.items.length > 0 || feed.rounds.length > 0)
}

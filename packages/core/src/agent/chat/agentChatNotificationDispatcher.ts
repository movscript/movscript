import type {
  AgentChatNotification,
  AgentChatNotificationEvent,
  AgentChatServerRequest,
  AgentChatThread,
  AgentChatTurn,
} from './agentChatProtocol.js'
import { agentThreadGoalStateFromUnknown } from './agentChatGoalState.js'
import type { AgentChatThreadItem } from './agentChatThreadItems.js'
import {
  agentChatPendingServerRequestMatchesResolvedEvent,
  dropAgentChatPendingServerRequests,
} from './agentChatPendingServerRequests.js'
import {
  appendAgentChatCommandTerminalInteraction,
  appendAgentChatDeltaTurnItem,
  appendAgentChatMcpToolCallProgress,
  appendAgentChatTurnItem,
  applyAgentChatNotificationEventToThread,
  ensureAgentChatReasoningSummaryPart,
  setAgentChatContextCompaction,
  setAgentChatFileChangePatch,
  setAgentChatTurnDiff,
  setAgentChatTurnPlan,
  upsertAgentChatApprovalReview,
  upsertAgentChatSystemNotice,
  upsertAgentChatTurn,
} from './agentChatThreadState.js'
import { AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE } from './agentChatNotificationDispatchCoverage.js'

export type AgentChatPendingUserItem = {
  threadId: string
  item: Extract<AgentChatThreadItem, { type: 'userMessage' }>
}

export type AgentChatStreamingAgentItem = {
  threadId: string
  turnId: string
  itemId: string
  text: string
}

export type AgentChatRealtimeTranscriptItem = {
  threadId: string
  id: string
  role: string | null
  text: string
  completed: boolean
}

export type AgentChatRealtimeAudioItem = {
  threadId: string
  id: string
  itemId: string | null
  chunks: AgentChatRealtimeAudioChunk[]
  sampleRate: number | null
  numChannels: number | null
}

type AgentChatRealtimeAudioChunk = {
  data: string
  sampleRate: number
  numChannels: number
  samplesPerChannel: number | null
}

export type AgentChatPendingServerRequestEntry = {
  request: AgentChatServerRequest
}

export type AgentChatVisibleThreadItem = {
  viewId: string
  item: AgentChatThreadItem
  streaming: boolean
}

export interface AgentChatNotificationDispatchTarget<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
> {
  upsertThread: (thread: AgentChatThread) => void
  updateThreads: (updater: (current: AgentChatThread[]) => AgentChatThread[]) => void
  activeThreadId: string | null
  setActiveThreadId: (threadId: string | null) => void
  updatePendingUserItems: (updater: (current: AgentChatPendingUserItem[]) => AgentChatPendingUserItem[]) => void
  updatePendingServerRequests: (updater: (current: TPendingServerRequest[]) => TPendingServerRequest[]) => void
  updateStreamingAgentItems: (updater: (current: Record<string, AgentChatStreamingAgentItem>) => Record<string, AgentChatStreamingAgentItem>) => void
  readStreamingAgentItems?: () => Record<string, AgentChatStreamingAgentItem>
  updateRealtimeTranscriptItems?: (updater: (current: Record<string, AgentChatRealtimeTranscriptItem>) => Record<string, AgentChatRealtimeTranscriptItem>) => void
  updateRealtimeAudioItems?: (updater: (current: Record<string, AgentChatRealtimeAudioItem>) => Record<string, AgentChatRealtimeAudioItem>) => void
  readThread: (threadId: string) => void
}

export function dispatchAgentChatNotification<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
>(
  notification: AgentChatNotification,
  target: AgentChatNotificationDispatchTarget<TPendingServerRequest>,
): void {
  dispatchAgentChatNotificationEvent(notification.event, target)
  const params = isRecord(notification.params) ? notification.params : {}
  const threadId = stringField(params.threadId)
  if (notification.method === 'thread/started') {
    const thread = isRecord(params.thread) ? normalizeAgentChatNotificationThread(params.thread) : null
    if (thread) target.upsertThread(thread)
    return
  }
  if (!threadId) return
  if (notification.method === 'thread/status/changed') {
    const status = agentChatThreadStatusField(params.status)
    if (!status) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, status, updatedAt: Math.max(thread.updatedAt, unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'thread/name/updated') {
    const name = agentChatThreadNameFromNotificationParams(params)
    if (name === undefined) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Math.max(thread.updatedAt, unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'thread/goal/updated') {
    const goal = agentThreadGoalStateFromUnknown(params.goal)
    if (!goal) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, goal, updatedAt: Math.max(thread.updatedAt, goal.updatedAt ?? unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'thread/goal/cleared') {
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, goal: null, updatedAt: Math.max(thread.updatedAt, unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'thread/settings/updated') {
    const settings = isRecord(params.threadSettings) ? params.threadSettings : {}
    target.updateThreads((current) => current.map((thread) => {
      if (thread.id !== threadId) return thread
      return {
        ...thread,
        cwd: stringField(settings.cwd) ?? thread.cwd,
        updatedAt: Math.max(thread.updatedAt, unixSecondsNow()),
        executionSettings: {
          ...thread.executionSettings,
          ...(Object.prototype.hasOwnProperty.call(settings, 'model') ? { model: stringField(settings.model) ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'modelProvider') ? { modelProvider: stringField(settings.modelProvider) ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'cwd') ? { cwd: stringField(settings.cwd) ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'approvalPolicy') ? { approvalPolicy: stringField(settings.approvalPolicy) ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'approvalsReviewer') ? { approvalsReviewer: stringField(settings.approvalsReviewer) ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'sandboxPolicy') ? { sandboxPolicy: settings.sandboxPolicy } : {}),
          ...(Object.prototype.hasOwnProperty.call(settings, 'activePermissionProfile') ? { permissions: activePermissionProfileId(settings.activePermissionProfile) } : {}),
        },
      }
    }))
    return
  }
  if (notification.method === 'thread/metadata/updated') {
    const status = agentChatThreadStatusField(params.status)
    const updatedAt = numberField(params.updatedAt) ?? unixSecondsNow()
    const name = agentChatThreadNameFromNotificationParams(params)
    target.updateThreads((current) => current.map((thread) => {
      if (thread.id !== threadId) return thread
      return {
        ...thread,
        ...(name !== undefined ? { name } : {}),
        ...(typeof params.preview === 'string' ? { preview: params.preview } : {}),
        ...(status ? { status } : {}),
        updatedAt: Math.max(thread.updatedAt, updatedAt),
      }
    }))
    return
  }
  if (notification.method === 'turn/started') {
    const turn = isRecord(params.turn) ? normalizeAgentChatNotificationTurn(params.turn) : null
    if (!turn) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? upsertAgentChatTurn(thread, turn) : thread))
    target.updatePendingUserItems((current) => removeConfirmedPendingUserItems(current, threadId, turn.items))
    return
  }
  if (notification.method === 'turn/plan/updated') {
    const turnId = stringField(params.turnId)
    const plan = Array.isArray(params.plan) ? params.plan : []
    if (!turnId) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? setAgentChatTurnPlan(thread, turnId, stringField(params.explanation) ?? null, plan) : thread))
    return
  }
  if (notification.method === 'turn/diff/updated') {
    const turnId = stringField(params.turnId)
    const diff = stringField(params.diff)
    if (!turnId || !diff) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? setAgentChatTurnDiff(thread, turnId, diff) : thread))
    return
  }
  if (notification.method === 'item/plan/delta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatDeltaTurnItem(thread, turnId, {
      type: 'plan',
      id: itemId,
      text: delta,
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/reasoning/textDelta' || notification.method === 'item/reasoning/summaryTextDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    const summaryDelta = notification.method === 'item/reasoning/summaryTextDelta'
    const reasoningIndex = summaryDelta ? numberField(params.summaryIndex) : numberField(params.contentIndex)
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatDeltaTurnItem(thread, turnId, {
      type: 'reasoning',
      id: itemId,
      summary: summaryDelta ? [delta] : [],
      content: summaryDelta ? [] : [delta],
    }, delta, summaryDelta ? 'summary' : 'content', reasoningIndex) : thread))
    return
  }
  if (notification.method === 'item/reasoning/summaryPartAdded') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const summaryIndex = numberField(params.summaryIndex)
    if (!turnId || !itemId || summaryIndex === undefined) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? ensureAgentChatReasoningSummaryPart(thread, turnId, itemId, summaryIndex) : thread))
    return
  }
  if (notification.method === 'item/commandExecution/outputDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatDeltaTurnItem(thread, turnId, {
      type: 'commandExecution',
      id: itemId,
      command: 'Command',
      aggregatedOutput: delta,
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/fileChange/outputDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatDeltaTurnItem(thread, turnId, {
      type: 'fileChange',
      id: itemId,
      status: 'streaming',
      changes: [delta],
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/fileChange/patchUpdated') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const changes = Array.isArray(params.changes) ? params.changes : null
    if (!turnId || !itemId || !changes) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? setAgentChatFileChangePatch(thread, turnId, itemId, changes) : thread))
    return
  }
  if (notification.method === 'item/mcpToolCall/progress') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const message = stringField(params.message)
    if (!turnId || !itemId || !message) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatMcpToolCallProgress(thread, turnId, itemId, message) : thread))
    return
  }
  if (notification.method === 'item/commandExecution/terminalInteraction') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const processId = stringField(params.processId)
    const stdin = stringField(params.stdin)
    if (!turnId || !itemId || !processId || stdin === undefined) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatCommandTerminalInteraction(thread, turnId, itemId, {
      processId,
      stdin,
      raw: params,
    }) : thread))
    return
  }
  if (notification.method === 'item/autoApprovalReview/started' || notification.method === 'item/autoApprovalReview/completed') {
    const turnId = stringField(params.turnId)
    const review = agentChatApprovalReviewItemFromNotification(notification.method, params)
    if (!turnId || !review) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? upsertAgentChatApprovalReview(thread, turnId, review) : thread))
    return
  }
  if (notification.method === 'thread/compacted') {
    const turnId = stringField(params.turnId)
    if (!turnId) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? setAgentChatContextCompaction(thread, turnId, params) : thread))
    return
  }
  if (notification.method === 'item/started') {
    const turnId = stringField(params.turnId)
    const item = normalizeAgentChatNotificationThreadItem(params.item)
    if (!turnId || !item) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatTurnItem(thread, turnId, item) : thread))
    return
  }
  if (notification.method === 'item/agentMessage/delta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    target.updateStreamingAgentItems((current) => {
      const previous = current[itemId]
      return {
        ...current,
        [itemId]: {
          threadId,
          turnId,
          itemId,
          text: `${previous?.text ?? ''}${delta}`,
        },
      }
    })
    return
  }
  if (notification.method === 'item/completed') {
    const turnId = stringField(params.turnId)
    const item = normalizeAgentChatNotificationThreadItem(params.item)
    if (!turnId || !item) return
    const streamingAgentItems = target.readStreamingAgentItems?.()
    const completedItem = mergeStreamingAgentItem(item, streamingAgentItems?.[item.id])
    target.updatePendingUserItems((current) => current.filter((pending) => {
      if (pending.threadId !== threadId) return true
      return Boolean(pending.item.clientId && pending.item.clientId !== (completedItem as { clientId?: string | null }).clientId)
    }))
    target.updateStreamingAgentItems((current) => {
      const next = { ...current }
      delete next[completedItem.id]
      return next
    })
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? appendAgentChatTurnItem(thread, turnId, completedItem) : thread))
    return
  }
  if (notification.method === 'turn/completed') {
    const turn = isRecord(params.turn) ? normalizeAgentChatNotificationTurn(params.turn) : null
    if (!turn) return
    target.updateThreads((current) => current.map((thread) => thread.id === threadId ? upsertAgentChatTurn(thread, turn) : thread))
    target.updatePendingUserItems((current) => current.filter((pending) => pending.threadId !== threadId))
    target.updatePendingServerRequests((current) => dropAgentChatPendingServerRequests(current, (pending) => {
      if (pending.request.threadId !== threadId) return false
      return !pending.request.turnId || pending.request.turnId === turn.id
    }))
    target.updateStreamingAgentItems((current) => {
      const next = { ...current }
      for (const [itemId, item] of Object.entries(current)) {
        if (item.threadId === threadId && item.turnId === turn.id) delete next[itemId]
      }
      return next
    })
    clearAgentChatRealtimeItemsForThread(target, threadId)
  }
  if (notification.method === 'turn/failed') {
    const turnId = stringField(params.turnId)
    if (!turnId) return
    const error = agentChatTurnErrorFromNotification(params.error)
    const completedAt = numberField(params.completedAt) ?? unixSecondsNow()
    target.updateThreads((current) => current.map((thread) => {
      if (thread.id !== threadId) return thread
      const existing = thread.turns.find((turn) => turn.id === turnId)
      return {
        ...upsertAgentChatTurn(thread, {
          id: turnId,
          items: existing?.items ?? [],
          itemsView: existing?.itemsView ?? 'full',
          status: 'failed',
          error,
          startedAt: existing?.startedAt ?? null,
          completedAt,
          durationMs: existing?.startedAt ? Math.max(0, completedAt * 1000 - existing.startedAt * 1000) : existing?.durationMs ?? null,
          raw: params,
        }),
        status: 'failed',
      }
    }))
    target.updatePendingUserItems((current) => current.filter((pending) => pending.threadId !== threadId))
    target.updatePendingServerRequests((current) => dropAgentChatPendingServerRequests(current, (pending) => {
      if (pending.request.threadId !== threadId) return false
      return !pending.request.turnId || pending.request.turnId === turnId
    }))
    target.updateStreamingAgentItems((current) => {
      const next = { ...current }
      for (const [itemId, item] of Object.entries(current)) {
        if (item.threadId === threadId && item.turnId === turnId) delete next[itemId]
      }
      return next
    })
    clearAgentChatRealtimeItemsForThread(target, threadId)
  }
}

export function buildAgentChatVisibleItems(
  thread: AgentChatThread,
  pendingUserItems: AgentChatPendingUserItem[],
  streamingAgentItems: Record<string, AgentChatStreamingAgentItem>,
  realtimeTranscriptItems: Record<string, AgentChatRealtimeTranscriptItem> = {},
  realtimeAudioItems: Record<string, AgentChatRealtimeAudioItem> = {},
): AgentChatVisibleThreadItem[] {
  const items = thread.turns.flatMap((turn) => turn.items.map((item) => ({ viewId: agentChatVisibleThreadItemViewId(turn.id, item), item, streaming: false })))
  const itemIds = new Set(items.map((item) => item.item.id).filter(Boolean))
  const userClientIds = new Set(items.flatMap((item) => {
    const clientId = agentChatUserMessageClientId(item.item)
    return clientId ? [clientId] : []
  }))
  for (const pending of pendingUserItems) {
    const pendingClientId = agentChatUserMessageClientId(pending.item)
    if (
      pending.threadId === thread.id
      && !itemIds.has(pending.item.id)
      && (!pendingClientId || !userClientIds.has(pendingClientId))
    ) {
      items.push({ viewId: agentChatVisibleThreadItemViewId('pending', pending.item), item: pending.item, streaming: false })
      itemIds.add(pending.item.id)
      if (pendingClientId) userClientIds.add(pendingClientId)
    }
  }
  for (const streaming of Object.values(streamingAgentItems)) {
    if (streaming.threadId === thread.id && !itemIds.has(streaming.itemId)) {
      items.push({
        viewId: `streaming:${streaming.itemId}`,
        streaming: true,
        item: {
          type: 'agentMessage',
          id: streaming.itemId,
          text: streaming.text,
          phase: null,
          memoryCitation: null,
        },
      })
      itemIds.add(streaming.itemId)
    }
  }
  for (const transcript of Object.values(realtimeTranscriptItems)) {
    if (transcript.threadId !== thread.id || itemIds.has(transcript.id) || !transcript.text.trim()) continue
    items.push({
      viewId: `realtime:${transcript.id}`,
      streaming: !transcript.completed,
      item: agentChatRealtimeTranscriptVisibleItem(transcript),
    })
    itemIds.add(transcript.id)
  }
  for (const audio of Object.values(realtimeAudioItems)) {
    if (audio.threadId !== thread.id || itemIds.has(audio.id) || audio.chunks.length === 0) continue
    items.push({
      viewId: `realtime:${audio.id}`,
      streaming: true,
      item: agentChatRealtimeAudioVisibleItem(audio),
    })
    itemIds.add(audio.id)
  }
  return items
}

export function agentChatVisibleThreadItemViewId(turnId: string, item: AgentChatThreadItem): string {
  const clientId = agentChatUserMessageClientId(item)
  return clientId ? `user:${clientId}` : `${turnId}:${item.id}`
}

function removeConfirmedPendingUserItems(
  current: AgentChatPendingUserItem[],
  threadId: string,
  items: AgentChatThreadItem[],
): AgentChatPendingUserItem[] {
  const userItemIds = new Set<string>()
  const userClientIds = new Set<string>()
  for (const item of items) {
    if (item.type !== 'userMessage') continue
    userItemIds.add(item.id)
    const clientId = agentChatUserMessageClientId(item)
    if (clientId) userClientIds.add(clientId)
  }
  if (userItemIds.size === 0 && userClientIds.size === 0) return current
  return current.filter((pending) => {
    if (pending.threadId !== threadId) return true
    const pendingClientId = agentChatUserMessageClientId(pending.item)
    if (pendingClientId && userClientIds.has(pendingClientId)) return false
    return !userItemIds.has(pending.item.id)
  })
}

function agentChatUserMessageClientId(item: AgentChatThreadItem): string | null {
  return item.type === 'userMessage' && item.clientId?.trim() ? item.clientId.trim() : null
}

function agentChatRealtimeTranscriptVisibleItem(transcript: AgentChatRealtimeTranscriptItem): AgentChatThreadItem {
  if (transcript.role === 'user') {
    return {
      type: 'userMessage',
      id: transcript.id,
      clientId: null,
      content: [{ type: 'text', text: transcript.text, textElements: [] }],
    }
  }
  return {
    type: 'agentMessage',
    id: transcript.id,
    text: transcript.text,
    phase: transcript.completed ? 'realtime transcript' : 'realtime streaming',
    memoryCitation: null,
  }
}

function agentChatRealtimeAudioVisibleItem(audio: AgentChatRealtimeAudioItem): AgentChatThreadItem {
  const wavData = agentChatRealtimeWavData(audio)
  return {
    type: 'dynamicToolCall',
    id: audio.id,
    namespace: 'realtime',
    tool: 'output_audio',
    status: 'inProgress',
    contentItems: wavData ? [{
      type: 'audio',
      data: wavData,
      mimeType: 'audio/wav',
      sampleRate: audio.sampleRate,
      numChannels: audio.numChannels,
      itemId: audio.itemId,
      chunks: audio.chunks.length,
    }] : null,
    result: {
      itemId: audio.itemId,
      sampleRate: audio.sampleRate,
      numChannels: audio.numChannels,
      chunks: audio.chunks.length,
      samplesPerChannel: audio.chunks.reduce((total, chunk) => total + (chunk.samplesPerChannel ?? 0), 0),
    },
    raw: audio,
  }
}

function mergeStreamingAgentItem(item: AgentChatThreadItem, streaming: AgentChatStreamingAgentItem | undefined): AgentChatThreadItem {
  if (item.type !== 'agentMessage' || !streaming?.text) return item
  return { ...item, text: mergeAgentChatText(streaming.text, item.text) }
}

function mergeAgentChatText(existing: string, next: string): string {
  if (!existing) return next
  if (!next) return existing
  if (next.startsWith(existing)) return next
  if (existing.startsWith(next)) return existing
  return `${existing}${next}`
}

export function agentChatNotificationEventShouldDisplayAsRecent(event: AgentChatNotificationEvent): boolean {
  if (agentChatNotificationEventIsStatusSummary(event)) return false
  if (event.type === 'systemNotice') return !event.threadId || !event.turnId
  if (event.type === 'realtime') {
    if (event.event === 'transcriptDelta' || event.event === 'transcriptDone') return false
    if (event.event === 'outputAudioDelta') return false
    if (event.event === 'itemAdded') return !agentChatRealtimeItemProjection(event)
    return true
  }
  return (AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE[event.type]?.handling.length ?? 0) === 0
}

function dispatchAgentChatNotificationEvent<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
>(
  event: AgentChatNotificationEvent | undefined,
  target: AgentChatNotificationDispatchTarget<TPendingServerRequest>,
): void {
  if (!event) return
  if (event.type === 'threadLifecycle') {
    if (event.action === 'unarchived') {
      target.readThread(event.threadId)
      return
    }
    target.updateThreads((current) => current.filter((thread) => thread.id !== event.threadId))
    target.updatePendingUserItems((current) => current.filter((item) => item.threadId !== event.threadId))
    target.updatePendingServerRequests((current) => dropAgentChatPendingServerRequests(current, (item) => item.request.threadId === event.threadId))
    target.updateStreamingAgentItems((current) => {
      const next = { ...current }
      for (const [itemId, item] of Object.entries(current)) {
        if (item.threadId === event.threadId) delete next[itemId]
      }
      return next
    })
    clearAgentChatRealtimeItemsForThread(target, event.threadId)
    if (target.activeThreadId === event.threadId) target.setActiveThreadId(null)
    return
  }
  if (event.type === 'realtime' && event.event === 'itemAdded' && event.threadId) {
    const projection = agentChatRealtimeItemProjection(event)
    if (projection) {
      target.updateRealtimeTranscriptItems?.((current) => ({ ...current, [projection.id]: projection }))
      return
    }
  }
  if (event.type === 'realtime' && (event.event === 'transcriptDelta' || event.event === 'transcriptDone') && event.threadId) {
    updateAgentChatRealtimeTranscriptEvent(event, target)
    return
  }
  if (event.type === 'realtime' && event.event === 'outputAudioDelta' && event.threadId) {
    updateAgentChatRealtimeAudioEvent(event, target)
    return
  }
  if (event.type === 'serverRequestResolved') {
    target.updatePendingServerRequests((current) => dropAgentChatPendingServerRequests(current, (item) => agentChatPendingServerRequestMatchesResolvedEvent(item.request, event)))
    return
  }
  if (event.type === 'commandOutput' || event.type === 'processOutput' || event.type === 'processExited') {
    target.updateThreads((current) => current.map((thread) => applyAgentChatNotificationEventToThread(thread, event)))
    return
  }
  if (event.type === 'systemNotice' && event.threadId && event.turnId && !agentChatNotificationEventIsStatusSummary(event)) {
    target.updateThreads((current) => current.map((thread) => thread.id === event.threadId ? upsertAgentChatSystemNotice(thread, event.turnId as string, {
      type: 'systemNotice',
      id: event.id ?? `system-notice:${event.code ?? 'notice'}:${event.turnId}`,
      level: event.level,
      title: event.title,
      detail: event.detail,
      code: event.code,
      threadId: event.threadId,
      turnId: event.turnId,
      raw: event.raw,
    }) : thread))
  }
}

function agentChatNotificationEventIsStatusSummary(event: AgentChatNotificationEvent): boolean {
  return event.type === 'mcpStatus'
    || (event.type === 'systemNotice' && event.code === 'remoteControl/status/changed')
    || (event.type === 'systemNotice' && event.code === 'thread/tokenUsage/updated')
    || (event.type === 'systemNotice' && event.code === 'thread/goal/updated')
    || (event.type === 'systemNotice' && event.code === 'thread/goal/cleared')
}

function clearAgentChatRealtimeItemsForThread<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
>(
  target: AgentChatNotificationDispatchTarget<TPendingServerRequest>,
  threadId: string,
): void {
  target.updateRealtimeTranscriptItems?.((current) => {
    const next = { ...current }
    for (const [itemId, item] of Object.entries(current)) {
      if (item.threadId === threadId) delete next[itemId]
    }
    return next
  })
  target.updateRealtimeAudioItems?.((current) => {
    const next = { ...current }
    for (const [itemId, item] of Object.entries(current)) {
      if (item.threadId === threadId) delete next[itemId]
    }
    return next
  })
}

function updateAgentChatRealtimeTranscriptEvent<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
>(
  event: Extract<AgentChatNotificationEvent, { type: 'realtime' }>,
  target: AgentChatNotificationDispatchTarget<TPendingServerRequest>,
): void {
  const update = target.updateRealtimeTranscriptItems
  if (!update) return
  const id = agentChatRealtimeTranscriptItemId(event)
  update((current) => {
    const existing = current[id]
    const text = event.event === 'transcriptDone'
      ? event.text ?? existing?.text ?? ''
      : `${existing?.text ?? ''}${event.delta ?? ''}`
    return {
      ...current,
      [id]: {
        threadId: event.threadId as string,
        id,
        role: event.role ?? existing?.role ?? null,
        text,
        completed: event.event === 'transcriptDone',
      },
    }
  })
}

function agentChatRealtimeTranscriptItemId(event: Extract<AgentChatNotificationEvent, { type: 'realtime' }>): string {
  return `realtime-transcript:${event.threadId}:${event.role ?? 'unknown'}`
}

function updateAgentChatRealtimeAudioEvent<
  TPendingServerRequest extends AgentChatPendingServerRequestEntry = AgentChatPendingServerRequestEntry,
>(
  event: Extract<AgentChatNotificationEvent, { type: 'realtime' }>,
  target: AgentChatNotificationDispatchTarget<TPendingServerRequest>,
): void {
  const update = target.updateRealtimeAudioItems
  const chunk = agentChatRealtimeAudioChunk(event.audio)
  if (!update || !event.threadId || !chunk) return
  const itemId = isRecord(event.audio) ? stringField(event.audio.itemId) ?? null : null
  const id = `realtime-audio:${event.threadId}:${itemId ?? 'output'}`
  update((current) => {
    const existing = current[id]
    return {
      ...current,
      [id]: {
        threadId: event.threadId as string,
        id,
        itemId,
        chunks: [...(existing?.chunks ?? []), chunk],
        sampleRate: existing?.sampleRate ?? chunk.sampleRate,
        numChannels: existing?.numChannels ?? chunk.numChannels,
      },
    }
  })
}

function agentChatRealtimeAudioChunk(value: unknown): AgentChatRealtimeAudioChunk | null {
  if (!isRecord(value)) return null
  const data = stringField(value.data)
  const sampleRate = numberField(value.sampleRate)
  const numChannels = numberField(value.numChannels)
  if (!data || !sampleRate || !numChannels) return null
  return {
    data,
    sampleRate,
    numChannels,
    samplesPerChannel: numberField(value.samplesPerChannel) ?? null,
  }
}

function agentChatRealtimeWavData(audio: AgentChatRealtimeAudioItem): string | null {
  if (!audio.sampleRate || !audio.numChannels) return null
  const pcmChunks = audio.chunks.flatMap((chunk) => Array.from(base64ToBytes(chunk.data) ?? []))
  if (pcmChunks.length === 0) return null
  const pcm = Uint8Array.from(pcmChunks)
  const wav = new Uint8Array(44 + pcm.length)
  writeAscii(wav, 0, 'RIFF')
  writeUint32(wav, 4, 36 + pcm.length)
  writeAscii(wav, 8, 'WAVE')
  writeAscii(wav, 12, 'fmt ')
  writeUint32(wav, 16, 16)
  writeUint16(wav, 20, 1)
  writeUint16(wav, 22, audio.numChannels)
  writeUint32(wav, 24, audio.sampleRate)
  writeUint32(wav, 28, audio.sampleRate * audio.numChannels * 2)
  writeUint16(wav, 32, audio.numChannels * 2)
  writeUint16(wav, 34, 16)
  writeAscii(wav, 36, 'data')
  writeUint32(wav, 40, pcm.length)
  wav.set(pcm, 44)
  return bytesToBase64(wav)
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = globalThis.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return globalThis.btoa(binary)
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index)
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
  bytes[offset + 2] = (value >> 16) & 0xff
  bytes[offset + 3] = (value >> 24) & 0xff
}

function agentChatRealtimeItemProjection(event: Extract<AgentChatNotificationEvent, { type: 'realtime' }>): AgentChatRealtimeTranscriptItem | null {
  if (event.event !== 'itemAdded' || !event.threadId) return null
  const item = isRecord(event.item) ? event.item : null
  if (!item) return null
  const text = agentChatRealtimeItemText(item)
  if (!text.trim()) return null
  const role = stringField(item.role) ?? null
  const itemId = stringField(item.id) ?? `${role ?? 'item'}:${text.slice(0, 32)}`
  return {
    threadId: event.threadId,
    id: `realtime-item:${event.threadId}:${itemId}`,
    role,
    text,
    completed: agentChatRealtimeItemCompleted(item),
  }
}

function agentChatRealtimeItemText(item: Record<string, unknown>): string {
  const directText = stringField(item.text) ?? stringField(item.transcript)
  if (directText) return directText
  const content = Array.isArray(item.content) ? item.content : []
  return content.flatMap((part) => {
    if (!isRecord(part)) return []
    return stringField(part.text) ?? stringField(part.transcript) ?? []
  }).join('\n')
}

function agentChatRealtimeItemCompleted(item: Record<string, unknown>): boolean {
  const status = stringField(item.status)?.toLowerCase()
  return status === 'completed' || status === 'done' || status === 'final'
}

function agentChatApprovalReviewItemFromNotification(
  method: string,
  params: Record<string, unknown>,
): Extract<AgentChatThreadItem, { type: 'approvalReview' }> | null {
  const reviewId = stringField(params.reviewId)
  if (!reviewId) return null
  const review = isRecord(params.review) ? params.review : {}
  const targetItemId = params.targetItemId === null ? null : stringField(params.targetItemId) ?? null
  return {
    type: 'approvalReview',
    id: `approval-review:${reviewId}`,
    reviewId,
    lifecycle: method === 'item/autoApprovalReview/completed' ? 'completed' : 'started',
    targetItemId,
    startedAtMs: numberField(params.startedAtMs) ?? null,
    completedAtMs: numberField(params.completedAtMs) ?? null,
    reviewStatus: stringField(review.status) ?? null,
    riskLevel: stringField(review.riskLevel) ?? null,
    rationale: stringField(review.rationale) ?? null,
    decisionSource: stringField(params.decisionSource) ?? null,
    action: params.action,
    review,
    raw: params,
  }
}

function normalizeAgentChatNotificationThread(value: Record<string, unknown>): AgentChatThread | null {
  const id = stringField(value.id)
  if (!id) return null
  const providerSessionTreeId = stringField(value.providerSessionTreeId) ?? stringField(value.sessionId) ?? id
  return {
    provider: agentChatProviderKind(value.provider),
    id,
    providerSessionTreeId,
    sessionId: providerSessionTreeId, // deprecated providerSessionTreeId compatibility mirror
    preview: stringField(value.preview) ?? '',
    name: stringField(value.name) ?? null,
    createdAt: numberField(value.createdAt) ?? unixSecondsNow(),
    updatedAt: numberField(value.updatedAt) ?? unixSecondsNow(),
    status: agentChatThreadStatusField(value.status) ?? 'unknown',
    ...(Object.prototype.hasOwnProperty.call(value, 'goal') ? { goal: agentThreadGoalStateFromUnknown(value.goal) ?? null } : {}),
    ...(isRecord(value.executionSettings) ? { executionSettings: normalizeAgentThreadExecutionSettings(value.executionSettings) } : {}),
    turns: Array.isArray(value.turns)
      ? value.turns.flatMap((turn) => isRecord(turn) ? [normalizeAgentChatNotificationTurn(turn)].filter(Boolean) as AgentChatTurn[] : [])
      : [],
    raw: value.raw ?? value,
  }
}

function normalizeAgentThreadExecutionSettings(value: Record<string, unknown>): AgentChatThread['executionSettings'] {
  return {
    ...(Object.prototype.hasOwnProperty.call(value, 'model') ? { model: stringField(value.model) ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'modelProvider') ? { modelProvider: stringField(value.modelProvider) ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'cwd') ? { cwd: stringField(value.cwd) ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'approvalPolicy') ? { approvalPolicy: stringField(value.approvalPolicy) ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'approvalsReviewer') ? { approvalsReviewer: stringField(value.approvalsReviewer) ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'sandbox') ? { sandbox: value.sandbox } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'sandboxPolicy') ? { sandboxPolicy: value.sandboxPolicy } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'permissions') ? { permissions: stringField(value.permissions) ?? null } : {}),
  }
}

function activePermissionProfileId(value: unknown): string | null {
  if (value === null) return null
  return isRecord(value) ? stringField(value.id) ?? null : null
}

function normalizeAgentChatNotificationTurn(value: Record<string, unknown>): AgentChatTurn | null {
  const id = stringField(value.id)
  if (!id) return null
  return {
    id,
    items: Array.isArray(value.items)
      ? value.items.flatMap((item) => {
          const normalized = normalizeAgentChatNotificationThreadItem(item)
          return normalized ? [normalized] : []
        })
      : [],
    itemsView: value.itemsView === 'notLoaded' || value.itemsView === 'summary' || value.itemsView === 'full' ? value.itemsView : 'full',
    status: typeof value.status === 'string' ? value.status : 'inProgress',
    error: isRecord(value.error) ? value.error : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
    raw: value.raw,
  }
}

const AGENT_CHAT_NEUTRAL_THREAD_ITEM_TYPES = new Set([
  'userMessage',
  'hookPrompt',
  'agentMessage',
  'plan',
  'reasoning',
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
  'reviewMode',
  'systemNotice',
  'approvalReview',
  'contextCompaction',
  'unknown',
])

function normalizeAgentChatNotificationThreadItem(value: unknown): AgentChatThreadItem | null {
  if (!isRecord(value)) return null
  const providerType = stringField(value.type) ?? 'unknown'
  const id = stringField(value.id) ?? `unknown:${providerType}`
  if (AGENT_CHAT_NEUTRAL_THREAD_ITEM_TYPES.has(providerType) && isAgentChatNotificationNeutralThreadItem(value)) {
    return { ...value, id } as AgentChatThreadItem
  }
  return {
    type: 'unknown',
    id,
    providerType,
    raw: value,
  }
}

function isAgentChatNotificationNeutralThreadItem(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case 'userMessage':
      return Array.isArray(value.content)
    case 'hookPrompt':
      return Array.isArray(value.fragments)
    case 'agentMessage':
      return typeof value.text === 'string'
    case 'plan':
      return typeof value.text === 'string'
    case 'reasoning':
      return Array.isArray(value.summary) && Array.isArray(value.content)
    case 'commandExecution':
      return typeof value.command === 'string'
    case 'fileChange':
      return Array.isArray(value.changes)
    case 'mcpToolCall':
      return typeof value.server === 'string' && typeof value.tool === 'string'
    case 'dynamicToolCall':
      return typeof value.tool === 'string'
    case 'collabAgentToolCall':
      return typeof value.tool === 'string' && Array.isArray(value.receiverThreadIds) && isRecord(value.agentsStates)
    case 'webSearch':
      return typeof value.query === 'string'
    case 'imageView':
      return typeof value.path === 'string'
    case 'imageGeneration':
      return typeof value.status === 'string' && typeof value.result === 'string'
    case 'reviewMode':
      return (value.action === 'entered' || value.action === 'exited') && typeof value.review === 'string'
    case 'systemNotice':
      return typeof value.title === 'string'
    case 'approvalReview':
      return typeof value.reviewId === 'string' && typeof value.lifecycle === 'string'
    case 'contextCompaction':
      return true
    case 'unknown':
      return typeof value.providerType === 'string' && 'raw' in value
    default:
      return false
  }
}

function agentChatProviderKind(value: unknown): AgentChatThread['provider'] {
  return typeof value === 'string' && value.trim() ? value.trim() : 'unknown'
}

function agentChatThreadStatusField(value: unknown): AgentChatThread['status'] | undefined {
  if (typeof value === 'string') {
    if (value === 'notLoaded' || value === 'idle' || value === 'running' || value === 'failed' || value === 'completed' || value === 'cancelled' || value === 'unknown') return value
    if (value === 'active') return 'running'
    if (value === 'systemError') return 'failed'
    return undefined
  }
  if (!isRecord(value)) return undefined
  return agentChatThreadStatusField(value.type)
}

function agentChatTurnErrorFromNotification(value: unknown): { message?: string; [key: string]: unknown } {
  if (isRecord(value)) {
    return {
      ...value,
      ...(typeof value.message === 'string' ? { message: value.message } : {}),
    }
  }
  if (typeof value === 'string') return { message: value }
  return { message: 'Turn failed.' }
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function agentChatThreadNameFromNotificationParams(params: Record<string, unknown>): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(params, 'threadName') && !Object.prototype.hasOwnProperty.call(params, 'name')) return undefined
  const value = Object.prototype.hasOwnProperty.call(params, 'threadName') ? params.threadName : params.name
  if (value === null) return null
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

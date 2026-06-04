import type {
  AgentConversationProjectionContentItem,
  AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function projectionItemsScrollKey(items: AgentConversationProjectionItem[]): string {
  return items.map((item) => {
    if (item.type !== 'run_turn') return projectionContentItemScrollKey(item)
    return [
      'turn',
      item.id,
      item.runId,
      item.items.map(projectionContentItemScrollKey).join(','),
    ].join(':')
  }).join('|')
}

function projectionContentItemScrollKey(item: AgentConversationProjectionContentItem): string {
  if (item.type === 'message') {
    return [
      'message',
      item.id,
      item.item.message.timestamp,
      textFingerprint(item.item.message.content),
      runScrollKey(item.item.activity.embeddedInteractionRun),
      item.item.activity.embeddedInteractionEvents.map(activityEventScrollKey).join(','),
    ].join(':')
  }
  if (item.type === 'assistant_stream') return ['stream', item.id, textFingerprint(item.content)].join(':')
  if (item.type === 'run_activity') {
    return [
      'activity',
      item.id,
      runScrollKey(item.run),
      item.events.map(activityEventScrollKey).join(','),
    ].join(':')
  }
  if (item.type === 'run_interaction') {
    return ['interaction', item.id, runScrollKey(item.run), item.source].join(':')
  }
  return [
    'thinking',
    item.id,
    runScrollKey(item.run),
    item.state.status,
    item.state.toolName ?? '',
    item.state.label ?? '',
    item.state.reasoning ?? '',
  ].join(':')
}

function runScrollKey(run: AgentRun | null): string {
  if (!run) return 'no-run'
  return [
    run.id,
    run.status,
    run.updatedAt,
    run.pendingApprovals?.map((approval) => `${approval.id}:${approval.status}`).join(',') ?? '',
    run.pendingInputRequests?.map((request) => `${request.id}:${request.status}`).join(',') ?? '',
  ].join('/')
}

function activityEventScrollKey(event: ChatRunActivityEvent): string {
  return [
    event.id,
    event.kind,
    event.status,
    event.runId ?? '',
    activityEventStringField(event, 'updatedAt'),
    event.createdAt ?? '',
  ].join('/')
}

function activityEventStringField(event: ChatRunActivityEvent, key: string): string {
  const value = (event as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function textFingerprint(text: string): string {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0
  }
  return `${text.length}:${hash.toString(36)}`
}

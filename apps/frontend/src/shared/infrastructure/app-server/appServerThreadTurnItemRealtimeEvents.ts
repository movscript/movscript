import type { AgentChatNotificationEvent } from '@movscript/core/agent/chat'
import type { AppServerJsonRpcNotification } from '@/shared/infrastructure/app-server/appServerProtocol'
import { isRecord, stringField } from '@/shared/infrastructure/app-server/appServerThreadTurnItemNotificationDetails'

export function realtimeEventFromAppServerThreadTurnItem(notification: AppServerJsonRpcNotification, params: Record<string, unknown>): AgentChatNotificationEvent | undefined {
  const threadId = stringField(params.threadId)
  const event = notification.method.replace(/^thread\/realtime\//, '')
  if (!threadId && notification.method !== 'thread/realtime/error') return undefined
  if (event === 'started') {
    return {
      type: 'realtime',
      event,
      threadId,
      realtimeSessionId: stringField(params.realtimeSessionId) ?? null,
      version: stringField(params.version) ?? null,
      raw: notification,
    }
  }
  if (event === 'itemAdded') {
    return {
      type: 'realtime',
      event,
      threadId,
      item: params.item,
      raw: notification,
    }
  }
  if (event === 'transcript/delta' || event === 'transcript/done') {
    return {
      type: 'realtime',
      event: event === 'transcript/delta' ? 'transcriptDelta' : 'transcriptDone',
      threadId,
      role: stringField(params.role) ?? null,
      delta: event === 'transcript/delta' ? stringField(params.delta) ?? '' : null,
      text: event === 'transcript/done' ? stringField(params.text) ?? '' : null,
      raw: notification,
    }
  }
  if (event === 'outputAudio/delta') {
    return {
      type: 'realtime',
      event: 'outputAudioDelta',
      threadId,
      audio: isRecord(params.audio) ? params.audio : null,
      raw: notification,
    }
  }
  if (event === 'sdp') {
    return {
      type: 'realtime',
      event: 'sdp',
      threadId,
      sdp: stringField(params.sdp) ?? null,
      raw: notification,
    }
  }
  if (event === 'error') {
    return {
      type: 'realtime',
      event: 'error',
      threadId,
      message: stringField(params.message) ?? 'Realtime error',
      raw: notification,
    }
  }
  if (event === 'closed') {
    return {
      type: 'realtime',
      event: 'closed',
      threadId,
      reason: stringField(params.reason) ?? null,
      raw: notification,
    }
  }
  return {
    type: 'realtime',
    event,
    threadId,
    raw: notification,
  }
}

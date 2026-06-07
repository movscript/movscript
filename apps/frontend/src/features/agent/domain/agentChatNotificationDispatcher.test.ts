import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import type { AgentChatNotification, AgentChatNotificationEvent, AgentChatServerRequestResponse, AgentChatThread } from '@/features/agent/domain/agentChatProtocol'
import {
  AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE,
  AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE,
} from '@/features/agent/domain/agentChatNotificationDispatchCoverage'
import {
  agentChatNotificationEventShouldDisplayAsRecent,
  buildAgentChatVisibleItems,
  dispatchAgentChatNotification,
  type AgentChatNotificationDispatchTarget,
  type AgentChatPendingServerRequestEntry,
  type AgentChatPendingUserItem,
  type AgentChatRealtimeAudioItem,
  type AgentChatRealtimeTranscriptItem,
  type AgentChatStreamingAgentItem,
} from '@/features/agent/domain/agentChatNotificationDispatcher'

type PendingServerRequestTestEntry = AgentChatPendingServerRequestEntry & {
  resolve?: (response: AgentChatServerRequestResponse | undefined) => void
}

test('agent chat notification dispatcher streams agent message deltas outside committed turns', () => {
  const harness = new NotificationHarness()
  dispatchAgentChatNotification(notification('item/agentMessage/delta', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'agent_1',
    delta: 'hel',
  }), harness.target())
  dispatchAgentChatNotification(notification('item/agentMessage/delta', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'agent_1',
    delta: 'lo',
  }), harness.target())

  assert.deepEqual(harness.streamingAgentItems.agent_1, {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'agent_1',
    text: 'hello',
  })
  assert.deepEqual(buildAgentChatVisibleItems(harness.threads[0] as AgentChatThread, [], harness.streamingAgentItems).map((item) => item.item), [{
    type: 'agentMessage',
    id: 'agent_1',
    text: 'hello',
    phase: null,
    memoryCitation: null,
  }])
})

test('agent chat visible item projection deduplicates transient items by id', () => {
  const visible = buildAgentChatVisibleItems(threadFixture(), [{
    threadId: 'thread_1',
    item: {
      type: 'userMessage',
      id: 'shared_1',
      clientId: null,
      content: [{ type: 'text', text: 'pending', textElements: [] }],
    },
  }], {
    shared_1: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'shared_1', text: 'streaming' },
  }, {
    shared_1: { threadId: 'thread_1', id: 'shared_1', role: 'assistant', text: 'realtime', completed: false },
  }, {
    shared_1: {
      threadId: 'thread_1',
      id: 'shared_1',
      itemId: 'audio_1',
      sampleRate: 24000,
      numChannels: 1,
      chunks: [{ data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 1 }],
    },
  })

  assert.deepEqual(visible.map((item) => item.viewId), ['pending:shared_1'])
})

test('agent chat notification dispatcher clears optimistic user and streaming agent items when item completes', () => {
  const harness = new NotificationHarness()
  harness.pendingUserItems = [{
    threadId: 'thread_1',
    item: {
      type: 'userMessage',
      id: 'pending_user_1',
      clientId: 'client_user_1',
      content: [{ type: 'text', text: 'Hi', textElements: [] }],
    },
  }]
  harness.streamingAgentItems = {
    agent_1: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'agent_1', text: 'draft' },
  }

  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'userMessage',
      id: 'user_1',
      clientId: 'client_user_1',
      content: [{ type: 'text', text: 'Hi', textElements: [] }],
    },
  }), harness.target())
  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'agentMessage',
      id: 'agent_1',
      text: 'final',
      phase: null,
      memoryCitation: null,
    },
  }), harness.target())

  assert.equal(harness.pendingUserItems.length, 0)
  assert.deepEqual(harness.streamingAgentItems, {})
  assert.deepEqual(harness.threads[0]?.turns[0]?.items.map((item) => item.id), ['user_1', 'agent_1'])
})

test('agent chat notification dispatcher commits streaming agent text on item completion', () => {
  const harness = new NotificationHarness()
  harness.streamingAgentItems = {
    agent_empty: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'agent_empty', text: 'draft' },
    agent_full: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'agent_full', text: 'hel' },
  }

  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'agentMessage',
      id: 'agent_empty',
      text: '',
      phase: null,
      memoryCitation: null,
    },
  }), harness.target())
  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'agentMessage',
      id: 'agent_full',
      text: 'hello',
      phase: null,
      memoryCitation: null,
    },
  }), harness.target())

  const items = harness.threads[0]?.turns[0]?.items ?? []
  const emptyFinalItem = items.find((item) => item.id === 'agent_empty')
  const fullFinalItem = items.find((item) => item.id === 'agent_full')
  assert.equal(emptyFinalItem?.type === 'agentMessage' ? emptyFinalItem.text : '', 'draft')
  assert.equal(fullFinalItem?.type === 'agentMessage' ? fullFinalItem.text : '', 'hello')
  assert.deepEqual(harness.streamingAgentItems, {})
})

test('agent chat notification dispatcher routes reasoning deltas by protocol indexes', () => {
  const harness = new NotificationHarness()
  dispatchAgentChatNotification(notification('item/reasoning/summaryPartAdded', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'reason_1',
    summaryIndex: 1,
  }), harness.target())
  dispatchAgentChatNotification(notification('item/reasoning/summaryTextDelta', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'reason_1',
    summaryIndex: 1,
    delta: 'summary',
  }), harness.target())
  dispatchAgentChatNotification(notification('item/reasoning/textDelta', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'reason_1',
    contentIndex: 2,
    delta: 'trace',
  }), harness.target())

  const item = harness.threads[0]?.turns[0]?.items[0]
  assert.deepEqual(item?.type === 'reasoning' ? item.summary : [], ['', 'summary'])
  assert.deepEqual(item?.type === 'reasoning' ? item.content : [], ['', '', 'trace'])
})

test('agent chat notification dispatcher projects realtime transcript as visible messages', () => {
  const harness = new NotificationHarness()
  dispatchAgentChatNotification({
    method: 'thread/realtime/transcript/delta',
    event: {
      type: 'realtime',
      event: 'transcriptDelta',
      threadId: 'thread_1',
      role: 'assistant',
      delta: 'hel',
      text: null,
    },
  }, harness.target())
  dispatchAgentChatNotification({
    method: 'thread/realtime/transcript/delta',
    event: {
      type: 'realtime',
      event: 'transcriptDelta',
      threadId: 'thread_1',
      role: 'assistant',
      delta: 'lo',
      text: null,
    },
  }, harness.target())
  dispatchAgentChatNotification({
    method: 'thread/realtime/transcript/done',
    event: {
      type: 'realtime',
      event: 'transcriptDone',
      threadId: 'thread_1',
      role: 'assistant',
      delta: null,
      text: 'hello final',
    },
  }, harness.target())

  const visible = buildAgentChatVisibleItems(
    harness.threads[0] as AgentChatThread,
    [],
    {},
    harness.realtimeTranscriptItems,
  )
  const item = visible.find((entry) => entry.viewId === 'realtime:realtime-transcript:thread_1:assistant')
  assert.equal(item?.streaming, false)
  assert.equal(item?.item.type === 'agentMessage' ? item.item.text : '', 'hello final')
})

test('agent chat notification dispatcher projects text realtime itemAdded events as visible messages', () => {
  const harness = new NotificationHarness()
  const assistantEvent = {
    type: 'realtime' as const,
    event: 'itemAdded',
    threadId: 'thread_1',
    item: { id: 'item_1', role: 'assistant', status: 'completed', content: [{ text: 'assistant text' }] },
  }
  const userEvent = {
    type: 'realtime' as const,
    event: 'itemAdded',
    threadId: 'thread_1',
    item: { id: 'item_2', role: 'user', transcript: 'user text' },
  }
  dispatchAgentChatNotification({ method: 'thread/realtime/itemAdded', event: assistantEvent }, harness.target())
  dispatchAgentChatNotification({ method: 'thread/realtime/itemAdded', event: userEvent }, harness.target())

  const visible = buildAgentChatVisibleItems(
    harness.threads[0] as AgentChatThread,
    [],
    {},
    harness.realtimeTranscriptItems,
  )
  const assistant = visible.find((entry) => entry.viewId === 'realtime:realtime-item:thread_1:item_1')
  const user = visible.find((entry) => entry.viewId === 'realtime:realtime-item:thread_1:item_2')
  assert.equal(assistant?.streaming, false)
  assert.equal(assistant?.item.type === 'agentMessage' ? assistant.item.text : '', 'assistant text')
  assert.equal(user?.item.type, 'userMessage')
  assert.deepEqual(user?.item.type === 'userMessage' ? user.item.content : [], [{ type: 'text', text: 'user text', textElements: [] }])
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(assistantEvent), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({
    type: 'realtime',
    event: 'itemAdded',
    threadId: 'thread_1',
    item: { id: 'item_3', role: 'assistant', content: [{ type: 'image' }] },
  }), true)
})

test('agent chat notification dispatcher projects realtime output audio as visible media', () => {
  const harness = new NotificationHarness()
  const event = {
    type: 'realtime' as const,
    event: 'outputAudioDelta',
    threadId: 'thread_1',
    audio: { data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 1, itemId: 'audio_1' },
  }
  dispatchAgentChatNotification({ method: 'thread/realtime/outputAudio/delta', event }, harness.target())
  dispatchAgentChatNotification({
    method: 'thread/realtime/outputAudio/delta',
    event: {
      ...event,
      audio: { data: 'AAA=', sampleRate: 24000, numChannels: 1, samplesPerChannel: 1, itemId: 'audio_1' },
    },
  }, harness.target())

  const visible = buildAgentChatVisibleItems(
    harness.threads[0] as AgentChatThread,
    [],
    {},
    {},
    harness.realtimeAudioItems,
  )
  const item = visible.find((entry) => entry.viewId === 'realtime:realtime-audio:thread_1:audio_1')
  const contentItem = item?.item.type === 'dynamicToolCall' ? item.item.contentItems?.[0] : null
  const content = typeof contentItem === 'object' && contentItem !== null && !Array.isArray(contentItem) ? contentItem as Record<string, unknown> : {}
  assert.equal(item?.item.type, 'dynamicToolCall')
  assert.equal(item?.item.type === 'dynamicToolCall' ? item.item.tool : '', 'output_audio')
  assert.equal(content.type, 'audio')
  assert.equal(content.mimeType, 'audio/wav')
  assert.equal(typeof content.data, 'string')
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(event), false)
})

test('agent chat notification dispatcher clears realtime transient items when turn completes', () => {
  const harness = new NotificationHarness()
  harness.realtimeTranscriptItems = {
    transcript_1: { threadId: 'thread_1', id: 'transcript_1', role: 'assistant', text: 'draft transcript', completed: true },
    transcript_other: { threadId: 'thread_other', id: 'transcript_other', role: 'assistant', text: 'other transcript', completed: true },
  }
  harness.realtimeAudioItems = {
    audio_1: {
      threadId: 'thread_1',
      id: 'audio_1',
      itemId: 'audio_item_1',
      sampleRate: 24000,
      numChannels: 1,
      chunks: [{ data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 1 }],
    },
    audio_other: {
      threadId: 'thread_other',
      id: 'audio_other',
      itemId: 'audio_item_other',
      sampleRate: 24000,
      numChannels: 1,
      chunks: [{ data: 'AAAA', sampleRate: 24000, numChannels: 1, samplesPerChannel: 1 }],
    },
  }

  dispatchAgentChatNotification(notification('turn/completed', {
    threadId: 'thread_1',
    turn: {
      id: 'turn_1',
      items: [{
        type: 'agentMessage',
        id: 'agent_final_1',
        text: 'final',
        phase: null,
        memoryCitation: null,
      }],
      itemsView: 'full',
      status: 'completed',
      error: null,
      startedAt: 10,
      completedAt: 20,
      durationMs: 10,
    },
  }), harness.target())

  assert.deepEqual(Object.keys(harness.realtimeTranscriptItems), ['transcript_other'])
  assert.deepEqual(Object.keys(harness.realtimeAudioItems), ['audio_other'])
  assert.deepEqual(harness.readThreadIds, ['thread_1'])
})

test('agent chat notification dispatcher removes archived thread session state', () => {
  const harness = new NotificationHarness()
  const resolvedRequests: Array<{ id: string; response: AgentChatServerRequestResponse | undefined }> = []
  harness.activeThreadId = 'thread_1'
  harness.pendingUserItems = [{
    threadId: 'thread_1',
    item: { type: 'userMessage', id: 'pending_user_1', clientId: null, content: [{ type: 'text', text: 'Hi', textElements: [] }] },
  }]
  harness.pendingServerRequests = [{
    request: { id: 'request_1', method: 'item/permissions/requestApproval', threadId: 'thread_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_1', response }),
  }]
  harness.streamingAgentItems = {
    agent_1: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'agent_1', text: 'draft' },
  }

  dispatchAgentChatNotification({
    method: 'thread/archived',
    event: { type: 'threadLifecycle', action: 'archived', threadId: 'thread_1' },
  }, harness.target())

  assert.equal(harness.activeThreadId, null)
  assert.equal(harness.threads.length, 0)
  assert.equal(harness.pendingUserItems.length, 0)
  assert.equal(harness.pendingServerRequests.length, 0)
  assert.deepEqual(resolvedRequests, [{ id: 'request_1', response: undefined }])
  assert.deepEqual(harness.streamingAgentItems, {})
})

test('agent chat notification dispatcher releases pending server requests when resolved externally', () => {
  const harness = new NotificationHarness()
  const resolvedRequests: Array<{ id: string; response: AgentChatServerRequestResponse | undefined }> = []
  harness.pendingServerRequests = [{
    request: { id: 'request_1', method: 'item/tool/requestUserInput', threadId: 'thread_1', turnId: 'turn_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_1', response }),
  }, {
    request: { id: 'request_2', method: 'item/tool/requestUserInput', threadId: 'thread_1', turnId: 'turn_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_2', response }),
  }]

  dispatchAgentChatNotification({
    method: 'serverRequest/resolved',
    event: { type: 'serverRequestResolved', requestId: 'request_1', threadId: 'thread_1' },
  }, harness.target())

  assert.deepEqual(harness.pendingServerRequests.map((item) => item.request.id), ['request_2'])
  assert.deepEqual(resolvedRequests, [{ id: 'request_1', response: undefined }])
})

test('agent chat notification dispatcher releases MCP step fallback approvals by interaction raw id', () => {
  const harness = new NotificationHarness()
  const resolvedRequests: Array<{ id: string; response: AgentChatServerRequestResponse | undefined }> = []
  harness.pendingServerRequests = [{
    request: {
      id: 'interaction_focus_approval',
      method: 'item/permissions/requestApproval',
      threadId: 'thread_1',
      turnId: 'run_active',
      itemId: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
      params: {
        interactionId: 'interaction_focus_approval',
        toolName: 'movscript_focus_get',
      },
    },
    resolve: (response) => resolvedRequests.push({ id: 'interaction_focus_approval', response }),
  }]

  dispatchAgentChatNotification({
    method: 'serverRequest/resolved',
    event: {
      type: 'serverRequestResolved',
      threadId: 'thread_1',
      requestId: 'approval_focus_get',
      raw: {
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_focus_approval',
            payload: { approvalId: 'approval_focus_get' },
          },
        },
      },
    },
  }, harness.target())

  assert.deepEqual(harness.pendingServerRequests, [])
  assert.deepEqual(resolvedRequests, [{ id: 'interaction_focus_approval', response: undefined }])
})

test('agent chat notification dispatcher keeps MCP item state stable across approval resolution and step completion', () => {
  const harness = new NotificationHarness()
  const resolvedRequests: Array<{ id: string; response: AgentChatServerRequestResponse | undefined }> = []
  harness.threads = [threadFixture({
    type: 'mcpToolCall',
    id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    progressMessages: ['Waiting for approval'],
  })]
  harness.pendingServerRequests = [{
    request: {
      id: 'interaction_focus_approval',
      method: 'item/permissions/requestApproval',
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
      params: {
        interactionId: 'interaction_focus_approval',
        toolName: 'movscript_focus_get',
      },
    },
    resolve: (response) => resolvedRequests.push({ id: 'interaction_focus_approval', response }),
  }]

  dispatchAgentChatNotification({
    method: 'serverRequest/resolved',
    event: {
      type: 'serverRequestResolved',
      threadId: 'thread_1',
      requestId: 'approval_focus_get',
      raw: {
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_focus_approval',
            payload: { approvalId: 'approval_focus_get' },
          },
        },
      },
    },
  }, harness.target())

  const waitingItem = harness.threads[0]?.turns[0]?.items[0]
  assert.deepEqual(harness.pendingServerRequests, [])
  assert.deepEqual(resolvedRequests, [{ id: 'interaction_focus_approval', response: undefined }])
  assert.equal(waitingItem?.type, 'mcpToolCall')
  assert.equal(waitingItem?.type === 'mcpToolCall' ? waitingItem.status : '', 'inProgress')
  assert.deepEqual(waitingItem?.type === 'mcpToolCall' ? waitingItem.progressMessages : [], ['Waiting for approval'])

  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'mcpToolCall',
      id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
      server: 'movscript_workspace',
      tool: 'movscript_focus_get',
      status: 'completed',
      result: {
        content: [{ type: 'text', text: 'Focused resource: scene_1' }],
        structuredContent: { resourceId: 'scene_1' },
        _meta: null,
      },
      durationMs: 42,
    },
  }), harness.target())

  const completedItem = harness.threads[0]?.turns[0]?.items[0]
  assert.equal(completedItem?.type, 'mcpToolCall')
  if (completedItem?.type === 'mcpToolCall') {
    assert.equal(completedItem.status, 'completed')
    assert.deepEqual(completedItem.progressMessages, ['Waiting for approval'])
    assert.deepEqual(completedItem.result, {
      content: [{ type: 'text', text: 'Focused resource: scene_1' }],
      structuredContent: { resourceId: 'scene_1' },
      _meta: null,
    })
    assert.equal(completedItem.durationMs, 42)
  }
})

test('agent chat notification dispatcher handles turn completion as state update plus reload effect', () => {
  const harness = new NotificationHarness()
  const resolvedRequests: Array<{ id: string; response: AgentChatServerRequestResponse | undefined }> = []
  harness.pendingUserItems = [{
    threadId: 'thread_1',
    item: { type: 'userMessage', id: 'pending_user_1', clientId: null, content: [{ type: 'text', text: 'Hi', textElements: [] }] },
  }]
  harness.pendingServerRequests = [{
    request: { id: 'request_same_turn', method: 'item/permissions/requestApproval', threadId: 'thread_1', turnId: 'turn_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_same_turn', response }),
  }, {
    request: { id: 'request_thread_scoped', method: 'item/tool/requestUserInput', threadId: 'thread_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_thread_scoped', response }),
  }, {
    request: { id: 'request_other_turn', method: 'item/permissions/requestApproval', threadId: 'thread_1', turnId: 'turn_2', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_other_turn', response }),
  }, {
    request: { id: 'request_other_thread', method: 'item/permissions/requestApproval', threadId: 'thread_2', turnId: 'turn_1', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_other_thread', response }),
  }, {
    request: { id: 'request_global', method: 'attestation/generate', params: {} },
    resolve: (response) => resolvedRequests.push({ id: 'request_global', response }),
  }]
  harness.streamingAgentItems = {
    agent_1: { threadId: 'thread_1', turnId: 'turn_1', itemId: 'agent_1', text: 'draft' },
  }

  dispatchAgentChatNotification(notification('turn/completed', {
    threadId: 'thread_1',
    turn: {
      id: 'turn_1',
      items: [],
      status: 'completed',
      completedAt: 20,
      durationMs: 10,
    },
  }), harness.target())

  assert.equal(harness.threads[0]?.turns[0]?.status, 'completed')
  assert.equal(harness.pendingUserItems.length, 0)
  assert.deepEqual(harness.pendingServerRequests.map((item) => item.request.id), [
    'request_other_turn',
    'request_other_thread',
    'request_global',
  ])
  assert.deepEqual(resolvedRequests, [
    { id: 'request_same_turn', response: undefined },
    { id: 'request_thread_scoped', response: undefined },
  ])
  assert.deepEqual(harness.streamingAgentItems, {})
  assert.deepEqual(harness.readThreadIds, ['thread_1'])
})

test('agent chat notification dispatcher quarantines provider-specific raw items as unknown', () => {
  const harness = new NotificationHarness()

  dispatchAgentChatNotification(notification('item/started', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'enteredReviewMode',
      id: 'review_1',
      review: 'changes',
    },
  }), harness.target())
  dispatchAgentChatNotification(notification('turn/completed', {
    threadId: 'thread_1',
    turn: {
      id: 'turn_2',
      items: [{
        type: 'exitedReviewMode',
        id: 'review_2',
        review: 'changes',
      }],
      status: 'completed',
    },
  }), harness.target())
  dispatchAgentChatNotification(notification('item/completed', {
    threadId: 'thread_1',
    turnId: 'turn_1',
    item: {
      type: 'agentMessage',
      id: 'raw_agent_message_without_text',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'provider raw content' }],
    },
  }), harness.target())

  const startedItem = harness.threads[0]?.turns[0]?.items[0]
  const malformedNeutralItem = harness.threads[0]?.turns[0]?.items[1]
  const completedItem = harness.threads[0]?.turns.find((turn) => turn.id === 'turn_2')?.items[0]
  assert.equal(startedItem?.type, 'unknown')
  assert.equal(startedItem?.type === 'unknown' ? startedItem.providerType : '', 'enteredReviewMode')
  assert.equal(malformedNeutralItem?.type, 'unknown')
  assert.equal(malformedNeutralItem?.type === 'unknown' ? malformedNeutralItem.providerType : '', 'agentMessage')
  assert.equal(completedItem?.type, 'unknown')
  assert.equal(completedItem?.type === 'unknown' ? completedItem.providerType : '', 'exitedReviewMode')
})

test('agent chat notification dispatcher updates thread metadata without replacing turns', () => {
  const harness = new NotificationHarness()
  harness.threads = [threadFixture({
    type: 'agentMessage',
    id: 'agent_1',
    text: 'Existing content',
    phase: null,
    memoryCitation: null,
  })]

  dispatchAgentChatNotification(notification('thread/metadata/updated', {
    threadId: 'thread_1',
    threadName: 'Renamed thread',
    preview: 'Updated preview',
    status: 'completed',
    updatedAt: 20,
  }), harness.target())

  assert.equal(harness.threads[0]?.name, 'Renamed thread')
  assert.equal(harness.threads[0]?.preview, 'Updated preview')
  assert.equal(harness.threads[0]?.status, 'completed')
  assert.equal(harness.threads[0]?.updatedAt, 20)
  assert.deepEqual(harness.threads[0]?.turns[0]?.items.map((item) => item.id), ['agent_1'])
})

test('agent chat notification dispatcher applies command output events to matching command items', () => {
  const harness = new NotificationHarness()
  harness.threads = [threadFixture({
    type: 'commandExecution',
    id: 'cmd_1',
    processId: 'proc_1',
    command: 'pnpm test',
    status: 'running',
    aggregatedOutput: 'start\n',
  })]

  dispatchAgentChatNotification({
    method: 'command/exec/outputDelta',
    event: {
      type: 'commandOutput',
      processId: 'proc_1',
      stream: 'stdout',
      deltaBase64: 'b2sK',
      text: 'ok\n',
      capReached: false,
    },
  }, harness.target())

  const command = harness.threads[0]?.turns[0]?.items[0]
  assert.equal(command?.type, 'commandExecution')
  assert.equal(command?.type === 'commandExecution' ? command.aggregatedOutput : '', 'start\nok\n')
})

test('agent chat notification dispatcher classifies recent capability events separately from state mutations', () => {
  const commandOutput: AgentChatNotificationEvent = {
    type: 'commandOutput',
    processId: 'proc_1',
    stream: 'stdout',
    deltaBase64: 'b2sK',
    text: 'ok\n',
    capReached: false,
  }
  const account: AgentChatNotificationEvent = {
    type: 'account',
    event: 'updated',
    detail: { accountId: 'acct_1' },
  }
  const globalNotice: AgentChatNotificationEvent = {
    type: 'systemNotice',
    level: 'warning',
    title: 'Config warning',
    detail: 'missing config',
  }
  const turnNotice: AgentChatNotificationEvent = {
    type: 'systemNotice',
    level: 'warning',
    threadId: 'thread_1',
    turnId: 'turn_1',
    title: 'Turn warning',
    detail: 'tool warning',
  }

  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(commandOutput), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'serverRequestResolved', requestId: 'request_1' }), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'threadLifecycle', action: 'archived', threadId: 'thread_1' }), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(account), true)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'mcpStatus', server: 'fs', status: 'running', error: null }), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(globalNotice), true)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent(turnNotice), false)
})

test('agent chat notification dispatcher routes status notices out of turn items', () => {
  const harness = new NotificationHarness()
  dispatchAgentChatNotification({
    method: 'thread/tokenUsage/updated',
    event: {
      type: 'systemNotice',
      level: 'info',
      id: 'turn-token-usage:turn_1',
      code: 'thread/tokenUsage/updated',
      threadId: 'thread_1',
      turnId: 'turn_1',
      title: 'Token usage updated',
      detail: 'total: total 111',
    },
  }, harness.target())

  assert.equal(harness.threads[0]?.turns[0]?.items.length, 0)
})

test('agent chat notification dispatcher recent-event classifier matches dispatch coverage', () => {
  const recentEventTypes = Object.entries(AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE)
    .filter(([type, coverage]) => type !== 'mcpStatus' && coverage.handling.length === 0)
    .map(([type]) => type)
    .sort()
  const mutationEventTypes = Object.entries(AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE)
    .filter(([type, coverage]) => type !== 'systemNotice' && coverage.handling.length > 0)
    .map(([type]) => type)
    .sort()

  assert.deepEqual(recentEventTypes, ['account', 'fsChanged'])
  assert.deepEqual(mutationEventTypes, ['commandOutput', 'processExited', 'processOutput', 'realtime', 'serverRequestResolved', 'threadLifecycle'])
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'fsChanged', watchId: 'watch_1', changedPaths: [] }), true)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'realtime', event: 'started', threadId: 'thread_1', realtimeSessionId: null }), true)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'realtime', event: 'transcriptDelta', threadId: 'thread_1', role: 'assistant', delta: 'hi', text: null }), false)
  assert.equal(agentChatNotificationEventShouldDisplayAsRecent({ type: 'processExited', processHandle: 'proc_1', exitCode: 0, stdout: '', stderr: '', stdoutCapReached: false, stderrCapReached: false }), false)
})

test('agent chat notification dispatcher method branches are covered explicitly', () => {
  const dispatcher = readFileSync(resolve('src/features/agent/domain/agentChatNotificationDispatcher.ts'), 'utf8')
  const implemented = uniqueMatches(dispatcher, /notification\.method === '([^']+)'/g)
  const covered = Object.keys(AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE).sort()

  assert.deepEqual(implemented, covered)
  assert.equal(covered.includes('command/exec/outputDelta'), false)
})

test('agent chat notification dispatcher event mutations are covered explicitly', () => {
  const dispatcher = readFileSync(resolve('src/features/agent/domain/agentChatNotificationDispatcher.ts'), 'utf8')
  const implemented = uniqueMatches(dispatcher, /event\.type === '([^']+)'/g)
    .filter((type) => type !== 'mcpStatus')
  const coveredMutations = Object.entries(AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE)
    .filter(([type, coverage]) => type !== 'mcpStatus' && coverage.handling.length > 0)
    .map(([type]) => type)
    .sort()

  assert.deepEqual(implemented, coveredMutations)
})

class NotificationHarness {
  activeThreadId: string | null = 'thread_1'
  threads: AgentChatThread[] = [threadFixture()]
  pendingUserItems: AgentChatPendingUserItem[] = []
  pendingServerRequests: PendingServerRequestTestEntry[] = []
  streamingAgentItems: Record<string, AgentChatStreamingAgentItem> = {}
  realtimeTranscriptItems: Record<string, AgentChatRealtimeTranscriptItem> = {}
  realtimeAudioItems: Record<string, AgentChatRealtimeAudioItem> = {}
  readThreadIds: string[] = []

  target(): AgentChatNotificationDispatchTarget<PendingServerRequestTestEntry> {
    return {
      upsertThread: (thread) => {
        this.threads = [thread, ...this.threads.filter((item) => item.id !== thread.id)]
      },
      updateThreads: (updater) => {
        this.threads = updater(this.threads)
      },
      activeThreadId: this.activeThreadId,
      setActiveThreadId: (threadId) => {
        this.activeThreadId = threadId
      },
      updatePendingUserItems: (updater) => {
        this.pendingUserItems = updater(this.pendingUserItems)
      },
      updatePendingServerRequests: (updater) => {
        this.pendingServerRequests = updater(this.pendingServerRequests)
      },
      updateStreamingAgentItems: (updater) => {
        this.streamingAgentItems = updater(this.streamingAgentItems)
      },
      readStreamingAgentItems: () => this.streamingAgentItems,
      updateRealtimeTranscriptItems: (updater) => {
        this.realtimeTranscriptItems = updater(this.realtimeTranscriptItems)
      },
      updateRealtimeAudioItems: (updater) => {
        this.realtimeAudioItems = updater(this.realtimeAudioItems)
      },
      readThread: (threadId) => {
        this.readThreadIds.push(threadId)
      },
    }
  }
}

function notification(method: string, params: unknown): AgentChatNotification {
  return { method, params }
}

function threadFixture(...items: AgentChatThread['turns'][number]['items']): AgentChatThread {
  return {
    provider: 'codex',
    id: 'thread_1',
    sessionId: 'session_1',
    preview: '',
    name: null,
    createdAt: 1,
    updatedAt: 1,
    status: 'running',
    turns: [{
      id: 'turn_1',
      items,
      itemsView: 'full',
      status: 'inProgress',
      error: null,
      startedAt: 10,
      completedAt: null,
      durationMs: null,
    }],
  }
}

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return Array.from(new Set(Array.from(source.matchAll(pattern), (match) => match[1] as string))).sort()
}

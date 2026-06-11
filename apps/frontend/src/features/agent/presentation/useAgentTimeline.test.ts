import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  timelineItemToChatMessage,
  isTranscriptTimelineItem,
  localTimelineItemMatchesScope,
  timelineEffectiveScope,
  timelineScopeKey,
  visibleTimelineStateForScope,
  type TimelineViewState,
} from '@/features/agent/presentation/useAgentTimeline'
import {
  PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE,
  PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE,
  PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE,
  PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE,
} from '@/shared/infrastructure/provider-session-client/providerSessionTimelineCoverage'
import type { AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

test('visibleTimelineStateForScope hides stale items synchronously when item scope changes', () => {
  const previous = state({
    scopeKey: timelineScopeKey('session_1', 'thread_old'),
    items: [message({ id: 'old_run_message', content: 'old run' })],
    loaded: true,
    loading: false,
  })

  const visible = visibleTimelineStateForScope(previous, timelineScopeKey('session_1', 'thread_new'))

  assert.deepEqual(visible.items, [])
  assert.equal(visible.loaded, false)
  assert.equal(visible.loading, true)
  assert.equal(visible.scopeKey, timelineScopeKey('session_1', 'thread_new'))
})

test('visibleTimelineStateForScope keeps current scope items', () => {
  const current = state({
    scopeKey: timelineScopeKey('session_1', 'thread_1'),
    items: [message({ id: 'current_run_message', content: 'current run' })],
    loaded: true,
    loading: false,
  })

  assert.equal(visibleTimelineStateForScope(current, current.scopeKey), current)
})

test('timelineEffectiveScope can require a thread for chat timelines', () => {
  assert.deepEqual(timelineEffectiveScope({
    providerSessionId: ' session_1 ',
    requireThread: true,
  }), {
    sessionId: '',
    threadId: '',
  })
  assert.deepEqual(timelineEffectiveScope({
    providerSessionId: ' session_1 ',
    providerThreadId: ' thread_1 ',
    requireThread: true,
  }), {
    sessionId: 'session_1',
    threadId: 'thread_1',
  })
})

test('timelineItemToChatMessage derives generation jobs from activity events', () => {
  const chatMessage = timelineItemToChatMessage(message({
    activity: {
      runId: 'run_1',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
      steps: [],
      events: [{
        id: 'trace_1',
        kind: 'tool_call',
        title: 'Generation completed',
        status: 'completed',
        createdAt: '2026-05-19T00:00:01.000Z',
        completedAt: '2026-05-19T00:00:02.000Z',
        data: {
          generation: {
            jobId: 88,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 880,
          },
        },
      }],
    },
  }))

  assert.ok(chatMessage)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.jobId, 88)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.terminal, true)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.outputResourceId, 880)
})

test('timelineItemToChatMessage keeps timeline status metadata out of chat messages', () => {
  const chatMessage = timelineItemToChatMessage(message({
    id: 'assistant:run_1',
    content: 'Plan updated',
    providerSessionRefs: { threadId: 'thread_1', messageId: 'msg_plan', runId: 'run_1' },
    meta: {
      planRevision: {
        schema: 'movscript.agent.plan-revision.v1',
        id: 'plan_revision_1',
        planId: 'plan_1',
        threadId: 'thread_1',
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          items: [{ step: 'Generate', status: 'completed' }],
          completedCount: 1,
          totalCount: 1,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
        createdAt: '2026-05-19T00:00:00.000Z',
      },
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
        workId: 'work_1',
      },
    },
  }))

  assert.ok(chatMessage)
  assert.equal(Object.prototype.hasOwnProperty.call(chatMessage.meta ?? {}, 'planRevision'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(chatMessage.meta ?? {}, 'runtimeStatus'), false)
  assert.equal(chatMessage.meta?.providerSessionMessage?.messageId, 'msg_plan')
  assert.equal(chatMessage.meta?.providerSessionMessage?.runId, 'run_1')
})

test('timelineItemToChatMessage only projects transcript text messages into chat', () => {
  assert.equal(isTranscriptTimelineItem(message({ origin: 'agent', purpose: 'transcript', surface: 'message_stream' })), true)
  assert.equal(isTranscriptTimelineItem(message({ origin: 'user', purpose: 'transcript', surface: 'message_stream' })), true)
  assert.equal(isTranscriptTimelineItem(message({ origin: 'provider_session', purpose: 'status', surface: 'status_strip', content: 'status' })), false)
  assert.equal(timelineItemToChatMessage(message({
    origin: 'provider_session',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    content: 'provider session status',
  })), undefined)
  assert.equal(timelineItemToChatMessage(message({
    origin: 'provider_session',
    purpose: 'diagnostic',
    surface: 'debug_panel',
    contentPromptEligibility: 'exclude',
    content: 'diagnostic',
  })), undefined)
})

test('timeline projection coverage matches every MovScript timeline origin purpose and surface', () => {
  const protocol = readFileSync(resolve('../../packages/core/src/agent/protocol.ts'), 'utf8')
  const origins = Object.keys(PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE).sort() as Array<keyof typeof PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE>
  const purposes = Object.keys(PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE).sort() as Array<keyof typeof PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE>
  const surfaces = Object.keys(PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE).sort() as Array<keyof typeof PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE>

  assert.deepEqual(origins, protocolStringUnion(protocol, 'AgentTimelineOrigin'))
  assert.deepEqual(purposes, protocolStringUnion(protocol, 'AgentTimelinePurpose'))
  assert.deepEqual(surfaces, protocolStringUnion(protocol, 'AgentTimelineSurface'))
  assert.deepEqual(origins.map((origin) => isTranscriptTimelineItem(message({ origin }))), origins.map((origin) => PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE[origin].transcriptEligible))
  assert.deepEqual(origins.map((origin) => timelineItemToChatMessage(message({ origin }))?.role ?? null), origins.map((origin) => PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE[origin].transcriptRole))
  assert.deepEqual(purposes.map((purpose) => isTranscriptTimelineItem(message({ origin: 'user', purpose }))), purposes.map((purpose) => PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE[purpose].messageStreamEligible))
  assert.deepEqual(surfaces.map((surface) => isTranscriptTimelineItem(message({ origin: 'user', surface }))), surfaces.map((surface) => PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE[surface].messageStreamEligible))
})

test('timeline status coverage matches user input delivery projection', () => {
  const protocol = readFileSync(resolve('../../packages/core/src/agent/protocol.ts'), 'utf8')
  const statuses = Object.keys(PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE).sort() as Array<keyof typeof PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE>
  const messages = statuses.map((status) => timelineItemToChatMessage(message({
    origin: 'user',
    status,
    providerSessionRefs: {
      threadId: 'thread_1',
      messageId: `message_${status}`,
      runId: `run_${status}`,
    },
  })))

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'AgentTimelineStatus'))
  assert.deepEqual(messages.map((item) => item?.meta?.providerSessionInput?.deliveryStatus), statuses.map((status) => PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE[status].userInputDeliveryStatus))
  assert.deepEqual(messages.map((item) => Object.prototype.hasOwnProperty.call(item?.meta ?? {}, 'status')), statuses.map(() => false))
})

test('localTimelineItemMatchesScope keeps optimistic events in the active item scope', () => {
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1' },
  ), false)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_1' }),
    { sessionId: 'session_1' },
  ), true)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_old' }),
    { sessionId: 'session_new' },
  ), false)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1', threadId: 'thread_1' },
  ), true)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_old', sessionId: 'session_1' }),
    { sessionId: 'session_1', threadId: 'thread_new' },
  ), false)
})

function state(patch: Partial<TimelineViewState> = {}): TimelineViewState {
  return {
    items: [],
    hasMoreBefore: false,
    snapshotRevision: 0,
    lastRevision: 0,
    needsReset: false,
    postResetItemIds: [],
    scopeKey: '',
    loaded: false,
    loading: false,
    ...patch,
  }
}

function message(patch: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
  const id = patch.id ?? 'message_1'
  const createdAt = patch.createdAt ?? '2026-05-19T00:00:01.000Z'
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 50,
    content: '',
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    cursor: `1:${encodeURIComponent(id)}`,
    providerSessionRefs: { threadId: 'thread_1' },
    ...patch,
  }
}

function protocolStringUnion(protocol: string, typeName: string): string[] {
  const unionType = protocol.match(new RegExp(`export type ${typeName} =([\\s\\S]*?)\\nexport `))
  assert.ok(unionType)
  return Array.from(unionType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
}

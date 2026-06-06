import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentChatThreadViewState } from '@/features/agent/presentation/agentChatThreadViewState'
import type { AgentConversationProjection, AgentConversationProjectionItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

test('buildAgentChatThreadViewState starts conversations from transcript or projection content', () => {
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [] }),
    hasTranscriptMessages: true,
    timelineItems: [],
    timelineLoading: false,
  }).conversationStarted, true)
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [messageProjectionItem()] }),
    hasTranscriptMessages: false,
    timelineItems: [],
    timelineLoading: false,
  }).conversationStarted, true)
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [] }),
    hasTranscriptMessages: false,
    timelineItems: [],
    timelineLoading: false,
  }).conversationStarted, false)
})

test('buildAgentChatThreadViewState only shows timeline loading before transcript content exists', () => {
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [] }),
    hasTranscriptMessages: false,
    timelineItems: [],
    timelineLoading: true,
  }).showTimelineLoading, true)
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [] }),
    hasTranscriptMessages: true,
    timelineItems: [],
    timelineLoading: true,
  }).showTimelineLoading, false)
  assert.equal(buildAgentChatThreadViewState({
    activeRun: run(),
    conversationProjection: projection({ items: [] }),
    hasTranscriptMessages: false,
    timelineItems: [],
    timelineLoading: true,
  }).showTimelineLoading, false)
  assert.equal(buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection({ items: [messageProjectionItem()] }),
    hasTranscriptMessages: false,
    timelineItems: [],
    timelineLoading: true,
  }).showTimelineLoading, false)
})

test('buildAgentChatThreadViewState resolves current plan from timeline items', () => {
  const state = buildAgentChatThreadViewState({
    activeRun: null,
    conversationProjection: projection(),
    hasTranscriptMessages: false,
    timelineItems: [planTimelineItem('plan_item_1')],
    timelineLoading: false,
  })

  assert.equal(state.currentPlan?.id, 'plan_1')
})

function projection(overrides: Partial<AgentConversationProjection> = {}): AgentConversationProjection {
  return {
    items: [],
    ...overrides,
  }
}

function messageProjectionItem(): AgentConversationProjectionItem {
  return {
    id: 'message_1',
    type: 'message',
    item: {
      message: {
        id: 'message_1',
        role: 'assistant',
        content: 'Message',
        timestamp: 1,
      },
      activity: {
        embeddedInteractionRun: null,
        embeddedInteractionEvents: [],
      },
    },
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    providerSessionLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: true,
    },
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:01.000Z',
    steps: [],
    ...overrides,
  }
}

function planTimelineItem(id: string): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'provider_session',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    sortRank: 10,
    content: '',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    revision: 1,
    cursor: id,
    providerSessionRefs: { threadId: 'thread_1' },
    meta: {
      planRevision: {
        snapshot: {
          id: 'plan_1',
          title: 'Plan',
          status: 'draft',
          tasks: [],
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
        },
      },
    },
  } as unknown as AgentTimelineItem
}

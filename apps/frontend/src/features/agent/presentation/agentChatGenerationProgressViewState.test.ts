import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentChatGenerationProgressViewState } from '@/features/agent/presentation/agentChatGenerationProgressViewState'
import type { AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('buildAgentChatGenerationProgressViewState exposes current generation progress', () => {
  const state = buildAgentChatGenerationProgressViewState({
    activeRun: null,
    messages: [message({
      meta: {
        generationJobs: [{
          jobId: 42,
          status: 'queued',
          stage: 'queued',
          progress: 5,
          terminal: false,
        }],
      },
    })],
    timelineItems: [],
    visibleActivityEvents: [generationEvent({
      generation: {
        jobId: 42,
        outputResourceId: 420,
        status: 'completed',
        stage: 'completed',
        progress: 100,
        terminal: true,
      },
    })],
  })

  assert.equal(state.generationProgressStates.length, 1)
  assert.equal(state.generationProgressState?.jobId, 42)
  assert.equal(state.generationProgressState?.status, 'completed')
})

test('buildAgentChatGenerationProgressViewState returns empty progress state when no evidence exists', () => {
  const state = buildAgentChatGenerationProgressViewState({
    activeRun: null,
    messages: [],
    timelineItems: [],
    visibleActivityEvents: [],
  })

  assert.deepEqual(state.generationProgressStates, [])
  assert.equal(state.generationProgressState, null)
})

test('buildAgentChatGenerationProgressViewState restores completed timeline activity progress', () => {
  const state = buildAgentChatGenerationProgressViewState({
    activeRun: null,
    messages: [],
    timelineItems: [timelineItemWithGenerationActivity()],
    visibleActivityEvents: [],
  })

  assert.equal(state.generationProgressStates.length, 1)
  assert.equal(state.generationProgressState?.outputResourceId, 420)
})

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...overrides,
  }
}

function generationEvent(patch: NonNullable<ChatRunActivityEvent['data']>): ChatRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'tool_call',
    title: 'Generation completed',
    status: 'completed',
    createdAt: '2026-05-22T01:00:01.000Z',
    completedAt: '2026-05-22T01:00:02.000Z',
    data: patch,
  }
}

function timelineItemWithGenerationActivity(): AgentTimelineItem {
  return {
    id: 'message_2',
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 30,
    content: '生成完成',
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:02.000Z',
    revision: 1,
    cursor: 'message_2',
    providerSessionRefs: { threadId: 'thread_1' },
    activity: {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:02.000Z',
      steps: [],
      events: [generationEvent({
        generation: {
          jobId: 42,
          status: 'completed',
          stage: 'completed',
          progress: 100,
          terminal: true,
          outputResourceId: 420,
        },
      })],
    },
  }
}

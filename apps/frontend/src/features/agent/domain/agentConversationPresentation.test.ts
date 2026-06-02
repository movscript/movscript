import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationPresentation } from '@/features/agent/domain/agentConversationPresentation'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

const baseRun: AgentRun = {
  id: 'run_1',
  threadId: 'thread_1',
  status: 'in_progress',
  runtimeLimits: { approvalMode: 'interactive',
    maxToolCalls: 8,
    maxIterations: 4,
    allowNetwork: false,
    allowFileBytes: true,
  },
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:01.000Z',
  steps: [],
}

const generationState: GenerationProgressState = {
  jobId: 42,
  status: 'processing',
  stage: 'rendering',
  progress: 40,
  terminal: false,
}

test('buildAgentConversationPresentation keeps streaming content while preserving dynamic cards', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantMessageId: 'message_1',
    streamingAssistantText: '正在回答',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'in_progress',
      createdAt: '2026-05-17T00:00:01.000Z',
    }],
    generationProgressState: generationState,
    generationProgressStates: [generationState],
  })

  assert.equal(presentation.hasStreamingAssistantContent, true)
  assert.deepEqual(presentation.blocks.map((block) => block.type), ['assistant_stream', 'live_run_activity'])
  assert.equal(presentation.liveBlock?.type, 'live_run_activity')
})

test('buildAgentConversationPresentation keeps generation progress out of the message timeline', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'in_progress',
      createdAt: '2026-05-17T00:00:01.000Z',
    }],
    generationProgressState: generationState,
    generationProgressStates: [generationState],
  })

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['live_run_activity'])
  assert.equal(presentation.liveBlock?.type, 'live_run_activity')
})

test('buildAgentConversationPresentation keeps generation-only status pinned outside conversation blocks', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [],
    generationProgressState: generationState,
    generationProgressStates: [
      generationState,
      { ...generationState, jobId: 43, status: 'queued', stage: 'queued', progress: 5 },
    ],
  })

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationPresentation keeps paused request activity in the thought chain', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'requires_action' },
    visibleActivityEvents: [],
    generationProgressState: null,
  })

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationPresentation keeps run activity visible while a run is active', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'in_progress' },
    visibleActivityEvents: [],
    generationProgressState: null,
  })

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationPresentation falls back to thinking when busy without run details', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: true,
    activeRun: null,
    visibleActivityEvents: [],
    generationProgressState: null,
  })

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['thinking'])
})

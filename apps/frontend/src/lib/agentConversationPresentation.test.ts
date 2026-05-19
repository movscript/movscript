import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationPresentation } from './agentConversationPresentation'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { AgentRun } from '@/lib/localAgentClient'

const baseRun: AgentRun = {
  id: 'run_1',
  threadId: 'thread_1',
  status: 'in_progress',
  policy: {
    approvalMode: 'interactive',
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
  assert.deepEqual(presentation.blocks.map((block) => block.type), ['assistant_stream', 'generation_progress', 'live_run_activity'])
  assert.equal(presentation.liveBlock?.type, 'generation_progress')
})

test('buildAgentConversationPresentation keeps generation progress and run activity visible together', () => {
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

  assert.deepEqual(presentation.blocks.map((block) => block.type), ['generation_progress', 'live_run_activity'])
  assert.equal(presentation.liveBlock?.type, 'generation_progress')
})

test('buildAgentConversationPresentation renders one dynamic generation card per job', () => {
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

  const generationBlocks = presentation.blocks.filter((block) => block.type === 'generation_progress')
  assert.equal(generationBlocks.length, 2)
  assert.deepEqual(generationBlocks.map((block) => block.id), [
    'generation-progress-job-42',
    'generation-progress-job-43',
  ])
})

test('buildAgentConversationPresentation keeps run activity visible for non terminal runs', () => {
  const presentation = buildAgentConversationPresentation({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'requires_action' },
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

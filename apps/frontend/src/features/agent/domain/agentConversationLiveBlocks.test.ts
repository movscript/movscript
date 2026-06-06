import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentConversationLiveBlocks } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

const baseRun: AgentRun = {
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
}

test('buildAgentConversationLiveBlocks keeps streaming content while preserving dynamic cards', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantMessageId: 'message_1',
    streamingAssistantText: '正在回答',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'started',
      createdAt: '2026-05-17T00:00:01.000Z',
    }],
  })

  assert.equal(liveBlocks.hasStreamingAssistantContent, true)
  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity', 'assistant_stream'])
  assert.equal(liveBlocks.primaryLiveBlock?.type, 'live_run_activity')
})

test('buildAgentConversationLiveBlocks keeps thinking above streaming text when run details are not available yet', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantMessageId: 'stream-run_1',
    streamingAssistantText: '正在回答',
    loading: true,
    activeRun: null,
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['thinking', 'assistant_stream'])
})

test('buildAgentConversationLiveBlocks keeps generation progress out of the message timeline', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'started',
      createdAt: '2026-05-17T00:00:01.000Z',
    }],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity'])
  assert.equal(liveBlocks.primaryLiveBlock?.type, 'live_run_activity')
})

test('buildAgentConversationLiveBlocks keeps generation-only status pinned outside conversation blocks', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: true,
    activeRun: baseRun,
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationLiveBlocks keeps paused request activity in the thought chain', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'requires_action' },
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationLiveBlocks keeps run activity visible while a run is active', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'in_progress' },
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationLiveBlocks bridges a terminal run until its activity message is visible', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'completed' },
    activeRunHasActivityMessage: false,
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['live_run_activity'])
})

test('buildAgentConversationLiveBlocks hides terminal run activity after its activity message is visible', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: false,
    activeRun: { ...baseRun, status: 'completed' },
    activeRunHasActivityMessage: true,
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), [])
})

test('buildAgentConversationLiveBlocks falls back to thinking when busy without run details', () => {
  const liveBlocks = buildAgentConversationLiveBlocks({
    streamingAssistantText: '',
    loading: true,
    activeRun: null,
    visibleActivityEvents: [],
  })

  assert.deepEqual(liveBlocks.blocks.map((block) => block.type), ['thinking'])
})

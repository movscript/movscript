import assert from 'node:assert/strict'
import test from 'node:test'

import { generationProgressStatesForPinnedStatus } from '@/features/agent/domain/agentPinnedStatus'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('generationProgressStatesForPinnedStatus restores completed generation jobs from historical messages', () => {
  const states = generationProgressStatesForPinnedStatus({
    messages: [{
      id: 'message_1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      meta: {
        generationJobs: [{
          jobId: 42,
          status: 'completed',
          stage: 'completed',
          progress: 100,
          terminal: true,
          modelIdentifier: 'gpt-image-2',
        }],
      },
    }],
    run: null,
    visibleActivityEvents: [],
  })

  assert.equal(states.length, 1)
  assert.equal(states[0]?.jobId, 42)
  assert.equal(states[0]?.terminal, true)
  assert.equal(states[0]?.modelIdentifier, 'gpt-image-2')
})

test('generationProgressStatesForPinnedStatus lets live traces update historical pinned jobs', () => {
  const states = generationProgressStatesForPinnedStatus({
    messages: [historicalMessage()],
    run: null,
    visibleActivityEvents: [{
      id: 'event_1',
      kind: 'tool_call',
      title: 'Generation completed',
      status: 'completed',
      createdAt: '2026-05-22T01:00:01.000Z',
      data: {
        generation: {
          jobId: 42,
          status: 'completed',
          stage: 'completed',
          progress: 100,
          terminal: true,
          modelIdentifier: 'gpt-image-2',
        },
      },
    }],
  })

  assert.equal(states.length, 1)
  assert.equal(states[0]?.status, 'completed')
  assert.equal(states[0]?.terminal, true)
  assert.equal(states[0]?.progress, 100)
})

test('generationProgressStatesForPinnedStatus accepts background work completion events from non-active runs', () => {
  const states = generationProgressStatesForPinnedStatus({
    messages: [historicalMessage()],
    run: run({
      id: 'run_active',
      status: 'in_progress',
      traceEvents: [],
      updatedAt: '2026-05-22T01:00:01.000Z',
    }),
    visibleActivityEvents: [{
      id: 'trace_background_completed',
      runId: 'run_background',
      kind: 'tool_call',
      title: 'Provider work observed: generation_job',
      status: 'completed',
      toolName: 'core_work_wait',
      createdAt: '2026-05-22T01:00:02.000Z',
      completedAt: '2026-05-22T01:00:02.000Z',
      data: {
        providerWork: { id: 'work_1', kind: 'generation_job', status: 'completed' },
        generation: {
          jobId: 42,
          status: 'finished',
          stage: 'completed',
          progress: 100,
          terminal: true,
          outputResourceId: 420,
        },
      },
    }],
  })

  assert.equal(states.length, 1)
  assert.equal(states[0]?.jobId, 42)
  assert.equal(states[0]?.status, 'finished')
  assert.equal(states[0]?.terminal, true)
  assert.equal(states[0]?.outputResourceId, 420)
})

test('generationProgressStatesForPinnedStatus lets later historical activity update older pinned jobs', () => {
  const states = generationProgressStatesForPinnedStatus({
    messages: [
      historicalMessage(),
      {
        id: 'message_2',
        role: 'assistant',
        content: '生成完成',
        timestamp: 2,
      },
    ],
    timelineItems: [timelineItemWithGenerationActivity()],
    run: null,
    visibleActivityEvents: [],
  })

  assert.equal(states.length, 1)
  assert.equal(states[0]?.jobId, 42)
  assert.equal(states[0]?.status, 'completed')
  assert.equal(states[0]?.terminal, true)
  assert.equal(states[0]?.outputResourceId, 420)
})

function historicalMessage(): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    meta: {
      generationJobs: [{
        jobId: 42,
        status: 'queued',
        stage: 'queued',
        progress: 5,
        terminal: false,
      }],
    },
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
      events: [{
        id: 'event_2',
        kind: 'tool_call',
        title: 'Generation completed',
        status: 'completed',
        createdAt: '2026-05-22T01:00:01.000Z',
        completedAt: '2026-05-22T01:00:02.000Z',
        data: {
          generation: {
            jobId: 42,
            status: 'completed',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 420,
          },
        },
      }],
    },
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    providerSessionLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:00.000Z',
    ...overrides,
  }
}

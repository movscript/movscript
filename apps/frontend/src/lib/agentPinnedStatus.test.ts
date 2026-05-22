import assert from 'node:assert/strict'
import test from 'node:test'

import { generationProgressStatesForPinnedStatus } from '@/lib/agentPinnedStatus'
import type { ChatMessage } from '@/store/agentStore'

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

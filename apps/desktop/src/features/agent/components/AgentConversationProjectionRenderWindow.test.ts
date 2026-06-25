import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentConversationProjectionRenderWindow } from '@/features/agent/components/AgentConversationProjectionRenderWindow'
import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildAgentConversationProjectionRenderWindow keeps the active run turn visible', () => {
  const projection = buildAgentConversationProjection({
    activeRun: run({ id: 'run_active', status: 'in_progress' }),
    liveBlocks: [liveRunActivityBlock('run_active')],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [
      message({ id: 'older', role: 'user', timestamp: 1 }),
      message({
        id: 'active-trigger',
        role: 'user',
        timestamp: 2,
        meta: {
          providerSessionMessage: { threadId: 'thread_1', messageId: 'active-trigger', runId: 'run_active' },
          providerSessionInput: { threadId: 'thread_1', messageId: 'active-trigger', runId: 'run_active', deliveryStatus: 'accepted' },
        },
      }),
      message({ id: 'newer', role: 'assistant', timestamp: 3 }),
    ],
  })

  const window = buildAgentConversationProjectionRenderWindow({
    projection,
    visibleCount: 1,
  })

  assert.equal(window.visibleItems[0]?.type, 'run_turn')
  assert.equal(window.visibleItems[0]?.type === 'run_turn' ? window.visibleItems[0].runId : undefined, 'run_active')
})

function projectionRunInteractions() {
  return {
    answerEchoMessageIds: new Set<string>(),
    runsByResultMessageId: new Map<string, AgentRun[]>(),
    standaloneRuns: [],
  }
}

function liveRunActivityBlock(runId: string): AgentConversationLiveBlock {
  return {
    id: 'live-run-activity',
    type: 'live_run_activity',
    run: run({ id: runId, status: 'in_progress' }),
    events: [],
  }
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
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

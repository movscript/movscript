import assert from 'node:assert/strict'
import test from 'node:test'

import { projectionItemsScrollKey } from '@/features/agent/presentation/agentConversationProjectionScrollKey'
import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'

test('projectionItemsScrollKey changes when visible projection content changes', () => {
  const base = buildAgentConversationProjection({
    activeRun: run({ id: 'run_stream', status: 'in_progress' }),
    liveBlocks: [assistantStreamBlock('正在回答')],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [],
  })
  const updatedStream = buildAgentConversationProjection({
    activeRun: run({ id: 'run_stream', status: 'in_progress' }),
    liveBlocks: [assistantStreamBlock('正在回答更多内容')],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [],
  })
  const updatedInteraction = buildAgentConversationProjection({
    activeRun: run({ id: 'run_action', status: 'requires_action' }),
    liveBlocks: [],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['trigger', [
        run({
          id: 'run_action',
          status: 'requires_action',
          pendingApprovals: [{ ...approval('run_action'), status: 'approved' }],
        }),
      ]]]),
    }),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        timestamp: 1,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_action' } },
      }),
    ],
  })

  assert.notEqual(projectionItemsScrollKey(base.items), '')
  assert.notEqual(projectionItemsScrollKey(base.items), projectionItemsScrollKey(updatedStream.items))
  assert.match(projectionItemsScrollKey(updatedInteraction.items), /approved/)
})

function projectionRunInteractions(overrides: {
  answerEchoMessageIds?: Set<string>
  runsByResultMessageId?: Map<string, AgentRun[]>
  standaloneRuns?: AgentRun[]
} = {}) {
  return {
    answerEchoMessageIds: overrides.answerEchoMessageIds ?? new Set<string>(),
    runsByResultMessageId: overrides.runsByResultMessageId ?? new Map<string, AgentRun[]>(),
    standaloneRuns: overrides.standaloneRuns ?? [],
  }
}

function assistantStreamBlock(content = 'Stream'): AgentConversationLiveBlock {
  return {
    id: 'assistant-stream',
    type: 'assistant_stream',
    content,
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

function approval(runId: string): NonNullable<AgentRun['pendingApprovals']>[number] {
  return {
    id: `approval_${runId}`,
    runId,
    toolName: 'generation_job_create',
    reason: 'Needs confirmation',
    status: 'pending',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
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

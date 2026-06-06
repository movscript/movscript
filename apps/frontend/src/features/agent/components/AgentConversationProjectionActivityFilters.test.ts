import assert from 'node:assert/strict'
import test from 'node:test'

import { hiddenActivityActionItemIdsFromProjectionItems } from '@/features/agent/components/AgentConversationProjectionActivityFilters'
import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('hiddenActivityActionItemIdsFromProjectionItems reads projected interaction action ids', () => {
  const liveRun = run({
    id: 'run_action',
    status: 'requires_action',
    pendingApprovals: [approval('run_action')],
  })
  const projection = buildAgentConversationProjection({
    activeRun: liveRun,
    liveBlocks: [],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['trigger', [liveRun]]]),
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

  assert.deepEqual([...hiddenActivityActionItemIdsFromProjectionItems(projection.items)], ['approval-approval_run_action'])
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

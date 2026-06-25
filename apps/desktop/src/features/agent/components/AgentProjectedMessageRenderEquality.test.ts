import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentProjectedTranscriptMessageItemHasInteractionRuns,
  agentProjectedTranscriptMessageItemsEqual,
} from '@/features/agent/components/AgentProjectedMessageRenderEquality'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatMessage } from '@/features/agent/state/agentStore'

type ProjectedMessageItem = Extract<AgentConversationProjectionContentItem, { type: 'message' }>['item']

test('projected transcript message memo helpers compare projected render fields', () => {
  const run = agentRun()
  const message = chatMessage()
  const first = projectedMessageItem({ message })
  const second = projectedMessageItem({ message })

  assert.equal(agentProjectedTranscriptMessageItemHasInteractionRuns(first), false)
  assert.equal(agentProjectedTranscriptMessageItemsEqual(first, second), true)
  assert.equal(agentProjectedTranscriptMessageItemsEqual(first, {
    ...second,
    activity: {
      ...second.activity,
      embeddedInteractionRun: run,
    },
  }), false)
})

function projectedMessageItem(overrides: Partial<ProjectedMessageItem> = {}): ProjectedMessageItem {
  return {
    message: chatMessage(),
    activity: {
      embeddedInteractionRun: null,
      embeddedInteractionEvents: [],
    },
    ...overrides,
  }
}

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function agentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
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

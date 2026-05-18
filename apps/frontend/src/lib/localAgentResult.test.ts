import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLocalAgentAssistantContent } from './localAgentResult'
import type { AgentMessage, AgentRun, AgentThread } from '@/lib/localAgentClient'

test('formatLocalAgentAssistantContent does not reuse a previous run assistant message', () => {
  const previousAssistant = makeMessage({
    id: 'msg_previous_assistant',
    role: 'assistant',
    content: 'previous run result',
    runId: 'run_previous',
  })
  const currentRun = makeRun({
    id: 'run_current',
    status: 'requires_action',
    pendingApprovals: [
      {
        id: 'approval_1',
        runId: 'run_current',
        toolName: 'movscript_test_tool',
        risk: 'write',
        permission: 'ask',
        reason: '需要确认',
        status: 'pending',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  })

  const content = formatLocalAgentAssistantContent(currentRun, makeThread({ messages: [previousAssistant] }))

  assert.notEqual(content, previousAssistant.content)
  assert.match(content, /movscript_test_tool/)
})

test('formatLocalAgentAssistantContent falls back to current run assistant by run id', () => {
  const currentAssistant = makeMessage({
    id: 'msg_current_assistant',
    role: 'assistant',
    content: 'current run result',
    runId: 'run_current',
  })
  const previousAssistant = makeMessage({
    id: 'msg_previous_assistant',
    role: 'assistant',
    content: 'previous run result',
    runId: 'run_previous',
  })
  const currentRun = makeRun({ id: 'run_current', status: 'completed' })

  assert.equal(
    formatLocalAgentAssistantContent(currentRun, makeThread({ messages: [previousAssistant, currentAssistant] })),
    currentAssistant.content,
  )
})

const NOW = '2026-05-18T00:00:00.000Z'

function makeRun(input: Partial<AgentRun> & { id: string; status: AgentRun['status'] }): AgentRun {
  return {
    ...input,
    id: input.id,
    threadId: 'thread_1',
    status: input.status,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: NOW,
    updatedAt: NOW,
    steps: [],
  }
}

function makeThread(input: { messages: AgentMessage[] }): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    messages: input.messages,
  }
}

function makeMessage(input: Pick<AgentMessage, 'id' | 'role' | 'content'> & { runId?: string }): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    ...(input.runId ? { runId: input.runId } : {}),
    createdAt: NOW,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgentChatRuntimePendingServerRequest,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/agent-chat'
import { replayAgentChatPersistentServerRequests } from '@/features/agent/application/agentChatServerRequestReplay'

test('agent chat server request replay deduplicates requests already in runtime state', () => {
  const current = [
    pendingEntry(serverRequest({ id: 'req-1', threadId: 'thread-1', turnId: 'turn-1' }), 'current-1'),
  ]
  const persistent = [
    pendingEntry(serverRequest({ id: 'req-1', threadId: 'thread-1', turnId: 'turn-1' }), 'persistent-duplicate'),
    pendingEntry(serverRequest({ id: 'req-2', threadId: 'thread-1', turnId: 'turn-1' }), 'persistent-new'),
  ]

  const result = replayAgentChatPersistentServerRequests({ current, persistent })

  assert.equal(result.replayedCount, 1)
  assert.deepEqual(result.pendingServerRequests.map((entry) => entry.request.id), ['req-1', 'req-2'])
})

test('agent chat server request replay is idempotent across repeated shell mounts', () => {
  const persistent = [
    pendingEntry(serverRequest({ id: 'req-1', threadId: 'thread-1', turnId: 'turn-1' }), 'persistent-1'),
    pendingEntry(serverRequest({ id: 'req-2', threadId: 'thread-2', turnId: 'turn-4' }), 'persistent-2'),
  ]

  const firstReplay = replayAgentChatPersistentServerRequests({ current: [], persistent })
  const secondReplay = replayAgentChatPersistentServerRequests({
    current: firstReplay.pendingServerRequests,
    persistent,
  })

  assert.equal(firstReplay.replayedCount, 2)
  assert.equal(secondReplay.replayedCount, 0)
  assert.deepEqual(secondReplay.pendingServerRequests.map((entry) => entry.request.id), ['req-1', 'req-2'])
})

function serverRequest(input: {
  id: string
  threadId?: string
  turnId?: string
  method?: AgentChatServerRequest['method']
}): AgentChatServerRequest {
  return {
    id: input.id,
    method: input.method ?? 'item/permissions/requestApproval',
    params: {},
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
  }
}

function pendingEntry(
  request: AgentChatServerRequest,
  label: string,
): AgentChatRuntimePendingServerRequest {
  return {
    request,
    resolve: (_response: AgentChatServerRequestResponse | undefined) => {
      void label
    },
  }
}

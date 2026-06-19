import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attachAgentConversationRegistryBroadcastBridge,
  publishAgentConversationRegistryEvent,
  subscribeAgentConversationRegistryEvents,
  type AgentConversationRegistryEvent,
} from './agentConversationRegistryEvents'

test('agent conversation registry broadcast bridge forwards local and accepts remote events once', () => {
  const channel = new FakeRegistryBroadcastChannel()
  const events: AgentConversationRegistryEvent[] = []
  const unsubscribe = subscribeAgentConversationRegistryEvents((event) => {
    if (event.id.startsWith('registry-broadcast-test:')) events.push(event)
  })
  const detach = attachAgentConversationRegistryBroadcastBridge({
    createChannel: () => channel,
  })

  publishAgentConversationRegistryEvent({
    id: 'registry-broadcast-test:local',
    kind: 'conversation-upserted',
    conversationId: 'local_conversation',
    providerThreadId: 'local_thread',
  })

  assert.equal(channel.messages.length, 1)
  assert.equal(channel.messages[0]?.event.id, 'registry-broadcast-test:local')

  channel.onmessage?.({
    data: {
      sourceId: 'remote-window',
      event: {
        id: 'registry-broadcast-test:remote',
        kind: 'conversation-upserted',
        conversationId: 'remote_conversation',
        providerThreadId: 'remote_thread',
        sourceId: 'remote-window',
        timestamp: 123,
      },
    },
  } as MessageEvent<unknown>)

  detach()
  unsubscribe()

  assert.deepEqual(events.map((event) => [event.id, event.delivery]), [
    ['registry-broadcast-test:local', 'local'],
    ['registry-broadcast-test:remote', 'cross-window'],
  ])
  assert.equal(channel.messages.length, 1)
  assert.equal(channel.closed, true)
})

class FakeRegistryBroadcastChannel {
  messages: Array<{ sourceId: string; event: AgentConversationRegistryEvent }> = []
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  closed = false

  postMessage(message: unknown): void {
    this.messages.push(message as { sourceId: string; event: AgentConversationRegistryEvent })
  }

  close(): void {
    this.closed = true
  }
}

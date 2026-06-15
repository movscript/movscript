import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const eventBusSource = readSource('apps/frontend/src/shared/application/eventBus.ts')
const agentPanelBridgeSource = readSource('apps/frontend/src/features/agent/application/agentPanelBridge.ts')

test('typed event bus owns replay queue and one-shot delivery primitives', () => {
  assert.match(eventBusSource, /publishReplay<Topic extends keyof EventMap>/)
  assert.match(eventBusSource, /consume<Topic extends keyof EventMap>/)
  assert.match(eventBusSource, /once<Topic extends keyof EventMap>/)
  assert.match(eventBusSource, /const replayQueues = new Map<keyof EventMap/)
  assert.match(eventBusSource, /replayQueue\(topic\)\.push\(payload\)/)
})

test('agent panel bridge uses the typed event bus replay queue instead of module queues', () => {
  assert.match(agentPanelBridgeSource, /const agentPanelEventBus = createEventBus<AgentPanelEventMap>\(\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.publishReplay\(AGENT_PANEL_NEW_CONVERSATION_EVENT, payload\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.publishReplay\(AGENT_PANEL_THREAD_EVENT, normalizedPayload\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.publishReplay\(AGENT_PANEL_DECISION_REQUEST_EVENT, payload\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.consume\(AGENT_PANEL_NEW_CONVERSATION_EVENT\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.consume\(AGENT_PANEL_THREAD_EVENT\)/)
  assert.match(agentPanelBridgeSource, /agentPanelEventBus\.consume\(AGENT_PANEL_DECISION_REQUEST_EVENT\)/)
  assert.doesNotMatch(agentPanelBridgeSource, /pendingNewConversationPayloads/)
  assert.doesNotMatch(agentPanelBridgeSource, /pendingThreadPayloads/)
  assert.doesNotMatch(agentPanelBridgeSource, /pendingDecisionRequestPayloads/)
  assert.doesNotMatch(agentPanelBridgeSource, /window\.dispatchEvent/)
  assert.doesNotMatch(agentPanelBridgeSource, /window\.addEventListener/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

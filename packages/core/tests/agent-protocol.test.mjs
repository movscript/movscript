import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  AGENT_CLIENT_TELEMETRY_SCHEMA,
  AGENT_PROTOCOL_VERSION,
  PROVIDER_SESSION_EVENT_V2_SCHEMA,
  activeRunInputDisplayDeliveryStatus,
  buildPendingActiveRunInputQueueItems,
  createAgentTelemetryLogSample,
  createAgentTelemetryMetricSample,
  activeRunInputIsWaitingForDelivery,
  isAgentRunStoppableStatus,
  isAgentRunStreamSettledStatus,
  isAgentRunTerminalStatus,
  isAgentTelemetryReportableMetricName,
  providerSessionInputRef,
  providerSessionMessageRef,
  sanitizeAgentTelemetryLabels,
} from '../dist/agent/protocol.js'

test('core agent protocol exports provider-session schemas and pure status helpers', () => {
  assert.equal(AGENT_PROTOCOL_VERSION, 'movscript.agent.protocol.v1')
  assert.equal(PROVIDER_SESSION_EVENT_V2_SCHEMA, 'movscript.agent.provider-session-event.v2')
  assert.equal(AGENT_CLIENT_TELEMETRY_SCHEMA, 'movscript.agent.client-telemetry.v1')

  assert.equal(isAgentRunTerminalStatus('completed'), true)
  assert.equal(isAgentRunTerminalStatus('requires_action'), false)
  assert.equal(isAgentRunStreamSettledStatus('requires_action'), true)
  assert.equal(isAgentRunStreamSettledStatus('in_progress'), false)
  assert.equal(isAgentRunStoppableStatus('queued'), true)
  assert.equal(isAgentRunStoppableStatus('in_progress'), true)
  assert.equal(isAgentRunStoppableStatus('requires_action'), true)
  assert.equal(isAgentRunStoppableStatus('completed'), false)
})

test('core agent protocol resolves provider-session message and input refs from current and legacy metadata', () => {
  assert.deepEqual(providerSessionMessageRef({
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' },
      runtimeMessage: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' })

  assert.deepEqual(providerSessionMessageRef({
    meta: {
      runtimeMessage: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' },
    },
  }), { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' })

  assert.deepEqual(providerSessionInputRef({
    meta: {
      providerSessionInput: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' },
      runtimeInput: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy', deliveryStatus: 'delivered' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' })

  assert.equal(providerSessionInputRef({ meta: {} }), undefined)
})

test('core agent protocol builds pending active-run input queue items', () => {
  const messages = [
    agentMessage({
      id: 'pending',
      content: 'Add this once the run accepts it',
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
  ]

  assert.deepEqual(buildPendingActiveRunInputQueueItems(messages).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'pending',
    runId: 'run_1',
    content: 'Add this once the run accepts it',
  }])
  assert.equal(activeRunInputIsWaitingForDelivery(messages[0]), true)
})

test('core agent protocol treats pending active-run inputs with message ids as accepted', () => {
  const message = agentMessage({
    id: 'supplement',
    content: 'Use this extra constraint',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1' },
      runtimeInput: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1', deliveryStatus: 'pending' },
    },
  })

  assert.equal(activeRunInputDisplayDeliveryStatus(message), 'accepted')
  assert.equal(activeRunInputIsWaitingForDelivery(message), false)
  assert.deepEqual(buildPendingActiveRunInputQueueItems([message]), [])
})

test('core agent protocol keeps new trigger messages pending until provider session accepts them', () => {
  const message = agentMessage({
    id: 'local_trigger',
    content: 'Start work',
    meta: {
      runtimeInput: { deliveryStatus: 'pending' },
    },
  })

  assert.deepEqual(buildPendingActiveRunInputQueueItems([message]).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'local_trigger',
    runId: undefined,
    content: 'Start work',
  }])
})

test('core agent protocol sanitizes telemetry metric and log payloads', () => {
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_timeline_page_duration_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('unknown_metric'), false)
  assert.deepEqual(sanitizeAgentTelemetryLabels({
    area: ' agent ',
    status: 200,
    ignored: 'nope',
  }), {
    area: 'agent',
    status: '200',
  })
  assert.deepEqual(createAgentTelemetryMetricSample({
    name: 'frontend_agent_timeline_page_duration_ms',
    unit: 'ms',
    value: -1,
    labels: { area: 'timeline' },
  }), {
    name: 'frontend_agent_timeline_page_duration_ms',
    unit: 'ms',
    value: 0,
    labels: { area: 'timeline' },
  })
  assert.deepEqual(createAgentTelemetryLogSample({
    level: 'warning',
    area: '',
    kind: undefined,
  }), {
    level: 'warning',
    area: 'agent_frontend',
    kind: 'unknown',
  })
})

function agentMessage(patch = {}) {
  return {
    id: 'message_1',
    role: 'user',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

test('core package metadata publishes agent protocol as a first-class subpath', () => {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  assert.deepEqual(packageJson.exports?.['./agent/protocol'], {
    types: './dist/agent/protocol.d.ts',
    import: './dist/agent/protocol.js',
    require: './dist/agent/protocol.cjs',
  })
})

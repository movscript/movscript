import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  AGENT_CLIENT_TELEMETRY_SCHEMA,
  AGENT_PROTOCOL_VERSION,
  PROVIDER_SESSION_EVENT_V2_SCHEMA,
  activeRunInputDisplayDeliveryStatus,
  activeRunInputIsWaitingForDelivery,
  buildPendingActiveRunInputQueueItems,
  createAgentTelemetryMetricSample,
  isAgentRunStoppableStatus,
  isAgentRunStreamSettledStatus,
  isAgentRunTerminalStatus,
  providerSessionInputRef,
  providerSessionMessageRef,
} from '../dist/index.js'

test('agent protocol exports provider-session schemas and pure status helpers', () => {
  assert.equal(AGENT_PROTOCOL_VERSION, 'movscript.agent.protocol.v1')
  assert.equal(PROVIDER_SESSION_EVENT_V2_SCHEMA, 'movscript.agent.provider-session-event.v2')
  assert.equal(AGENT_CLIENT_TELEMETRY_SCHEMA, 'movscript.agent.client-telemetry.v1')

  assert.equal(isAgentRunTerminalStatus('completed'), true)
  assert.equal(isAgentRunTerminalStatus('requires_action'), false)
  assert.equal(isAgentRunStreamSettledStatus('requires_action'), true)
  assert.equal(isAgentRunStreamSettledStatus('in_progress'), false)
  assert.equal(isAgentRunStoppableStatus('queued'), true)
  assert.equal(isAgentRunStoppableStatus('completed'), false)
})

test('agent protocol resolves provider-session message and input refs', () => {
  assert.deepEqual(providerSessionMessageRef({
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' },
      runtimeMessage: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' })

  assert.deepEqual(providerSessionInputRef({
    meta: {
      providerSessionInput: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' })
})

test('agent protocol builds pending active-run input queue items', () => {
  const pending = agentMessage({
    id: 'pending',
    content: 'Add this once accepted',
    meta: {
      runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
    },
  })
  const accepted = agentMessage({
    id: 'accepted',
    content: 'Already accepted',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' },
      runtimeInput: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'pending' },
    },
  })

  assert.equal(activeRunInputDisplayDeliveryStatus(accepted), 'accepted')
  assert.equal(activeRunInputIsWaitingForDelivery(pending), true)
  assert.equal(activeRunInputIsWaitingForDelivery(accepted), false)
  assert.deepEqual(buildPendingActiveRunInputQueueItems([pending, accepted]).map(item => item.id), ['pending'])
})

test('agent protocol sanitizes telemetry metric samples', () => {
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
})

test('agent protocol package stays independent from app and runtime hosts', () => {
  const sources = listSourceFiles(resolve('src'))
  assert.ok(sources.length > 10)
  for (const file of sources) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /from ['"]node:|from ['"]electron['"]|from ['"]react['"]|from ['"]@movscript\/core/)
    assert.doesNotMatch(source, /ipcMain|BrowserWindow|createServer|window\.|document\./)
  }
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

function listSourceFiles(dir) {
  const entries = readdirSync(dir)
  return entries.flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return listSourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

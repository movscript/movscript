import assert from 'node:assert/strict'
import test from 'node:test'
import {
  closeAgentRuntimeEventStream,
  pumpAgentRuntimeStream,
  registerAgentRuntimeEventStreamController,
} from './streamPump'
import type { ElectronAgentRuntimeStreamMessage } from '../../../src/shared/contracts/electronApi'
import type { AgentRuntimeControlEventStream } from '../../services/agentRuntime/control-transport'

test('pumpAgentRuntimeStream ends renderer-closed streams without surfacing an error', async () => {
  const streamId = 'stream_renderer_closed'
  const messages: ElectronAgentRuntimeStreamMessage[] = []
  registerAgentRuntimeEventStreamController(streamId, new AbortController())
  const stream = eventStream(async function* () {
    yield 'first'
    closeAgentRuntimeEventStream({ streamId })
    throw new Error('aborted')
  })

  await pumpAgentRuntimeStream(streamId, stream, (message) => messages.push(message))

  assert.deepEqual(messages, [
    { streamId, kind: 'message', data: 'first' },
    { streamId, kind: 'end' },
  ])
})

test('pumpAgentRuntimeStream still reports non-abort stream failures', async () => {
  const streamId = 'stream_failed'
  const messages: ElectronAgentRuntimeStreamMessage[] = []
  const stream = eventStream(async function* () {
    yield 'first'
    throw new Error('runtime disconnected')
  })

  await pumpAgentRuntimeStream(streamId, stream, (message) => messages.push(message))

  assert.deepEqual(messages, [
    { streamId, kind: 'message', data: 'first' },
    { streamId, kind: 'error', error: 'runtime disconnected' },
  ])
})

function eventStream(messages: () => AsyncIterable<string>): AgentRuntimeControlEventStream {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    responseText: async () => '',
    messages,
  }
}

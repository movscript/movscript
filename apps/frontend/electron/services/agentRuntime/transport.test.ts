import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentRuntimeControlTransportInput } from './transport'

test('agent runtime control transport defaults to HTTP base URL', () => {
  const { baseURL, transport } = resolveAgentRuntimeControlTransportInput({
    baseURL: 'http://127.0.0.1:28765/',
    env: {},
  })

  assert.equal(baseURL, 'http://127.0.0.1:28765')
  assert.equal(transport.kind, 'http')
  assert.equal(transport.endpointLabel, 'http://127.0.0.1:28765')
  assert.equal(transport.port, 28765)
})

test('agent runtime control transport can be selected from input as Unix socket', () => {
  const { baseURL, transport } = resolveAgentRuntimeControlTransportInput({
    baseURL: 'http://127.0.0.1:28765',
    transportKind: 'unix-socket',
    socketPath: '/tmp/movscript-agent.sock',
    env: {},
  })

  assert.equal(baseURL, 'http://127.0.0.1:28765')
  assert.equal(transport.kind, 'unix-socket')
  assert.equal(transport.endpointLabel, 'unix:/tmp/movscript-agent.sock')
  assert.equal(transport.socketPath, '/tmp/movscript-agent.sock')
})

test('agent runtime control transport can be selected from environment as Unix socket', () => {
  const { transport } = resolveAgentRuntimeControlTransportInput({
    env: {
      MOVSCRIPT_AGENT_TRANSPORT: 'unix-socket',
      MOVSCRIPT_AGENT_SOCKET_PATH: '/tmp/movscript-agent-env.sock',
    },
  })

  assert.equal(transport.kind, 'unix-socket')
  assert.equal(transport.socketPath, '/tmp/movscript-agent-env.sock')
})

test('agent runtime control transport requires a socket path for Unix socket mode', () => {
  assert.throws(
    () => resolveAgentRuntimeControlTransportInput({
      transportKind: 'unix-socket',
      env: {},
    }),
    /MOVSCRIPT_AGENT_SOCKET_PATH is required/,
  )
})

test('agent runtime control transport reports reserved transports explicitly', () => {
  assert.throws(
    () => resolveAgentRuntimeControlTransportInput({
      transportKind: 'websocket',
      env: {},
    }),
    /websocket is reserved but not implemented/,
  )
  assert.throws(
    () => resolveAgentRuntimeControlTransportInput({
      transportKind: 'named-pipe',
      env: {},
    }),
    /named-pipe is reserved but not implemented/,
  )
})

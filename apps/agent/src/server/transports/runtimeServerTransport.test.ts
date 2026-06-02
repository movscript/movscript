import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareUnixSocketPath, resolveAgentRuntimeServerTransport } from './runtimeServerTransport.js'

test('agent runtime server transport defaults to loopback HTTP', () => {
  const env = captureTransportEnv()
  clearTransportEnv()
  try {
    const { transport, endpoint } = resolveAgentRuntimeServerTransport(28765)

    assert.equal(transport.kind, 'http')
    assert.deepEqual(endpoint, {
      kind: 'http',
      host: '127.0.0.1',
      port: 28765,
      label: '127.0.0.1:28765',
    })
  } finally {
    restoreTransportEnv(env)
  }
})

test('agent runtime server transport can be selected as Unix socket', () => {
  const env = captureTransportEnv()
  process.env.MOVSCRIPT_AGENT_TRANSPORT = 'unix-socket'
  process.env.MOVSCRIPT_AGENT_SOCKET_PATH = '/tmp/movscript-agent.sock'
  try {
    const { transport, endpoint } = resolveAgentRuntimeServerTransport(28765)

    assert.equal(transport.kind, 'unix-socket')
    assert.deepEqual(endpoint, {
      kind: 'unix-socket',
      path: '/tmp/movscript-agent.sock',
      label: 'unix:/tmp/movscript-agent.sock',
    })
  } finally {
    restoreTransportEnv(env)
  }
})

test('agent runtime server transport reports reserved transports explicitly', () => {
  const env = captureTransportEnv()
  try {
    process.env.MOVSCRIPT_AGENT_TRANSPORT = 'websocket'
    assert.throws(
      () => resolveAgentRuntimeServerTransport(28765),
      /websocket is reserved but not implemented/,
    )

    process.env.MOVSCRIPT_AGENT_TRANSPORT = 'named-pipe'
    assert.throws(
      () => resolveAgentRuntimeServerTransport(28765),
      /named-pipe is reserved but not implemented/,
    )
  } finally {
    restoreTransportEnv(env)
  }
})

test('Unix socket path preparation creates parent directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-server-transport-'))
  const socketPath = join(dir, 'nested', 'agent.sock')
  try {
    prepareUnixSocketPath(socketPath)

    assert.equal(existsSync(join(dir, 'nested')), true)
    assert.equal(existsSync(socketPath), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Unix socket path preparation refuses to replace regular files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-server-transport-'))
  const socketPath = join(dir, 'agent.sock')
  writeFileSync(socketPath, 'not a socket')
  try {
    assert.throws(
      () => prepareUnixSocketPath(socketPath),
      /Refusing to replace non-socket agent runtime path/,
    )
    assert.equal(existsSync(socketPath), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function captureTransportEnv(): Record<string, string | undefined> {
  return {
    MOVSCRIPT_AGENT_TRANSPORT: process.env.MOVSCRIPT_AGENT_TRANSPORT,
    MOVSCRIPT_AGENT_SOCKET_PATH: process.env.MOVSCRIPT_AGENT_SOCKET_PATH,
  }
}

function clearTransportEnv(): void {
  delete process.env.MOVSCRIPT_AGENT_TRANSPORT
  delete process.env.MOVSCRIPT_AGENT_SOCKET_PATH
}

function restoreTransportEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

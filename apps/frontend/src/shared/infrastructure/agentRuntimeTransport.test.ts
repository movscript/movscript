import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentRuntimeTransport, ElectronAgentRuntimeTransport } from './agentRuntimeTransport'
import type { ElectronAPI, ElectronAgentRuntimeStreamMessage } from '@/shared/contracts/electronApi'

test('Electron agent runtime transport proxies request through window api', async () => {
  const calls: unknown[] = []
  await withWindowAPI({
    agentRuntimeRequest: async (input) => {
      calls.push(input)
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }
    },
    agentRuntimeOpenEventStream: async () => {
      throw new Error('unexpected stream')
    },
    agentRuntimeCloseEventStream: async () => undefined,
    onAgentRuntimeStreamMessage: () => () => undefined,
  }, async () => {
    const transport = new ElectronAgentRuntimeTransport({
      transportKind: 'unix-socket',
      socketPath: '/tmp/movscript-agent.sock',
    })

    const response = await transport.request('/runtime/compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"ping":true}',
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.deepEqual(calls, [{
      transportKind: 'unix-socket',
      socketPath: '/tmp/movscript-agent.sock',
      path: '/runtime/compat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"ping":true}',
    }])
  })
})

test('agent runtime transport factory creates Electron IPC transport without direct HTTP fallback', async () => {
  const transport = createAgentRuntimeTransport({ sessionId: 'session_1' })
  assert.equal(transport instanceof ElectronAgentRuntimeTransport, true)
  assert.equal(transport.kind, 'electron')
  assert.equal(transport.endpointLabel, 'electron:agent-runtime')
  await assert.rejects(
    () => transport.request('/runtime/compat'),
    /Electron agent runtime transport is not available/,
  )
})

test('agent runtime transport factory defaults to Electron IPC inside desktop windows', async () => {
  await withWindowAPI({
    ensureAgentRuntime: async () => ({ ok: true, running: true, managed: true, started: false, baseURL: 'electron:agent-runtime', endpoint: 'electron:agent-runtime' }),
    agentRuntimeRequest: async () => {
      throw new Error('unexpected request')
    },
    agentRuntimeOpenEventStream: async () => {
      throw new Error('unexpected stream')
    },
    agentRuntimeCloseEventStream: async () => undefined,
    onAgentRuntimeStreamMessage: () => () => undefined,
  }, async () => {
    const transport = createAgentRuntimeTransport({
      sessionId: 'session_1',
    })

    assert.equal(transport instanceof ElectronAgentRuntimeTransport, true)
    assert.equal(transport.kind, 'electron')
    assert.equal(transport.endpointLabel, 'electron:agent-runtime')
  })
})

test('agent runtime transport factory keeps session metadata on Electron IPC requests', async () => {
  const calls: unknown[] = []
  await withWindowAPI({
    ensureAgentRuntime: async () => ({ ok: true, running: true, managed: true, started: false, baseURL: 'electron:agent-runtime', endpoint: 'electron:agent-runtime' }),
    agentRuntimeRequest: async (input) => {
      calls.push(input)
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }
    },
    agentRuntimeOpenEventStream: async () => {
      throw new Error('unexpected stream')
    },
    agentRuntimeCloseEventStream: async () => undefined,
    onAgentRuntimeStreamMessage: () => () => undefined,
  }, async () => {
    const transport = createAgentRuntimeTransport({
      workspaceDir: '/tmp/movscript-workspace',
      sessionId: 'session_1',
    })

    const response = await transport.request('/runtime/compat')

    assert.equal(response.status, 200)
    assert.deepEqual(calls, [{
      workspaceDir: '/tmp/movscript-workspace',
      sessionId: 'session_1',
      path: '/runtime/compat',
      method: undefined,
      headers: {},
      body: undefined,
    }])
  })
})

test('Electron agent runtime transport exposes IPC stream messages as event stream', async () => {
  let streamHandler: ((message: ElectronAgentRuntimeStreamMessage) => void) | undefined
  const closed: string[] = []
  await withWindowAPI({
    agentRuntimeRequest: async () => {
      throw new Error('unexpected request')
    },
    agentRuntimeOpenEventStream: async (input) => {
      queueMicrotask(() => {
        streamHandler?.({ streamId: input.streamId, kind: 'message', data: '{"event":1}' })
        streamHandler?.({ streamId: input.streamId, kind: 'end' })
      })
      return {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: '',
      }
    },
    agentRuntimeCloseEventStream: async (input) => {
      closed.push(input.streamId)
    },
    onAgentRuntimeStreamMessage: (handler) => {
      streamHandler = handler
      return () => {
        streamHandler = undefined
      }
    },
  }, async () => {
    const stream = await new ElectronAgentRuntimeTransport({ sessionId: 'session_1' }).openEventStream('/threads/thread_1/stream')
    const messages: string[] = []
    for await (const message of stream.messages()) {
      messages.push(message)
    }

    assert.equal(stream.ok, true)
    assert.deepEqual(messages, ['{"event":1}'])
    assert.equal(closed.length, 1)
    assert.equal(streamHandler, undefined)
  })
})

test('Electron agent runtime transport closes remote stream when aborted', async () => {
  let streamHandler: ((message: ElectronAgentRuntimeStreamMessage) => void) | undefined
  const closed: string[] = []
  await withWindowAPI({
    agentRuntimeRequest: async () => {
      throw new Error('unexpected request')
    },
    agentRuntimeOpenEventStream: async () => ({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: '',
    }),
    agentRuntimeCloseEventStream: async (input) => {
      closed.push(input.streamId)
    },
    onAgentRuntimeStreamMessage: (handler) => {
      streamHandler = handler
      return () => {
        streamHandler = undefined
      }
    },
  }, async () => {
    const controller = new AbortController()
    const stream = await new ElectronAgentRuntimeTransport({ sessionId: 'session_1' }).openEventStream('/threads/thread_1/stream', {
      signal: controller.signal,
    })

    controller.abort(new Error('stop stream'))

    await assert.rejects(async () => {
      for await (const _message of stream.messages()) {
        // no messages expected
      }
    }, /stop stream/)
    assert.equal(closed.length, 1)
    assert.equal(streamHandler, undefined)
  })
})

type TestElectronAgentRuntimeAPI = Pick<ElectronAPI, 'agentRuntimeRequest' | 'agentRuntimeOpenEventStream' | 'agentRuntimeCloseEventStream' | 'onAgentRuntimeStreamMessage'> & Partial<Pick<ElectronAPI, 'ensureAgentRuntime'>>

async function withWindowAPI(api: TestElectronAgentRuntimeAPI, run: () => Promise<void>): Promise<void> {
  const runtimeGlobal = globalThis as typeof globalThis & { window?: unknown }
  const originalWindow = runtimeGlobal.window
  ;(runtimeGlobal as Record<string, unknown>).window = { api }
  try {
    await run()
  } finally {
    ;(runtimeGlobal as Record<string, unknown>).window = originalWindow
  }
}

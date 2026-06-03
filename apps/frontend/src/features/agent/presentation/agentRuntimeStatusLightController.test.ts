import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AgentRuntimeStatusLightController,
  runtimeStatusLightTargetKey,
  runtimeStatusLightTargetsSignature,
  type AgentRuntimeStatusLightClient,
} from '@/features/agent/presentation/agentRuntimeStatusLightController'
import type { AgentRuntimeEventV2, AgentRuntimeSnapshotV2 } from '@/shared/infrastructure/localAgentClient'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'

test('runtime status light controller shares one thread stream across owners', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const statuses: Record<string, AgentRuntimeStatusLight> = {}
  const cleared: string[] = []
  const controller = new AgentRuntimeStatusLightController({
    client,
    refreshDebounceMs: 1,
    shouldRefresh: () => true,
    sink: {
      setTargetStatusLight: (targetKey, statusLight) => {
        statuses[targetKey] = statusLight
      },
      clearTargetStatusLight: (targetKey) => {
        cleared.push(targetKey)
        delete statuses[targetKey]
      },
    },
  })

  controller.setOwnerTargets('page', [{ conversationId: 'conv_1', sessionId: 'session_1', threadId: 'thread_1' }])
  controller.setOwnerTargets('header', [{ conversationId: 'conv_1', sessionId: 'session_1', threadId: 'thread_1' }])
  await settle()

  assert.equal(client.threadStreams.length, 1)
  assert.equal(client.threadRuntimeCalls, 1)
  assert.equal(statuses['thread:thread_1']?.state, 'stopped')

  controller.clearOwnerTargets('page')
  await settle()

  assert.equal(client.threadStreams.length, 1)
  const sharedThreadStream = client.threadStreams[0]
  assert.ok(sharedThreadStream)
  assert.equal(sharedThreadStream.signal?.aborted, false)

  controller.clearOwnerTargets('header')
  await settle()

  assert.equal(sharedThreadStream.signal?.aborted, true)
  assert.deepEqual(cleared, ['thread:thread_1'])
})

test('runtime status light controller debounces stream-triggered refreshes', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const controller = new AgentRuntimeStatusLightController({
    client,
    refreshDebounceMs: 5,
    shouldRefresh: () => true,
    sink: {
      setTargetStatusLight: () => undefined,
      clearTargetStatusLight: () => undefined,
    },
  })

  controller.setOwnerTargets('page', [{ conversationId: 'conv_1', threadId: 'thread_1' }])
  await settle()
  assert.equal(client.threadRuntimeCalls, 1)

  client.threadStreams[0]?.emit()
  client.threadStreams[0]?.emit()
  client.threadStreams[0]?.emit()
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(client.threadStreams.length, 1)
  assert.equal(client.threadRuntimeCalls, 2)
  controller.stopAll()
})

test('runtime status light target helpers prefer threads and fall back to sessions', () => {
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', sessionId: ' session_1 ', threadId: ' thread_1 ' }), 'thread:thread_1')
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', threadId: ' thread_1 ' }), 'thread:thread_1')
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', sessionId: ' session_1 ' }), 'session:session_1')
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1' }), undefined)
  assert.equal(runtimeStatusLightTargetsSignature([
    { conversationId: 'conv_1', sessionId: 'session_1', threadId: 'thread_1' },
    { conversationId: 'conv_2' },
  ]), 'conv_1:thread:thread_1|conv_2:none')
})

test('runtime status light controller falls back to session streams when no thread is known', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const statuses: Record<string, AgentRuntimeStatusLight> = {}
  const controller = new AgentRuntimeStatusLightController({
    client,
    refreshDebounceMs: 1,
    shouldRefresh: () => true,
    sink: {
      setTargetStatusLight: (targetKey, statusLight) => {
        statuses[targetKey] = statusLight
      },
      clearTargetStatusLight: () => undefined,
    },
  })

  controller.setOwnerTargets('page', [{ conversationId: 'conv_1', sessionId: 'session_1' }])
  await settle()

  assert.equal(client.sessionStreams.length, 1)
  assert.equal(client.sessionRuntimeCalls, 1)
  assert.equal(statuses['session:session_1']?.state, 'stopped')
  controller.stopAll()
})

class FakeRuntimeStatusLightClient implements AgentRuntimeStatusLightClient {
  sessionRuntimeCalls = 0
  threadRuntimeCalls = 0
  sessionStreams: FakeStream[] = []
  threadStreams: FakeStream[] = []

  async getSessionRuntime(): Promise<AgentRuntimeSnapshotV2> {
    this.sessionRuntimeCalls += 1
    return snapshot()
  }

  async getThreadRuntime(): Promise<AgentRuntimeSnapshotV2> {
    this.threadRuntimeCalls += 1
    return snapshot()
  }

  async streamSession(_sessionId: string, options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal }): Promise<void> {
    const stream = new FakeStream(options)
    this.sessionStreams.push(stream)
    await stream.closed
  }

  async streamThread(_threadId: string, options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal }): Promise<void> {
    const stream = new FakeStream(options)
    this.threadStreams.push(stream)
    await stream.closed
  }
}

class FakeStream {
  signal?: AbortSignal
  private readonly onRuntimeEvent?: (event: AgentRuntimeEventV2) => void
  readonly closed: Promise<void>

  constructor(options: { onRuntimeEvent?: (event: AgentRuntimeEventV2) => void; signal?: AbortSignal }) {
    this.signal = options.signal
    this.onRuntimeEvent = options.onRuntimeEvent
    this.closed = new Promise((resolve) => {
      options.signal?.addEventListener('abort', () => resolve(), { once: true })
    })
  }

  emit(): void {
    this.onRuntimeEvent?.(event())
  }
}

function snapshot(): AgentRuntimeSnapshotV2 {
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: 'thread_1' },
    cursor: 'cursor_1',
    ordinal: 1,
    generatedAt: '2026-05-27T00:00:00.000Z',
    entities: {
      threads: [],
      messages: [],
      runs: [],
      interactions: [],
      works: [],
      continuations: [],
      plans: [],
      planRevisions: [],
      taskGraphs: [],
    },
  }
}

function event(): AgentRuntimeEventV2 {
  return ({
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: 'thread_1' },
    id: 'event_1',
    kind: 'run.upserted',
    cursor: 'cursor_2',
    ordinal: 2,
    emittedAt: '2026-05-27T00:00:01.000Z',
    entity: { id: 'run_1', threadId: 'thread_1', status: 'in_progress' },
  } as unknown) as AgentRuntimeEventV2
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AgentRuntimeStatusLightController,
  runtimeStatusLightTargetKey,
  runtimeStatusLightTargetKeys,
  runtimeStatusLightTargetsSignature,
  type AgentRuntimeStatusLightClient,
} from '@/features/agent/presentation/agentRuntimeStatusLightController'
import type { AgentRuntimeEventV2 } from '@/shared/infrastructure/localAgentClient'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'

test('runtime status light controller shares one stream per runtime target across owners', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const statuses: Record<string, AgentRuntimeStatusLight> = {}
  const cleared: string[] = []
  const controller = new AgentRuntimeStatusLightController({
    client,
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

  assert.equal(client.sessionStreams.length, 1)
  assert.equal(client.threadStreams.length, 1)
  assert.deepEqual(client.sessionClientInputs, [{ sessionId: 'session_1' }, { sessionId: 'session_1' }])
  client.sessionStreams[0]?.emit(statusLightEvent({ state: 'waiting', label: '等待', detail: 'Runtime 正在等待外部信息。' }))
  client.threadStreams[0]?.emit(statusLightEvent({ state: 'active', label: '运行', detail: 'Runtime 正在触发 run 循环。' }))
  assert.equal(statuses['session:session_1']?.state, 'waiting')
  assert.equal(statuses['thread:thread_1']?.state, 'active')

  controller.clearOwnerTargets('page')
  await settle()

  assert.equal(client.threadStreams.length, 1)
  const sharedSessionStream = client.sessionStreams[0]
  const sharedThreadStream = client.threadStreams[0]
  assert.ok(sharedSessionStream)
  assert.ok(sharedThreadStream)
  assert.equal(sharedSessionStream.signal?.aborted, false)
  assert.equal(sharedThreadStream.signal?.aborted, false)

  controller.clearOwnerTargets('header')
  await settle()

  assert.equal(sharedSessionStream.signal?.aborted, true)
  assert.equal(sharedThreadStream.signal?.aborted, true)
  assert.deepEqual(cleared, ['session:session_1', 'thread:thread_1'])
})

test('runtime status light controller ignores non-status-light runtime events', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const statuses: Record<string, AgentRuntimeStatusLight> = {}
  const controller = new AgentRuntimeStatusLightController({
    client,
    sink: {
      setTargetStatusLight: (targetKey, statusLight) => {
        statuses[targetKey] = statusLight
      },
      clearTargetStatusLight: () => undefined,
    },
  })

  controller.setOwnerTargets('page', [{ conversationId: 'conv_1', threadId: 'thread_1' }])
  await settle()

  client.threadStreams[0]?.emit(runEvent())
  client.threadStreams[0]?.emit(asyncWorkStatusEvent())
  assert.equal(statuses['thread:thread_1'], undefined)

  client.threadStreams[0]?.emit(statusLightEvent({ state: 'waiting', label: '等待', detail: 'Runtime 正在等待外部信息。' }))
  const statusLight = statuses['thread:thread_1'] as AgentRuntimeStatusLight | undefined
  assert.equal(statusLight?.state, 'waiting')
  controller.stopAll()
})

test('runtime status light target helpers prefer sessions and keep thread fallbacks', () => {
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', sessionId: ' session_1 ', threadId: ' thread_1 ' }), 'session:session_1')
  assert.deepEqual(runtimeStatusLightTargetKeys({ conversationId: 'conv_1', sessionId: ' session_1 ', threadId: ' thread_1 ' }), ['session:session_1', 'thread:thread_1'])
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', threadId: ' thread_1 ' }), 'thread:thread_1')
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1', sessionId: ' session_1 ' }), 'session:session_1')
  assert.equal(runtimeStatusLightTargetKey({ conversationId: 'conv_1' }), undefined)
  assert.equal(runtimeStatusLightTargetsSignature([
    { conversationId: 'conv_1', sessionId: 'session_1', threadId: 'thread_1' },
    { conversationId: 'conv_2' },
  ]), 'conv_1:session:session_1,thread:thread_1|conv_2:none')
})

test('runtime status light controller falls back to session streams when no thread is known', async () => {
  const client = new FakeRuntimeStatusLightClient()
  const statuses: Record<string, AgentRuntimeStatusLight> = {}
  const controller = new AgentRuntimeStatusLightController({
    client,
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
  client.sessionStreams[0]?.emit(statusLightEvent({ state: 'stopped', label: '停止', detail: 'Runtime 当前不会自行触发新的 run。' }))
  assert.equal(statuses['session:session_1']?.state, 'stopped')
  controller.stopAll()
})

class FakeRuntimeStatusLightClient implements AgentRuntimeStatusLightClient {
  sessionClientInputs: Array<{ sessionId: string }> = []
  sessionStreams: FakeStream[] = []
  threadStreams: FakeStream[] = []

  forSession(input: { sessionId: string }): AgentRuntimeStatusLightClient {
    this.sessionClientInputs.push({ sessionId: input.sessionId })
    return this
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

  emit(event: AgentRuntimeEventV2): void {
    this.onRuntimeEvent?.(event)
  }
}

function statusLightEvent(status: { state: 'stopped' | 'waiting' | 'active'; label: string; detail: string }): AgentRuntimeEventV2 {
  return runtimeEvent({
    kind: 'runtime_status.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', runtimeStatusId: 'runtime-status-light:thread_1' },
    entity: {
      type: 'runtime_status',
      value: {
        id: 'runtime-status-light:thread_1',
        threadId: 'thread_1',
        runId: 'run_1',
        content: status.detail,
        status: { kind: 'status_light', ...status },
        createdAt: '2026-05-27T00:00:00.000Z',
      },
    },
  })
}

function asyncWorkStatusEvent(): AgentRuntimeEventV2 {
  return runtimeEvent({
    kind: 'runtime_status.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', runtimeStatusId: 'runtime-status:work_1' },
    entity: {
      type: 'runtime_status',
      value: {
        id: 'runtime-status:work_1',
        threadId: 'thread_1',
        runId: 'run_1',
        content: '后台任务运行中。',
        status: {
          kind: 'async_work_handoff',
          title: '等待后台任务',
          detail: '后台任务运行中。',
          workId: 'work_1',
          workKind: 'async_tool',
          workStatus: 'running',
        },
        createdAt: '2026-05-27T00:00:00.000Z',
      },
    },
  })
}

function runEvent(): AgentRuntimeEventV2 {
  return runtimeEvent({
    kind: 'run.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'run',
      value: {
        id: 'run_1',
        threadId: 'thread_1',
        status: 'in_progress',
        runtimeLimits: {
          approvalMode: 'interactive',
          maxToolCalls: 20,
          maxIterations: 8,
          allowNetwork: false,
          allowFileBytes: false,
        },
        createdAt: '2026-05-27T00:00:00.000Z',
        updatedAt: '2026-05-27T00:00:00.000Z',
        steps: [],
      },
    },
  })
}

function runtimeEvent(overrides: Partial<AgentRuntimeEventV2> & Pick<AgentRuntimeEventV2, 'kind'>): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope: { type: 'thread', id: 'thread_1' },
    id: 'event_1',
    cursor: 'cursor_2',
    ordinal: 2,
    emittedAt: '2026-05-27T00:00:01.000Z',
    ...overrides,
  } as AgentRuntimeEventV2
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

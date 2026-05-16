import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentGraphResult } from '../orchestration/agentGraph.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
} from '../state/types.js'
import { applyRuntimeRunAgentGraphResultHandling } from './runtimeRunAgentGraphResultHandling.js'

test('applyRuntimeRunAgentGraphResultHandling completes graph results with project context and deferred records', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread({ messages: [message('msg_user', 'thread_1', 'user', 'hello')] })
  store.createThread(thread)
  store.createRun(run)
  const assistantMessages: AgentMessage[] = []
  const deferred: string[] = []

  const result = applyRuntimeRunAgentGraphResultHandling({
    ...baseInput(store, run, thread, {
      status: 'completed',
      finalContent: 'done',
      assistantContents: ['done'],
      toolOutcomes: [],
      warnings: [],
    }),
    contextPackage: { context: { currentProjectId: 42 } },
    emitAssistantMessage: (_run, assistant) => assistantMessages.push(assistant),
    deferPostRunRecords: (runId, input) => deferred.push(`${runId}:${input.projectId}:${input.userMessage.id}`),
  })

  assert.equal((result as AgentMessage).role, 'assistant')
  assert.equal(run.status, 'completed')
  assert.equal(run.assistantMessageId, 'msg_assistant')
  assert.equal(thread.messages.at(-1)?.id, 'msg_assistant')
  assert.equal(assistantMessages[0]?.id, 'msg_assistant')
  assert.deepEqual(deferred, ['run_1:42:msg_user'])
})

test('applyRuntimeRunAgentGraphResultHandling delegates cancelled graph results', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  let cancelledReason: string | undefined

  const result = applyRuntimeRunAgentGraphResultHandling({
    ...baseInput(store, run, thread, { status: 'cancelled', reason: 'user stopped' }),
    markRunCancelled: (targetRun, reason) => {
      cancelledReason = reason
      targetRun.status = 'cancelled'
      return targetRun
    },
  })

  assert.equal((result as AgentRun).status, 'cancelled')
  assert.equal(cancelledReason, 'user stopped')
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
  result: AgentGraphResult,
): Parameters<typeof applyRuntimeRunAgentGraphResultHandling>[0] {
  return {
    store,
    result,
    run,
    thread,
    userMessage: 'hello',
    postRunUserMessage: message('msg_user', thread.id, 'user', 'hello'),
    memories: [],
    memoryStore: new InMemoryAgentMemoryStore(),
    contextPackage: { context: {} },
    messageId: 'msg_assistant',
    now: () => '2026-01-01T00:00:01.000Z',
    markRunCancelled: (targetRun, reason) => {
      targetRun.status = 'cancelled'
      targetRun.cancelledAt = '2026-01-01T00:00:01.000Z'
      if (reason) targetRun.error = reason
      return targetRun
    },
    recordTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: `step_${targetRun.steps.length + 1}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
    deferPostRunRecords: () => {},
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function message(id: string, threadId: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    threadId,
    role,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

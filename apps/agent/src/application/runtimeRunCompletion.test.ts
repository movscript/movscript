import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentMessage, AgentRun, AgentRunStep, AgentThread, ToolCallOutcome } from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'
import {
  applyRuntimeRunCompletion,
  type RuntimeRunCompletionTraceInput,
} from './runtimeRunCompletion.js'

const now = '2026-01-01T00:00:01.000Z'

test('applyRuntimeRunCompletion creates assistant message, completion traces, metadata, thread projection, and post-run callback', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread({ status: 'running', activeRunId: 'run_1' })
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  const traces: RuntimeRunCompletionTraceInput[] = []
  const snapshots: string[] = []
  const assistantMessages: AgentMessage[] = []
  const postRuns: Array<{ runId: string; warningCount: number; userMessageId: string; projectId?: number }> = []
  let completedStep: AgentRunStep | undefined

  const assistant = applyRuntimeRunCompletion({
    store,
    run,
    thread,
    userMessage: 'Write a script',
    assistantContents: ['First pass', 'Final answer'],
    finalContent: 'Final answer',
    toolOutcomes: [toolOutcome()],
    warnings: ['warn'],
    memories: [memory()],
    memoryStorePath: '/tmp/memories.json',
    messageId: 'msg_assistant',
    now,
    postRunUserMessage: userMessage(),
    projectId: 42,
    recordTrace: (_run, trace) => traces.push(trace),
    createStep: (targetRun, type, round) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
    deferPostRunRecords: (runId, input) => {
      postRuns.push({
        runId,
        warningCount: input.warnings.length,
        userMessageId: input.userMessage.id,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      })
    },
  })

  assert.equal(assistant.id, 'msg_assistant')
  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(run.assistantMessageId, 'msg_assistant')
  assert.deepEqual(run.metadata?.memoryIds, ['mem_1'])
  assert.deepEqual(run.metadata?.assistantContentTurns, ['First pass', 'Final answer'])
  assert.equal(thread.status, 'completed')
  assert.equal(thread.activeRunId, undefined)
  assert.equal(thread.messages.at(-1)?.id, 'msg_assistant')
  assert.equal(completedStep?.status, 'completed')
  assert.deepEqual(completedStep?.result, { messageId: 'msg_assistant' })
  assert.equal(traces[0]?.kind, 'assistant')
  assert.equal(traces[0]?.stepId, 'step_1')
  assert.equal(traces[1]?.kind, 'run')
  assert.equal(traces[1]?.status, 'info')
  assert.deepEqual(assistantMessages.map((message) => message.id), ['msg_assistant'])
  assert.deepEqual(snapshots, ['completed_with_warnings:true'])
  assert.deepEqual(postRuns, [{ runId: 'run_1', warningCount: 1, userMessageId: 'msg_user', projectId: 42 }])
})

test('applyRuntimeRunCompletion marks a clean run completed and stores memory ids without assistant turn metadata', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)

  applyRuntimeRunCompletion({
    store,
    run,
    thread,
    userMessage: 'Hello',
    assistantContents: ['Done'],
    finalContent: 'Done',
    toolOutcomes: [],
    warnings: [],
    memories: [],
    memoryStorePath: '/tmp/memories.json',
    messageId: 'msg_assistant',
    now,
    postRunUserMessage: userMessage(),
    recordTrace: () => {},
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
    deferPostRunRecords: () => {},
  })

  assert.equal(run.status, 'completed')
  assert.equal(run.warnings, undefined)
  assert.deepEqual(run.metadata?.memoryIds, [])
  assert.equal(run.metadata?.assistantContentTurns, undefined)
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'idle',
    messages: [userMessage()],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
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

function userMessage(): AgentMessage {
  return {
    id: 'msg_user',
    threadId: 'thread_1',
    role: 'user',
    content: 'Write a script',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function memory(): AgentMemory {
  return {
    id: 'mem_1',
    projectId: 42,
    title: 'Memory',
    kind: 'fact',
    content: 'Remember this',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function toolOutcome(): ToolCallOutcome {
  return {
    call: { name: 'tool_a' },
    result: { ok: true },
  }
}

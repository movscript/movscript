import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  JSONValue,
} from '../state/types.js'
import type { ToolExecutionResult } from '../orchestration/toolExecutor.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import {
  applyRuntimeLocalGenerationCommand,
  isRuntimeLocalGenerationCommand,
  type RuntimeLocalGenerationTraceInput,
} from './runtimeLocalGenerationCommand.js'

const now = '2026-01-01T00:00:01.000Z'

test('isRuntimeLocalGenerationCommand detects image and video debug commands only', () => {
  assert.equal(isRuntimeLocalGenerationCommand(parseAgentCommand('/image prompt')), true)
  assert.equal(isRuntimeLocalGenerationCommand(parseAgentCommand('/video prompt')), true)
  assert.equal(isRuntimeLocalGenerationCommand(parseAgentCommand('/context')), false)
  assert.equal(isRuntimeLocalGenerationCommand(parseAgentCommand('hello')), false)
})

test('applyRuntimeLocalGenerationCommand forces a generation tool call and completes the run', async () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  const traces: RuntimeLocalGenerationTraceInput[] = []
  const assistantMessages: AgentMessage[] = []
  const snapshots: string[] = []
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  let stepIndex = 0

  const assistant = await applyRuntimeLocalGenerationCommand({
    store,
    run,
    thread,
    command: parseAgentCommand('/image 一张雨夜便利店概念图'),
    userMessage: '/image 一张雨夜便利店概念图',
    warnings: [],
    memories: [],
    now: () => now,
    timestampMs: makeClock(1000, 1250),
    executeGenerationTool: async (call): Promise<ToolExecutionResult> => {
      calls.push(call)
      return {
        call,
        result: {
          status: 'succeeded',
          jobId: 321,
          terminal: true,
          output_resource_id: 654,
          message: '图片生成完成，输出资源 #654。',
        },
        source: 'mcp',
      }
    },
    recordTrace: (_run, trace) => traces.push(trace),
    createStep: (targetRun, type, round, toolName) => {
      stepIndex += 1
      const step: AgentRunStep = {
        id: `step_${stepIndex}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
        ...(toolName ? { toolName } : {}),
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  assert.equal(run.status, 'completed')
  assert.equal(run.assistantMessageId, assistant.id)
  assert.deepEqual(run.metadata?.writtenMemoryIds, [])
  assert.equal((run.metadata?.forcedToolCall as any)?.name, 'movscript_create_generation_job')
  assert.equal(calls[0]?.name, 'movscript_create_generation_job')
  assert.equal(calls[0]?.args.output_type, 'image')
  assert.equal(calls[0]?.args.wait, true)
  assert.equal(thread.status, 'completed')
  assert.equal(thread.activeRunId, undefined)
  assert.equal(thread.messages.at(-1)?.id, assistant.id)
  assert.equal(run.steps[0]?.type, 'tool_call')
  assert.equal(run.steps[0]?.status, 'completed')
  assert.equal(run.steps[0]?.durationMs, 250)
  assert.equal(run.steps[1]?.type, 'message')
  assert.equal((run.steps[1]?.result as any)?.localCommand, 'image')
  assert.deepEqual(traces.map((trace) => trace.kind), ['policy', 'tool_call', 'tool_call', 'assistant', 'run'])
  assert.equal((traces[0]?.data as any)?.modelGatewayCalled, false)
  assert.equal((traces[2]?.data as any)?.generation?.jobId, 321)
  assert.deepEqual(assistantMessages.map((message) => message.id), [assistant.id])
  assert.deepEqual(snapshots, ['completed:true'])
})

test('applyRuntimeLocalGenerationCommand records failed tool steps and still finalizes the local command run', async () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  let stepIndex = 0

  await applyRuntimeLocalGenerationCommand({
    store,
    run,
    thread,
    command: parseAgentCommand('/video failed prompt'),
    userMessage: '/video failed prompt',
    warnings: ['warn'],
    memories: [],
    now: () => now,
    timestampMs: makeClock(0, 10),
    executeGenerationTool: async (call): Promise<ToolExecutionResult> => ({
      call,
      error: 'backend rejected parameters',
      errorData: { code: 'INVALID_PARAMETER_OPTION' },
      source: 'mcp',
    }),
    recordTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      stepIndex += 1
      const step: AgentRunStep = {
        id: `step_${stepIndex}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
        ...(toolName ? { toolName } : {}),
        ...(round ? { roundId: round.roundId, roundIndex: round.roundIndex, roundLabel: round.roundLabel, roundSource: round.roundSource } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
  })

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(run.steps[0]?.status, 'failed')
  assert.equal(run.steps[0]?.error, 'backend rejected parameters')
  assert.deepEqual(run.steps[0]?.errorData, { code: 'INVALID_PARAMETER_OPTION' })
  assert.equal((run.metadata?.forcedToolCall as any)?.args.output_type, 'video')
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'running',
    activeRunId: 'run_1',
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
    content: '/image 一张雨夜便利店概念图',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeClock(...values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

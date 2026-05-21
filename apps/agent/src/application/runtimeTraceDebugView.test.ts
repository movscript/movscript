import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRunPolicy } from '../state/runPolicy.js'
import type { AgentRun, AgentTraceEvent } from '../state/types.js'
import { buildRuntimeTraceDebugView } from './runtimeTraceDebugView.js'

test('buildRuntimeTraceDebugView summarizes model context, tools, pending actions, and attention events', () => {
  const run = makeRun()
  const events: AgentTraceEvent[] = [
    trace('trace_1', 'prompt', 'Prompt composed', {
      promptStats: {
        totalChars: 1200,
        byLayer: { level0_core: 700 },
        byContextLayer: { runtime_contract: 700 },
        parts: [{ id: 'part_1', layer: 'level0_core', contextLayer: 'runtime_contract', chars: 700 }],
      },
      skillIds: ['skill_a'],
      availableToolNames: ['tool_a'],
      messageCount: 3,
      systemMessageCount: 1,
    }),
    trace('trace_2', 'model_call', 'Model HTTP request started', {
      phase: 'request',
      request: { body: { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }], tools: [{ name: 'tool_a' }] } },
    }),
    trace('trace_3', 'model_call', 'Model HTTP response received', {
      phase: 'response',
      response: { status: 200, bodyText: '{"content":"ok"}', content: 'ok' },
      usage: { input_tokens: 10, output_tokens: 2 },
      latencyMs: 120,
    }),
    trace('trace_4', 'assistant', 'Assistant message created', {
      messageId: 'msg_1',
      content: 'ok',
      source: 'assistant',
    }),
    trace('trace_5', 'tool_call', 'Tool call completed: tool_a', {
      source: 'model',
      result: { ok: true },
      durationMs: 5,
    }, 'completed', 'tool_a'),
    trace('trace_6', 'tool_call', 'Tool call failed: tool_b', {
      error: 'boom',
    }, 'failed', 'tool_b'),
  ]

  const view = buildRuntimeTraceDebugView({
    run,
    events,
    summary: {
      runId: run.id,
      total: events.length,
      byKind: { prompt: 1, model_call: 2, assistant: 1, tool_call: 2 },
      latestEvent: events.at(-1),
    },
    generatedAt: '2026-01-01T00:00:10.000Z',
  })

  assert.equal(view.schema, 'movscript.agent-trace-debug-view.v1')
  assert.equal(view.generatedAt, '2026-01-01T00:00:10.000Z')
  assert.equal(view.trace.loaded, events.length)
  assert.equal(view.coverage.loadedLabel, '6 / 6')
  assert.equal(view.modelCalls[0]?.status, 'complete')
  assert.equal(view.modelCalls[0]?.model, 'gpt-test')
  assert.equal(view.modelCalls[0]?.hasRequestPayload, true)
  assert.equal(view.modelCalls[0]?.hasResponseBody, true)
  assert.equal(view.promptDetails[0]?.totalChars, '1200')
  assert.equal(view.messageWrites[0]?.messageId, 'msg_1')
  assert.equal(view.toolCalls.length, 2)
  assert.equal(view.attentionEvents[0]?.eventId, 'trace_6')
  assert.deepEqual(view.pendingActions.map((action) => action.id), ['approval_1', 'input_1'])
  assert.equal(view.bundle.schema, 'movscript.agent-run-debug-bundle.v1')
  assert.match(view.reportText, /AgentRun 调试摘要/)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    role: 'planner',
    policy: defaultRunPolicy(),
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'tool_a',
      status: 'pending',
      reason: 'needs confirmation',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      title: 'Need input',
      question: 'Continue?',
      inputType: 'choice',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function trace(
  id: string,
  kind: AgentTraceEvent['kind'],
  title: string,
  data: AgentTraceEvent['data'],
  status: AgentTraceEvent['status'] = 'completed',
  toolName?: string,
): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title,
    status,
    data,
    ...(toolName ? { toolName } : {}),
    roundId: 'round_1',
    roundIndex: 1,
    createdAt: `2026-01-01T00:00:0${id.at(-1)}.000Z`,
  }
}

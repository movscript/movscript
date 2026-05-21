import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUN_DEBUG_LEDGER_MAX_CHARS,
  applyTraceEventToDebugLedger,
  createRunDebugLedger,
  resolveRunDebugEvidence,
} from './runDebugLedger.js'
import { defaultRunPolicy } from './runPolicy.js'
import type { AgentRun, AgentTraceEvent } from './types.js'

function run(): AgentRun {
  return {
    id: 'run_ledger',
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'planner',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Find why the agent stopped',
      executionMode: 'chat',
      createdAt: '2026-05-21T00:00:00.000Z',
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
    policy: defaultRunPolicy(),
  }
}

function trace(input: Partial<AgentTraceEvent> & Pick<AgentTraceEvent, 'id' | 'kind' | 'title'>): AgentTraceEvent {
  return {
    runId: 'run_ledger',
    status: 'completed',
    createdAt: `2026-05-21T00:00:${input.id.replace(/\D/g, '').padStart(2, '0').slice(-2)}.000Z`,
    ...input,
  }
}

test('run debug ledger projects prompt, model, tool, and attention trace into a compact diagnostic index', () => {
  const currentRun = run()
  let ledger = createRunDebugLedger(currentRun)

  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: currentRun,
    event: trace({
      id: 'trace_1',
      kind: 'prompt',
      title: 'Prompt composed',
      roundIndex: 1,
      data: {
        eventType: 'prompt.composed',
        charCount: 1200,
        messageCount: 4,
        systemMessageCount: 2,
        skillIds: ['policy.core'],
        availableToolNames: ['movscript_read_project'],
        blockedToolCount: 1,
        promptStats: {
          totalChars: 1200,
          byContextLayer: { runtime_contract: 500, focus: 700 },
        },
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: currentRun,
    event: trace({
      id: 'trace_2',
      kind: 'model_call',
      title: 'Model HTTP request sent',
      roundIndex: 1,
      status: 'started',
      data: {
        phase: 'request',
        request: {
          body: {
            model: 'gpt-test',
            messages: [{ role: 'system', content: 'contract' }, { role: 'user', content: 'task' }],
            tools: [{ type: 'function', function: { name: 'movscript_read_project' } }],
          },
        },
        latencyMs: 0,
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: currentRun,
    event: trace({
      id: 'trace_3',
      kind: 'model_call',
      title: 'Model HTTP response received',
      roundIndex: 1,
      data: {
        phase: 'response',
        request: { body: { model: 'gpt-test' } },
        response: {
          status: 200,
          ok: true,
          bodyText: '{"content":"ok"}',
          content: 'ok',
        },
        latencyMs: 321,
        usage: { input_tokens: 10, output_tokens: 3 },
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: currentRun,
    event: trace({
      id: 'trace_4',
      kind: 'tool_call',
      title: 'Tool call failed: movscript_read_project',
      status: 'failed',
      roundIndex: 1,
      toolName: 'movscript_read_project',
      summary: 'project not found',
      data: { error: 'project not found', result: { error: 'project not found' } },
    }),
  })

  assert.equal(ledger.context.promptChars, 1200)
  assert.deepEqual(ledger.context.activeSkillIds, ['policy.core'])
  assert.equal(ledger.modelCalls.length, 1)
  assert.equal(ledger.modelCalls[0]?.status, 'complete')
  assert.equal(ledger.modelCalls[0]?.model, 'gpt-test')
  assert.equal(ledger.modelCalls[0]?.httpStatus, 200)
  assert.equal(ledger.toolCalls[0]?.toolName, 'movscript_read_project')
  assert.equal(ledger.attention[0]?.severity, 'error')
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'model_request'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'model_response'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'tool_result'), true)
})

test('run debug ledger enforces a hard serialized size budget under noisy trace input', () => {
  const currentRun = run()
  let ledger = createRunDebugLedger(currentRun)
  const huge = 'x'.repeat(20_000)
  for (let index = 0; index < 100; index++) {
    ledger = applyTraceEventToDebugLedger({
      ledger,
      run: currentRun,
      event: trace({
        id: `trace_${index + 1}`,
        kind: 'tool_call',
        title: 'Tool completed: noisy_tool',
        toolName: 'noisy_tool',
        summary: huge,
        data: { result: { payload: huge, index } },
      }),
    })
    assert.ok(JSON.stringify(ledger).length <= RUN_DEBUG_LEDGER_MAX_CHARS)
  }
  assert.equal(ledger.budget.truncated, true)
  assert.ok(ledger.toolCalls.length <= 30)
  assert.ok(ledger.evidenceIndex.length <= 60)
  assert.equal(JSON.stringify(ledger).includes(huge), false)
})

test('run debug evidence resolves large payloads by evidence id without embedding them in the ledger', () => {
  const event = trace({
    id: 'trace_99',
    kind: 'model_call',
    title: 'Model HTTP request sent',
    data: {
      phase: 'request',
      request: { body: { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }] } },
    },
  })
  let ledger = createRunDebugLedger(run())
  ledger = applyTraceEventToDebugLedger({ ledger, event, run: run() })
  const evidenceId = ledger.evidenceIndex.find((item) => item.kind === 'model_request')?.evidenceId

  assert.equal(evidenceId, 'trace_99:model_request')
  const evidence = resolveRunDebugEvidence({ runId: 'run_ledger', events: [event], evidenceId: evidenceId! })

  assert.equal(evidence?.schema, 'movscript.agent.run-debug-evidence.v1')
  assert.equal(evidence?.eventId, 'trace_99')
  assert.deepEqual(evidence?.value, { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }] })
})

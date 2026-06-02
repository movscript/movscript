import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUN_DEBUG_LEDGER_MAX_CHARS,
  applyTraceEventToDebugLedger,
  createRunDebugLedger,
  findRunDebugEvidenceRefs,
  resolveRunDebugEvidence,
} from './runDebugLedger.js'
import { defaultRuntimeLimits } from '../../../state/run/core/limits/runtimeLimits.js'
import type { AgentRun, AgentTraceEvent } from '../../../state/shared/types.js'

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
    runtimeLimits: defaultRuntimeLimits(),
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
        contextBundleId: 'ctxb_1',
        contextBundleRef: { id: 'ctxb_1', promptHash: 'sha256:prompt' },
        skillIds: ['core.runtime'],
        availableToolNames: ['movscript_read_project'],
        blockedToolCount: 1,
        promptStats: {
          totalChars: 1200,
          byContextLayer: { runtime_contract: 500, focus: 700 },
          budgetLedger: {
            decisionCount: 1,
            decisions: [{
              action: 'drop',
              stage: 'low_priority',
              partId: 'skill.low',
              reason: 'prompt.size.exceeded: dropped non-critical skill skill.low',
              originalChars: 400,
              renderedChars: 0,
            }],
          },
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
      data: {
        args: { projectId: 404 },
        error: 'project not found',
        resultHash: 'sha256:tool_result',
        resultChars: 29,
        resultMode: 'summary',
        contextRefs: [{
          key: 'tool_result:call_1:sha256:tool_result',
          ref: { type: 'tool_result', id: 'call_1', hash: 'sha256:tool_result' },
        }],
      },
    }),
  })

  assert.equal(ledger.context.promptChars, 1200)
  assert.equal(ledger.context.droppedSummary.count, 1)
  assert.equal(ledger.context.droppedSummary.totalOriginalChars, 400)
  assert.equal(ledger.context.droppedSummary.samples[0]?.reason, 'prompt.size.exceeded: dropped non-critical skill skill.low')
  assert.deepEqual(ledger.context.activeSkillIds, ['core.runtime'])
  assert.equal(ledger.modelCalls.length, 1)
  assert.equal(ledger.modelCalls[0]?.status, 'complete')
  assert.equal(ledger.modelCalls[0]?.model, 'gpt-test')
  assert.equal(ledger.modelCalls[0]?.httpStatus, 200)
  assert.equal(ledger.toolCalls[0]?.toolName, 'movscript_read_project')
  assert.equal(ledger.toolCalls[0]?.argsEvidenceRef, 'trace_4:tool_args')
  assert.equal(ledger.attention[0]?.severity, 'error')
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'model_request'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'model_response'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'tool_args'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.kind === 'tool_result'), true)
  assert.equal(ledger.evidenceIndex.some((item) => item.contextBundleIds?.includes('ctxb_1')), true)
  const toolResultEvidence = ledger.evidenceIndex.find((item) => item.kind === 'tool_result')
  assert.equal(toolResultEvidence?.resultHashes?.includes('sha256:tool_result'), true)
  assert.equal(toolResultEvidence?.refKeys?.includes('tool_result:call_1:sha256:tool_result'), true)
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

test('run debug evidence resolves tool call arguments', () => {
  const event = trace({
    id: 'trace_tool_args',
    kind: 'tool_call',
    title: 'Tool completed: movscript_read_project',
    status: 'completed',
    toolName: 'movscript_read_project',
    data: { args: { projectId: 42 }, result: { ok: true } },
  })
  let ledger = createRunDebugLedger(run())
  ledger = applyTraceEventToDebugLedger({ ledger, event, run: run() })
  const evidenceId = ledger.toolCalls[0]?.argsEvidenceRef

  assert.equal(evidenceId, 'trace_tool_args:tool_args')
  const evidence = resolveRunDebugEvidence({ runId: 'run_ledger', events: [event], evidenceId: evidenceId! })

  assert.equal(evidence?.kind, 'tool_args')
  assert.deepEqual(evidence?.value, { projectId: 42 })
})

test('run debug ledger indexes assistant content hashes for evidence lookup', () => {
  const event = trace({
    id: 'trace_assistant',
    kind: 'assistant',
    title: 'Assistant message created',
    status: 'completed',
    data: {
      messageId: 'msg_1',
      contentHash: 'sha256:assistant_content',
      contentChars: 12,
      contentMode: 'summary',
      source: 'model',
    },
  })
  let ledger = createRunDebugLedger(run())
  ledger = applyTraceEventToDebugLedger({ ledger, event, run: run() })

  const evidence = ledger.evidenceIndex.find((item) => item.contentHashes?.includes('sha256:assistant_content'))
  assert.equal(evidence?.kind, 'raw_event')
  assert.equal(evidence?.eventId, 'trace_assistant')
})

test('run debug ledger finds evidence refs by context refs and hashes without scanning callers', () => {
  let ledger = createRunDebugLedger(run())
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: run(),
    event: trace({
      id: 'trace_prompt_ref',
      kind: 'prompt',
      title: 'Prompt composed',
      data: {
        contextBundleId: 'ctxb_lookup',
        contextBundleRef: { id: 'ctxb_lookup', promptHash: 'sha256:prompt' },
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: run(),
    event: trace({
      id: 'trace_tool_grant',
      kind: 'tool_call',
      title: 'Tool completed: movscript_read_project',
      toolName: 'movscript_read_project',
      data: {
        resultHash: 'sha256:tool_lookup',
        resultMode: 'summary',
        contextRefs: [{
          key: 'tool_result:call_lookup:sha256:tool_lookup',
          ref: { type: 'tool_result', id: 'call_lookup', hash: 'sha256:tool_lookup' },
        }],
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: run(),
    event: trace({
      id: 'trace_context_mutation',
      kind: 'context',
      title: 'Context ledger updated',
      data: {
        eventType: 'context.ledger_updated',
        retrievedCount: 2,
        activeCount: 1,
        amendedCount: 1,
        deletedCount: 0,
        mutationSummary: {
          schema: 'movscript.context-mutation-summary.v1',
          total: 2,
          appended: 1,
          amended: 1,
          deleted: 0,
          affectedContextKeys: ['reference:storyboard.rhythm.basic:sha256:old', 'reference:storyboard.rhythm.basic:sha256:new'],
          appendedContextKeys: ['reference:storyboard.rhythm.basic:sha256:old'],
          amendedContextKeys: ['reference:storyboard.rhythm.basic:sha256:old', 'reference:storyboard.rhythm.basic:sha256:new'],
          deletedContextKeys: [],
          latest: {
            id: 'ctx_mut_amend_1',
            type: 'amend',
            createdAt: '2026-05-21T00:00:04.000Z',
            reason: 'reference refreshed',
          },
        },
        refs: [{
          key: 'reference:storyboard.rhythm.basic:sha256:new',
          type: 'reference',
          id: 'storyboard.rhythm.basic',
          status: 'active',
          hash: 'sha256:new',
        }],
      },
    }),
  })
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: run(),
    event: trace({
      id: 'trace_message_ref',
      kind: 'assistant',
      title: 'Assistant message created',
      data: {
        contentHash: 'sha256:message_lookup',
        contentChars: 20,
        contentMode: 'summary',
      },
    }),
  })

  assert.deepEqual(
    findRunDebugEvidenceRefs({ ledger, contextBundleId: 'ctxb_lookup' }).map((item) => item.evidenceId),
    ['trace_prompt_ref:raw_event'],
  )
  assert.deepEqual(
    findRunDebugEvidenceRefs({ ledger, refKey: 'tool_result:call_lookup:sha256:tool_lookup', resultHash: 'sha256:tool_lookup', kind: 'tool_result' }).map((item) => item.evidenceId),
    ['trace_tool_grant:tool_result'],
  )
  assert.deepEqual(
    findRunDebugEvidenceRefs({ ledger, contentHash: 'sha256:message_lookup' }).map((item) => item.evidenceId),
    ['trace_message_ref:raw_event'],
  )
  assert.deepEqual(
    findRunDebugEvidenceRefs({ ledger, refKey: 'reference:storyboard.rhythm.basic:sha256:new', kind: 'raw_event' }).map((item) => item.evidenceId),
    ['trace_context_mutation:raw_event'],
  )
  const contextMutationEvidence = ledger.evidenceIndex.find((item) => item.evidenceId === 'trace_context_mutation:raw_event')
  assert.equal(contextMutationEvidence?.refKeys?.includes('reference:storyboard.rhythm.basic:sha256:old'), true)
  assert.equal(contextMutationEvidence?.refKeys?.includes('reference:storyboard.rhythm.basic:sha256:new'), true)
  assert.equal(contextMutationEvidence?.preview.includes('movscript.context-mutation-summary.v1'), true)
  assert.deepEqual(findRunDebugEvidenceRefs({ ledger, kind: 'raw_event' }), [])
  assert.deepEqual(findRunDebugEvidenceRefs({ ledger, resultHash: 'missing' }), [])
})

test('run debug ledger indexes dropped tool result refs for reread evidence lookup', () => {
  let ledger = createRunDebugLedger(run())
  ledger = applyTraceEventToDebugLedger({
    ledger,
    run: run(),
    event: trace({
      id: 'trace_drop_ref',
      kind: 'context',
      title: 'Tool result body summarized',
      data: {
        eventType: 'context.item_dropped',
        reason: 'summarized',
        originalChars: 5000,
        renderedChars: 900,
        resultHash: 'sha256:dropped_tool',
        refKey: 'tool_result:call_dropped:sha256:dropped_tool',
        resultRef: {
          key: 'tool_result:call_dropped:sha256:dropped_tool',
          hash: 'sha256:dropped_tool',
          evidenceKind: 'tool_result',
          lookup: {
            refKey: 'tool_result:call_dropped:sha256:dropped_tool',
            resultHash: 'sha256:dropped_tool',
          },
        },
      },
    }),
  })

  assert.equal(ledger.context.droppedSummary.samples[0]?.resultHash, 'sha256:dropped_tool')
  assert.deepEqual(
    findRunDebugEvidenceRefs({ ledger, refKey: 'tool_result:call_dropped:sha256:dropped_tool', resultHash: 'sha256:dropped_tool', kind: 'raw_event' }).map((item) => item.evidenceId),
    ['trace_drop_ref:raw_event'],
  )
  const evidence = resolveRunDebugEvidence({ runId: 'run_ledger', events: [trace({
    id: 'trace_drop_ref',
    kind: 'context',
    title: 'Tool result body summarized',
    data: {
      eventType: 'context.item_dropped',
      resultHash: 'sha256:dropped_tool',
      refKey: 'tool_result:call_dropped:sha256:dropped_tool',
    },
  })], evidenceId: 'trace_drop_ref:raw_event' })
  assert.equal((evidence?.value as any).data.resultHash, 'sha256:dropped_tool')
})

test('run debug ledger records prompt-too-long recovery projection decisions', () => {
  const currentRun = run()
  const ledger = applyTraceEventToDebugLedger({
    ledger: createRunDebugLedger(currentRun),
    run: currentRun,
    event: trace({
      id: 'trace_prompt_too_long',
      kind: 'context',
      title: 'Prompt too long recovery projected',
      summary: '2 history message(s) collapsed before retrying the model call.',
      data: {
        eventType: 'context.prompt_too_long_recovery',
        droppedHistoryMessageCount: 2,
        retainedHistoryMessageCount: 0,
        summaryChars: 240,
      },
    }),
  })

  assert.equal(ledger.context.droppedSummary.count, 2)
  assert.equal(ledger.context.droppedSummary.totalRenderedChars, 240)
  assert.equal(ledger.context.droppedSummary.samples[0]?.reason, 'prompt.too_long.recovery')
  assert.equal(ledger.decisions[0]?.kind, 'context')
  assert.match(ledger.decisions[0]?.impact ?? '', /2 条历史消息折叠为 240 字符摘要/)
})

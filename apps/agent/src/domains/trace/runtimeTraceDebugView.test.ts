import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRunPolicy } from '../../state/runPolicy.js'
import type { AgentRun, AgentTraceEvent } from '../../state/types.js'
import { buildRuntimeTraceDebugView } from './runtimeTraceDebugView.js'

test('buildRuntimeTraceDebugView summarizes model context, tools, pending actions, and attention events', () => {
  const run = makeRun()
  const events: AgentTraceEvent[] = [
    trace('trace_0', 'skill', 'Initial skills resolved', {
      skillEventType: 'skill.state_resolved',
      activeSkillIds: ['skill_pre'],
      loadedSkillIds: ['skill_pre'],
      unloadedSkillIds: ['skill_a'],
      availableSkillIds: ['skill_pre', 'skill_a'],
      skillOmissions: [
        {
          skillId: 'skill_a',
          name: 'Skill A',
          stage: 'trigger_not_matched',
          reason: 'Workflow trigger did not match the current request/context.',
        },
      ],
    }),
    trace('trace_00', 'context', 'Context ledger updated before prompt', {
      eventType: 'context.ledger_updated',
      activeCount: 1,
      amendedCount: 0,
      deletedCount: 0,
      mutationSummary: {
        schema: 'movscript.context-mutation-summary.v1',
        total: 1,
        appended: 1,
        amended: 0,
        deleted: 0,
        affectedContextKeys: ['knowledge:brief:sha256:pre'],
        appendedContextKeys: ['knowledge:brief:sha256:pre'],
        amendedContextKeys: [],
        deletedContextKeys: [],
        latest: {
          id: 'ctx_mut_pre_1',
          type: 'append',
          createdAt: '2026-01-01T00:00:00.000Z',
          reason: 'initial brief loaded',
        },
      },
      refs: [{
        key: 'knowledge:brief:sha256:pre',
        type: 'knowledge',
        id: 'brief',
        status: 'active',
        hash: 'sha256:pre',
      }],
    }),
    trace('trace_1', 'prompt', 'Prompt composed', {
      contextBundleId: 'ctxb_1',
      contextBundleRef: {
        id: 'ctxb_1',
        promptHash: 'sha256:prompt',
      },
      promptStats: {
        totalChars: 1200,
        byLayer: { level0_core: 700 },
        byContextLayer: { runtime_contract: 700 },
        parts: [{ id: 'part_1', layer: 'level0_core', contextLayer: 'runtime_contract', chars: 700 }],
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
      historyProjection: {
        inputCount: 9,
        retainedCount: 6,
        compactedCount: 3,
        filteredCount: 1,
        summaryChars: 240,
        decisions: [{
          action: 'compact',
          stage: 'history_window',
          reason: 'Older transcript messages were summarized.',
          messageCount: 3,
          retainedCount: 6,
          summaryChars: 240,
          maxMessages: 6,
        }],
      },
      toolLoopProjection: {
        messageCount: 2,
        includedCount: 2,
        chars: 120,
        decisions: [{ action: 'retain', stage: 'tool_loop_tail', reason: 'retained', messageCount: 2, chars: 120 }],
      },
      attachmentProjection: {
        attachmentCount: 2,
        inlineImageCount: 1,
        metadataOnlyCount: 1,
        totalBytes: 64,
        dataUrlChars: 24,
        decisions: [{ action: 'retain', stage: 'user_attachments', reason: 'metadata', attachmentCount: 2 }],
      },
      skillIds: ['skill_a'],
      skillContextProjection: [
        {
          skillId: 'skill_a',
          name: 'Skill A',
          activationReason: 'trigger',
          contextBehavior: 'on_demand',
          includedInPrompt: true,
          promptPartId: 'skill.skill_a',
          promptLayer: 'level2_behavior',
          promptKind: 'skill',
          renderedChars: 300,
        },
        {
          skillId: 'skill.low',
          name: 'Low skill',
          activationReason: 'default',
          contextBehavior: 'on_demand',
          includedInPrompt: false,
          promptPartId: 'skill.low',
          omittedStage: 'low_priority',
          omittedReason: 'prompt.size.exceeded: dropped non-critical skill skill.low',
          originalChars: 400,
        },
      ],
      availableToolNames: ['tool_a'],
      messageCount: 3,
      systemMessageCount: 1,
    }),
    trace('trace_2', 'model_call', 'Model HTTP request started', {
      phase: 'request',
      request: {
        body: {
          model: 'gpt-test',
          messageCount: 1,
          toolCount: 1,
          bodyHash: 'sha256:request',
          contentMode: 'summary',
        },
      },
    }),
    trace('trace_3', 'model_call', 'Model HTTP response received', {
      phase: 'response',
      response: { status: 200, bodyTextHash: 'sha256:response', bodyTextChars: 16, contentChars: 2 },
      usage: { input_tokens: 10, output_tokens: 2 },
      latencyMs: 120,
    }),
    trace('trace_4', 'assistant', 'Assistant message created', {
      messageId: 'msg_1',
      contentHash: 'sha256:assistant',
      source: 'assistant',
    }),
    trace('trace_skill', 'skill', 'Skills activated', {
      skillEventType: 'skill.state_resolved',
      activeSkillIds: ['skill_a'],
      loadedSkillIds: ['skill_a'],
      unloadedSkillIds: [],
      availableSkillIds: ['skill_a', 'skill.trigger', 'skill.dep', 'skill.conflict'],
      skillOmissions: [
        {
          skillId: 'skill.trigger',
          name: 'Trigger skill',
          kind: 'workflow',
          stage: 'trigger_not_matched',
          reason: 'Workflow trigger did not match the current request/context.',
          matched: false,
          selected: false,
          triggerReason: 'not_matched',
        },
        {
          skillId: 'skill.dep',
          name: 'Dependency skill',
          kind: 'policy',
          stage: 'dependency_inactive',
          reason: 'Required skill dependencies are not active in this run: skill.missing.',
          dependencyIds: ['skill.missing'],
          inactiveDependencyIds: ['skill.missing'],
        },
      ],
    }),
    trace('trace_5', 'tool_call', 'Tool call completed: tool_a', {
      source: 'model',
      resultHash: 'sha256:tool',
      resultChars: 11,
      resultMode: 'summary',
      contextRefs: [{
        key: 'tool_result:call_1:sha256:tool',
        ref: { type: 'tool_result', id: 'call_1', hash: 'sha256:tool' },
      }],
      durationMs: 5,
    }, 'completed', 'tool_a'),
    trace('trace_6', 'tool_call', 'Tool call failed: tool_b', {
      error: 'boom',
    }, 'failed', 'tool_b'),
    trace('trace_8', 'policy', 'Turn 1: policy result', {
      eventType: 'tool.call.policy_decision',
      allowed: ['tool_a'],
      blocked: [
        { name: 'tool_c', reason: 'approval_required' },
        { name: 'tool_d', reason: 'not_granted' },
      ],
      decision: 'approval_required',
    }, 'blocked'),
    trace('trace_9', 'approval', 'Approval requested', {
      eventType: 'approval.requested',
      tools: [{ name: 'tool_c', reasonHash: 'sha256:approval', reasonChars: 12, reasonMode: 'summary' }],
    }, 'blocked'),
    trace('trace_7', 'context', 'Context ledger updated', {
      eventType: 'context.ledger_updated',
      activeCount: 1,
      amendedCount: 1,
      deletedCount: 0,
      mutationSummary: {
        schema: 'movscript.context-mutation-summary.v1',
        total: 2,
        appended: 1,
        amended: 1,
        deleted: 0,
        affectedContextKeys: ['knowledge:storyboard.rhythm.basic:sha256:old', 'knowledge:storyboard.rhythm.basic:sha256:new'],
        appendedContextKeys: ['knowledge:storyboard.rhythm.basic:sha256:old'],
        amendedContextKeys: ['knowledge:storyboard.rhythm.basic:sha256:old', 'knowledge:storyboard.rhythm.basic:sha256:new'],
        deletedContextKeys: [],
        latest: {
          id: 'ctx_mut_amend_1',
          type: 'amend',
          createdAt: '2026-01-01T00:00:07.000Z',
          reason: 'knowledge refreshed',
        },
      },
      refs: [{
        key: 'knowledge:storyboard.rhythm.basic:sha256:new',
        type: 'knowledge',
        id: 'storyboard.rhythm.basic',
        status: 'active',
        hash: 'sha256:new',
      }],
    }),
  ]

  const view = buildRuntimeTraceDebugView({
    run,
    events,
    summary: {
      runId: run.id,
      total: events.length,
      byKind: { prompt: 1, model_call: 2, assistant: 1, skill: 2, tool_call: 2, policy: 1, approval: 1, context: 2 },
      latestEvent: events.at(-1),
    },
    generatedAt: '2026-01-01T00:00:10.000Z',
  })

  assert.equal(view.schema, 'movscript.agent-trace-debug-view.v1')
  assert.equal(view.generatedAt, '2026-01-01T00:00:10.000Z')
  assert.equal(view.trace.loaded, events.length)
  assert.equal(view.coverage.loadedLabel, '12 / 12')
  assert.equal(view.modelCalls[0]?.status, 'complete')
  assert.equal(view.modelCalls[0]?.model, 'gpt-test')
  assert.equal(view.modelCalls[0]?.messageCount, '1')
  assert.equal(view.modelCalls[0]?.toolCount, '1')
  assert.equal(view.modelCalls[0]?.hasRequestPayload, true)
  assert.equal(view.modelCalls[0]?.hasResponseBody, true)
  assert.equal(view.readinessChecklist.find((item) => item.id === 'request_payload')?.label, '请求摘要可追踪')
  assert.equal(view.readinessChecklist.find((item) => item.id === 'response_body')?.label, '响应摘要可追踪')
  assert.equal(view.coverage.tokenUsageLabel, '12 tokens，in 10 / out 2')
  assert.equal(view.promptDetails[0]?.totalChars, '1200')
  assert.equal(view.promptDetails[0]?.contextBundle?.id, 'ctxb_1')
  assert.equal(view.promptDetails[0]?.contextBundle?.hash, 'sha256:prompt')
  assert.deepEqual(view.promptDetails[0]?.budgetDecisions.map((decision) => ({
    action: decision.action,
    stage: decision.stage,
    partId: decision.partId,
  })), [{ action: 'drop', stage: 'low_priority', partId: 'skill.low' }])
  assert.deepEqual(view.runtimeSummary.skills.contextProjection.map((skill) => ({
    skillId: skill.skillId,
    includedInPrompt: skill.includedInPrompt,
    omittedStage: skill.omittedStage,
  })), [
    { skillId: 'skill_a', includedInPrompt: true, omittedStage: undefined },
    { skillId: 'skill.low', includedInPrompt: false, omittedStage: 'low_priority' },
  ])
  assert.deepEqual(view.runtimeSummary.skills.omissions.map((skill) => ({
    skillId: skill.skillId,
    stage: skill.stage,
  })), [
    { skillId: 'skill.trigger', stage: 'trigger_not_matched' },
    { skillId: 'skill.dep', stage: 'dependency_inactive' },
  ])
  assert.deepEqual(view.promptDetails[0]?.runtimeSkillState, {
    activeSkillIds: ['skill_pre'],
    loadedSkillIds: ['skill_pre'],
    unloadedSkillIds: ['skill_a'],
    availableSkillIds: ['skill_a', 'skill_pre'],
    omissions: [{
      skillId: 'skill_a',
      name: 'Skill A',
      stage: 'trigger_not_matched',
      reason: 'Workflow trigger did not match the current request/context.',
      dependencyIds: [],
      missingDependencyIds: [],
      inactiveDependencyIds: [],
      conflictSkillIds: [],
    }],
    sourceEventId: 'trace_0',
  })
  assert.deepEqual(view.promptDetails[0]?.contextLedgerState, {
    mutationCount: 1,
    mutationEventIds: ['trace_00'],
    latestMutationEventId: 'trace_00',
    latestMutationReason: 'initial brief loaded',
  })
  assert.deepEqual(view.runtimeSummary.tools.availableToolNames, ['tool_a'])
  assert.deepEqual(view.runtimeSummary.tools.usedToolNames, ['tool_a', 'tool_b'])
  assert.deepEqual(view.runtimeSummary.tools.failedToolNames, ['tool_b'])
  assert.deepEqual(view.runtimeSummary.tools.approvalRequiredToolNames, ['tool_c'])
  assert.deepEqual(view.runtimeSummary.tools.deniedToolNames, ['tool_d'])
  assert.deepEqual(view.runtimeSummary.tools.pendingApprovalToolNames, ['tool_a'])
  assert.equal(view.runtimeSummary.tools.sourceEventId, 'trace_1')
  assert.equal(view.runtimeSummary.context.promptEventId, 'trace_1')
  assert.equal(view.runtimeSummary.context.contextMutationCount, 2)
  assert.equal(view.runtimeSummary.context.latestMutationReason, 'knowledge refreshed')
  assert.deepEqual(view.runtimeSummary.context.historyProjection, {
    inputCount: 9,
    retainedCount: 6,
    compactedCount: 3,
    filteredCount: 1,
    summaryChars: 240,
    decisions: [{
      action: 'compact',
      stage: 'history_window',
      reason: 'Older transcript messages were summarized.',
      messageCount: 3,
      retainedCount: 6,
      summaryChars: 240,
      maxMessages: 6,
    }],
  })
  assert.equal(view.runtimeSummary.context.toolLoopProjection?.messageCount, 2)
  assert.equal(view.runtimeSummary.context.attachmentProjection?.inlineImageCount, 1)
  assert.equal(view.messageWrites[0]?.messageId, 'msg_1')
  assert.equal(view.messageWrites[0]?.contentHash, 'sha256:assistant')
  assert.equal(view.toolCalls.length, 2)
  assert.equal(view.toolCalls[0]?.resultHash, 'sha256:tool')
  assert.equal(view.toolCalls[0]?.refs[0]?.key, 'tool_result:call_1:sha256:tool')
  const laterContextMutation = view.contextMutations.find((mutation) => mutation.eventId === 'trace_7')
  assert.equal(laterContextMutation?.total, 2)
  assert.equal(laterContextMutation?.latest?.type, 'amend')
  assert.equal(laterContextMutation?.affectedContextKeys.includes('knowledge:storyboard.rhythm.basic:sha256:new'), true)
  assert.equal(laterContextMutation?.refs[0]?.key, 'knowledge:storyboard.rhythm.basic:sha256:new')
  assert.deepEqual((view.bundle.contextMutations as any[]).find((mutation) => mutation.eventId === 'trace_7')?.amendedContextKeys, [
    'knowledge:storyboard.rhythm.basic:sha256:new',
    'knowledge:storyboard.rhythm.basic:sha256:old',
  ])
  assert.equal(view.attentionEvents[0]?.eventId, 'trace_6')
  assert.deepEqual(view.pendingActions.map((action) => action.id), ['approval_1', 'input_1'])
  assert.equal(view.bundle.schema, 'movscript.agent-run-debug-bundle.v1')
  assert.match(view.reportText, /AgentRun 调试摘要/)
})

test('buildRuntimeTraceDebugView summarizes OpenAI Responses sdk_body payloads', () => {
  const run = makeRun()
  const sdkBody = {
    model: 'gpt-5.2',
    input: [{ role: 'user', content: 'hello responses' }],
    tools: [{ type: 'function', name: 'core_file_edit' }],
    tool_choice: 'auto',
  }
  const events: AgentTraceEvent[] = [
    trace('trace_req', 'model_call', 'Model HTTP request sent', {
      phase: 'request',
      request: {
        body: {
          model: 'gpt-5.2',
          messages: [{ role: 'user', content: 'hello responses' }],
          sdk_body: sdkBody,
        },
      },
    }),
    trace('trace_res', 'model_call', 'Model HTTP response received', {
      phase: 'response',
      response: { status: 200, ok: true },
      content_chars: 12,
    }),
  ]

  const view = buildRuntimeTraceDebugView({
    run,
    events,
    summary: {
      runId: run.id,
      total: events.length,
      byKind: { model_call: 2 },
      latestEvent: events.at(-1),
    },
    generatedAt: '2026-01-01T00:00:10.000Z',
  })

  assert.equal(view.modelCalls[0]?.model, 'gpt-5.2')
  assert.equal(view.modelCalls[0]?.messageCount, '1')
  assert.equal(view.modelCalls[0]?.toolCount, '1')
  assert.equal(view.modelCalls[0]?.hasRequestPayload, true)
  assert.equal(view.modelCalls[0]?.hasResponseBody, true)
  assert.equal(view.coverage.requestPayloadsLabel, '1')
  assert.equal(view.coverage.httpResponseBodiesLabel, '1')
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

import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMessage, AgentPlanRevision, AgentRun, AgentRuntimeStatusRecord, AgentThread, AgentTraceEvent } from '../../state/shared/types.js'
import { buildRuntimeTimelineItems, timelineItemFromRuntimeSignal } from './timelineProjection.js'

test('buildRuntimeTimelineItems projects plan revisions and runtime status records without exposing prompt eligibility controls in meta', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      planRevisions: [planRevision()],
      runtimeStatuses: [runtimeStatusRecord({ runId: 'run_2' })],
      messages: [],
    }],
    runs: [
      run({ id: 'run_1' }),
      run({ id: 'run_2', updatedAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })

  const plan = timeline.find((message) => message.id === 'plan:plan_revision_1')
  const status = timeline.find((message) => message.id === 'runtime-status:status_1')
  assert.equal(plan?.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(plan?.origin, 'system_runtime')
  assert.equal(plan?.purpose, 'status')
  assert.equal(plan?.surface, 'status_strip')
  assert.equal(plan?.contentPromptEligibility, 'exclude')
  assert.equal(plan?.runtimeRefs.messageId, undefined)
  assert.equal(plan?.runtimeRefs.runId, 'run_1')
  assert.equal((plan?.meta as Record<string, unknown> | undefined)?.promptEligibility, undefined)
  assert.equal(plan?.activity, undefined)
  assert.equal(status?.meta?.runtimeStatus?.kind, 'async_work_handoff')
  assert.equal(status?.meta?.runtimeStatus?.workId, 'work_1')
  assert.equal(status?.id, 'runtime-status:status_1')
  assert.equal(status?.origin, 'system_runtime')
  assert.equal(status?.purpose, 'status')
  assert.equal(status?.surface, 'status_strip')
  assert.equal(status?.contentPromptEligibility, 'exclude')
  assert.equal(status?.runtimeRefs.messageId, undefined)
  assert.equal((status?.meta as Record<string, unknown> | undefined)?.promptEligibility, undefined)
  assert.equal(status?.activity, undefined)
})

test('timelineItemFromRuntimeSignal projects runtime trace events as status activity', () => {
  const trace = traceEvent({
    data: {
      generation: {
        jobId: 42,
        status: 'running',
        stage: 'running',
        progress: 20,
        terminal: false,
        message: '生成任务 #42 仍在运行。',
      },
    },
  })
  const item = timelineItemFromRuntimeSignal({
    type: 'trace',
    threadId: 'thread_1',
    runId: 'run_1',
    event: trace,
  }, {
    thread: thread(),
    run: run({ status: 'in_progress', completedAt: undefined, updatedAt: '2026-05-19T00:00:02.000Z' }),
    traceEvents: [trace],
  })

  assert.equal(item?.id, 'run-activity:run_1')
  assert.equal(item?.origin, 'system_runtime')
  assert.equal(item?.purpose, 'status')
  assert.equal(item?.surface, 'status_strip')
  assert.equal(item?.contentPromptEligibility, 'exclude')
  assert.equal(item?.activity?.runId, 'run_1')
  const generation = item?.activity?.events[0]?.data?.generation as Record<string, unknown> | undefined
  assert.equal(generation?.jobId, 42)
  assert.equal(item?.status, 'streaming')
})

test('timelineItemFromRuntimeSignal projects update-plan traces as plan status items', () => {
  const item = timelineItemFromRuntimeSignal({
    type: 'trace',
    threadId: 'thread_1',
    runId: 'run_1',
    event: traceEvent({
      id: 'trace_plan',
      toolName: 'core_update_plan',
      title: 'Tool completed: core_update_plan',
    }),
  }, {
    thread: thread({ planRevisions: [planRevision()] }),
    run: run({ id: 'run_1' }),
  })

  assert.equal(item?.id, 'plan:plan_revision_1')
  assert.equal(item?.origin, 'system_runtime')
  assert.equal(item?.purpose, 'status')
  assert.equal(item?.surface, 'status_strip')
  assert.equal(item?.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(item?.activity, undefined)
})

test('buildRuntimeTimelineItems keeps plan status separate from final assistant messages in the same run', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      planRevisions: [planRevision({
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          runId: 'run_1',
          items: [{ step: 'Generate', status: 'in_progress' }],
          completedCount: 0,
          totalCount: 1,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
      })],
      messages: [
        message({
          id: 'msg_final',
          content: '完成。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:01.000Z',
        }),
      ],
    }],
    runs: [run({ id: 'run_1', assistantMessageId: 'msg_final', updatedAt: '2026-05-19T00:00:01.000Z' })],
  })

  assert.deepEqual(timeline.map((message) => message.id), ['plan:plan_revision_1', 'assistant:run_1'])
  assert.equal(timeline[0]?.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(timeline[0]?.activity, undefined)
  assert.equal(timeline[1]?.content, '完成。')
  assert.equal(timeline[1]?.origin, 'agent')
  assert.equal(timeline[1]?.purpose, 'transcript')
  assert.equal(timeline[1]?.surface, 'message_stream')
  assert.equal(timeline[1]?.contentPromptEligibility, 'include')
  assert.equal(timeline[1]?.activity?.runId, 'run_1')
})

test('buildRuntimeTimelineItems preserves completed-with-warnings timeline status', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      messages: [message({ id: 'msg_final', runId: 'run_1' })],
    }],
    runs: [run({ id: 'run_1', assistantMessageId: 'msg_final', status: 'completed_with_warnings', warnings: ['partial output'] })],
  })

  assert.equal(timeline.find((item) => item.id === 'assistant:run_1')?.status, 'completed_with_warnings')
})

test('buildRuntimeTimelineItems projects context diagnostics from thread records', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      contextDiagnostics: [{
        id: 'ctx_1',
        threadId: 'thread_1',
        runId: 'run_1',
        command: '/context',
        content: 'Model gateway messages:\n\n--- message 1: system ---\nSystem prompt',
        diagnostic: {
          schema: 'movscript.local_context_diagnostic.v1',
          modelGatewayCalled: false,
          messages: [{ role: 'system', content: 'System prompt' }],
          debugParts: [],
          tools: {
            available: [],
            blocked: [],
            discoveredCount: 0,
            modelTools: [],
          },
          skills: [],
          warnings: [],
        },
        createdAt: '2026-05-19T00:00:00.000Z',
      }],
    }],
    runs: [run({
      id: 'run_1',
      updatedAt: '2026-05-19T00:00:01.000Z',
    })],
  })

  assert.equal(timeline.length, 1)
  assert.equal(timeline[0]?.id, 'context:ctx_1')
  assert.equal(timeline[0]?.runtimeRefs.messageId, undefined)
  assert.equal(timeline[0]?.runtimeRefs.runId, 'run_1')
  assert.equal(timeline[0]?.purpose, 'diagnostic')
  assert.equal(timeline[0]?.surface, 'debug_panel')
  assert.equal(timeline[0]?.contentPromptEligibility, 'exclude')
  assert.equal(timeline[0]?.meta?.contextDiagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(timeline[0]?.meta?.contextDiagnostic?.modelGatewayCalled, false)
  assert.equal(timeline[0]?.meta?.contextDiagnostic?.messages[0]?.content, 'System prompt')
})

test('buildRuntimeTimelineItems attaches run activity only to final assistant messages', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      runtimeStatuses: [runtimeStatusRecord({ runId: 'run_1', createdAt: '2026-05-19T00:00:00.000Z' })],
      messages: [
        message({
          id: 'msg_final',
          content: '完成。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:01.000Z',
        }),
      ],
    }],
    runs: [run({
      id: 'run_1',
      assistantMessageId: 'msg_final',
      updatedAt: '2026-05-19T00:00:02.000Z',
      pendingApprovals: [{
        id: 'approval_1',
        runId: 'run_1',
        toolName: 'generation_job_create',
        reason: 'Needs confirmation',
        status: 'approved',
        args: { prompt: 'SECRET_APPROVAL_ARGS_SHOULD_NOT_BE_IN_FEED' },
        preview: { body: 'SECRET_APPROVAL_PREVIEW_SHOULD_NOT_BE_IN_FEED' },
        createdAt: '2026-05-19T00:00:00.200Z',
        updatedAt: '2026-05-19T00:00:00.300Z',
      }],
      steps: [{
        id: 'step_tool',
        runId: 'run_1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        args: { prompt: 'SECRET_TOOL_ARGS_SHOULD_NOT_BE_IN_FEED' },
        result: { secret: 'SECRET_TOOL_RESULT_SHOULD_ONLY_BE_ON_FINAL_ACTIVITY' },
        createdAt: '2026-05-19T00:00:00.500Z',
        completedAt: '2026-05-19T00:00:00.800Z',
      }],
      traceEvents: [{
        id: 'trace_generation',
        runId: 'run_1',
        kind: 'tool_call',
        title: 'Generation progress',
        status: 'completed',
        toolName: 'core_work_start',
        data: {
          args: { secret: 'SECRET_TRACE_ARGS_SHOULD_NOT_BE_IN_FEED' },
          result: { secret: 'SECRET_TRACE_RESULT_SHOULD_NOT_BE_IN_FEED' },
          generation: {
            jobId: 42,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 420,
            outputResources: [{ id: 420, url: 'SECRET_RESOURCE_URL_SHOULD_NOT_BE_IN_FEED' }],
          },
        },
        createdAt: '2026-05-19T00:00:00.600Z',
        completedAt: '2026-05-19T00:00:00.900Z',
      }],
    })],
  })

  const status = timeline.find((message) => message.id === 'runtime-status:status_1')
  const final = timeline.find((message) => message.runtimeRefs.messageId === 'msg_final')
  assert.equal(status?.runtimeRefs.messageId, undefined)
  assert.equal(status?.id, 'runtime-status:status_1')
  assert.equal(final?.id, 'assistant:run_1')
  assert.equal(status?.activity, undefined)
  assert.equal(JSON.stringify(status).includes('SECRET_TOOL_RESULT_SHOULD_ONLY_BE_ON_FINAL_ACTIVITY'), false)
  assert.ok(final?.activity)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_TOOL_ARGS_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_TOOL_RESULT_SHOULD_ONLY_BE_ON_FINAL_ACTIVITY'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_TRACE_ARGS_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_TRACE_RESULT_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_RESOURCE_URL_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_APPROVAL_ARGS_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(JSON.stringify(final.activity).includes('SECRET_APPROVAL_PREVIEW_SHOULD_NOT_BE_IN_FEED'), false)
  assert.equal(final.activity.approvals?.[0]?.toolName, 'generation_job_create')
  assert.equal(final.activity.approvals?.[0]?.reason, 'Needs confirmation')
  assert.equal(Object.prototype.hasOwnProperty.call(final.activity.approvals?.[0] ?? {}, 'args'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(final.activity.approvals?.[0] ?? {}, 'preview'), false)
  assert.equal(final.activity.steps[0]?.toolName, 'core_work_start')
  assert.equal(Object.prototype.hasOwnProperty.call(final.activity.steps[0] ?? {}, 'args'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(final.activity.steps[0] ?? {}, 'result'), false)
  assert.deepEqual(final.activity.events[0]?.data, {
    generation: {
      jobId: 42,
      status: 'succeeded',
      stage: 'completed',
      progress: 100,
      terminal: true,
      outputResourceId: 420,
    },
  })
})

test('buildRuntimeTimelineItems orders same-timestamp source, assistant anchors, and final assistant messages semantically', () => {
  const timeline = buildRuntimeTimelineItems({
    threads: [{
      ...thread(),
      runtimeStatuses: [runtimeStatusRecord({ createdAt: '2026-05-19T00:00:00.000Z' })],
      messages: [
        message({
          id: 'msg_final',
          content: '完成。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
        }),
        message({
          id: 'msg_user',
          role: 'user',
          content: '开始任务',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
        }),
      ],
    }],
    runs: [run({
      id: 'run_1',
      input: {
        schema: 'movscript.agent.run-input.v1',
        userMessage: '开始任务',
        sourceMessageId: 'msg_user',
        executionMode: 'chat',
        createdAt: '2026-05-19T00:00:00.000Z',
      },
      assistantMessageId: 'msg_final',
      updatedAt: '2026-05-19T00:00:00.000Z',
    })],
  })

  assert.deepEqual(timeline.map((message) => message.id), [
    'message:msg_user',
    'runtime-status:status_1',
    'assistant:run_1',
  ])
  assert.deepEqual(timeline.map((message) => message.sortRank), [10, 20, 50])
})

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    status: 'idle',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function message(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'assistant',
    content: 'message',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

function runtimeStatusRecord(overrides: Partial<AgentRuntimeStatusRecord> = {}): AgentRuntimeStatusRecord {
  return {
    id: 'status_1',
    threadId: 'thread_1',
    runId: 'run_1',
    content: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
    status: {
      kind: 'async_work_handoff',
      title: '异步任务已提交',
      detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
      workId: 'work_1',
    },
    createdAt: '2026-05-19T00:00:01.000Z',
    ...overrides,
  }
}

function planRevision(overrides: Partial<AgentPlanRevision> = {}): AgentPlanRevision {
  return {
    schema: 'movscript.agent.plan-revision.v1',
    id: 'plan_revision_1',
    planId: 'plan_1',
    threadId: 'thread_1',
    runId: 'run_1',
    snapshot: {
      schema: 'movscript.agent.plan.v1',
      id: 'plan_1',
      threadId: 'thread_1',
      runId: 'run_1',
      items: [{ step: 'Generate', status: 'completed' }],
      completedCount: 1,
      totalCount: 1,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    completedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function traceEvent(overrides: Partial<AgentTraceEvent> = {}): AgentTraceEvent {
  return {
    id: 'trace_1',
    runId: 'run_1',
    kind: 'tool_call',
    title: 'Generation progress',
    status: 'completed',
    toolName: 'generation_job_get',
    createdAt: '2026-05-19T00:00:01.000Z',
    completedAt: '2026-05-19T00:00:02.000Z',
    ...overrides,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMessage, AgentRun, AgentThread } from '../../state/shared/types.js'
import { buildRuntimeFeedMessages } from './messageFeed.js'

test('buildRuntimeFeedMessages preserves supported UI metadata without exposing prompt-history controls', () => {
  const feed = buildRuntimeFeedMessages({
    threads: [{
      ...thread(),
      messages: [
        message({
          id: 'msg_plan',
          content: 'Plan updated',
          runId: 'run_1',
          metadata: {
            kind: 'plan_revision',
            promptHistory: 'exclude',
            planRevision: {
              schema: 'movscript.agent.plan-revision.v1',
              id: 'plan_revision_1',
              planId: 'plan_1',
              threadId: 'thread_1',
              snapshot: {
                schema: 'movscript.agent.plan.v1',
                id: 'plan_1',
                threadId: 'thread_1',
                items: [{ step: 'Generate', status: 'completed' }],
                completedCount: 1,
                totalCount: 1,
                createdAt: '2026-05-19T00:00:00.000Z',
                updatedAt: '2026-05-19T00:00:00.000Z',
              },
              createdAt: '2026-05-19T00:00:00.000Z',
            },
          },
        }),
        message({
          id: 'msg_status',
          content: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
          runId: 'run_2',
          createdAt: '2026-05-19T00:00:01.000Z',
          metadata: {
            kind: 'runtime_status',
            promptHistory: 'exclude',
            runtimeStatus: {
              kind: 'async_work_handoff',
              title: '异步任务已提交',
              detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
              workId: 'work_1',
            },
          },
        }),
      ],
    }],
    runs: [
      run({ id: 'run_1' }),
      run({ id: 'run_2', assistantMessageId: 'msg_status', updatedAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })

  const plan = feed.find((message) => message.runtimeRefs.messageId === 'msg_plan')
  const status = feed.find((message) => message.runtimeRefs.messageId === 'msg_status')
  assert.equal(plan?.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(plan?.id, 'message:msg_plan')
  assert.equal((plan?.meta as Record<string, unknown> | undefined)?.promptHistory, undefined)
  assert.equal(plan?.activity, undefined)
  assert.equal(status?.meta?.runtimeStatus?.kind, 'async_work_handoff')
  assert.equal(status?.meta?.runtimeStatus?.workId, 'work_1')
  assert.equal(status?.id, 'message:msg_status')
  assert.equal((status?.meta as Record<string, unknown> | undefined)?.promptHistory, undefined)
  assert.equal(status?.activity, undefined)
})

test('buildRuntimeFeedMessages keeps non-final assistant anchors separate from final assistant messages in the same run', () => {
  const feed = buildRuntimeFeedMessages({
    threads: [{
      ...thread(),
      messages: [
        message({
          id: 'msg_plan',
          content: 'Plan updated',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
          metadata: {
            kind: 'plan_revision',
            promptHistory: 'exclude',
            planRevision: {
              schema: 'movscript.agent.plan-revision.v1',
              id: 'plan_revision_1',
              planId: 'plan_1',
              threadId: 'thread_1',
              snapshot: {
                schema: 'movscript.agent.plan.v1',
                id: 'plan_1',
                threadId: 'thread_1',
                items: [{ step: 'Generate', status: 'in_progress' }],
                completedCount: 0,
                totalCount: 1,
                createdAt: '2026-05-19T00:00:00.000Z',
                updatedAt: '2026-05-19T00:00:00.000Z',
              },
              createdAt: '2026-05-19T00:00:00.000Z',
            },
          },
        }),
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

  assert.deepEqual(feed.map((message) => message.id), ['message:msg_plan', 'assistant:run_1'])
  assert.equal(feed[0]?.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(feed[0]?.activity, undefined)
  assert.equal(feed[1]?.content, '完成。')
  assert.equal(feed[1]?.activity?.runId, 'run_1')
})

test('buildRuntimeFeedMessages projects context diagnostic metadata for local context commands', () => {
  const feed = buildRuntimeFeedMessages({
    threads: [{
      ...thread(),
      messages: [
        message({
          id: 'msg_context',
          content: 'Model gateway messages:\n\n--- message 1: system ---\nSystem prompt',
          runId: 'run_1',
          metadata: {
            contextDiagnostic: {
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
          },
        }),
      ],
    }],
    runs: [run({
      id: 'run_1',
      assistantMessageId: 'msg_context',
      updatedAt: '2026-05-19T00:00:01.000Z',
    })],
  })

  assert.equal(feed.length, 1)
  assert.equal(feed[0]?.runtimeRefs.messageId, 'msg_context')
  assert.equal(feed[0]?.meta?.contextDiagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(feed[0]?.meta?.contextDiagnostic?.modelGatewayCalled, false)
  assert.equal(feed[0]?.meta?.contextDiagnostic?.messages[0]?.content, 'System prompt')
})

test('buildRuntimeFeedMessages attaches run activity only to final assistant messages', () => {
  const feed = buildRuntimeFeedMessages({
    threads: [{
      ...thread(),
      messages: [
        message({
          id: 'msg_status',
          content: '异步任务已提交。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
          metadata: {
            kind: 'runtime_status',
            promptHistory: 'exclude',
            runtimeStatus: {
              kind: 'async_work_handoff',
              title: '异步任务已提交',
              detail: '异步任务已提交。',
              workId: 'work_1',
            },
          },
        }),
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

  const status = feed.find((message) => message.runtimeRefs.messageId === 'msg_status')
  const final = feed.find((message) => message.runtimeRefs.messageId === 'msg_final')
  assert.equal(status?.id, 'message:msg_status')
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
  assert.equal(final.activity.approvals?.[0]?.args, undefined)
  assert.equal(final.activity.approvals?.[0]?.preview, undefined)
  assert.equal(final.activity.steps[0]?.toolName, 'core_work_start')
  assert.equal(final.activity.steps[0]?.args, undefined)
  assert.equal(final.activity.steps[0]?.result, undefined)
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

test('buildRuntimeFeedMessages orders same-timestamp source, assistant anchors, and final assistant messages semantically', () => {
  const feed = buildRuntimeFeedMessages({
    threads: [{
      ...thread(),
      messages: [
        message({
          id: 'msg_final',
          content: '完成。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
        }),
        message({
          id: 'msg_status',
          content: '异步任务已提交。',
          runId: 'run_1',
          createdAt: '2026-05-19T00:00:00.000Z',
          metadata: {
            kind: 'runtime_status',
            promptHistory: 'exclude',
            runtimeStatus: {
              kind: 'async_work_handoff',
              title: '异步任务已提交',
              detail: '异步任务已提交。',
            },
          },
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

  assert.deepEqual(feed.map((message) => message.id), [
    'message:msg_user',
    'message:msg_status',
    'assistant:run_1',
  ])
  assert.deepEqual(feed.map((message) => message.cursor.split(':')[1]), ['10', '20', '30'])
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

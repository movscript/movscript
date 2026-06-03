import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isRuntimeAsyncWorkHandoffRun,
  isRuntimeEmptyAssistantPlaceholder,
  runtimeStatusMessageFromRunActivity,
} from '@/features/agent/domain/agentRuntimeStatusMessage'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'

test('runtimeStatusMessageFromRunActivity turns core work starts into runtime handoff messages', () => {
  const status = runtimeStatusMessageFromRunActivity({
    activity: activity({
      steps: [{
        id: 'step_1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
      events: [{
        id: 'event_1',
        kind: 'tool_call',
        title: 'Runtime work started',
        status: 'completed',
        toolName: 'core_work_start',
        data: { runtimeWork: { id: 'work_1', kind: 'generation_job', status: 'running' } },
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
    }),
  })

  assert.equal(status?.kind, 'async_work_handoff')
  assert.equal(status?.title, '异步任务已提交')
  assert.equal(status?.workId, 'work_1')
  assert.equal(status?.workKind, 'generation_job')
  assert.equal(status?.workStatus, 'running')
  assert.match(status?.detail ?? '', /继续发送消息/)
})

test('isRuntimeEmptyAssistantPlaceholder detects empty runtime placeholders', () => {
  assert.equal(isRuntimeEmptyAssistantPlaceholder('（无内容）'), true)
  assert.equal(isRuntimeEmptyAssistantPlaceholder('这是 agent 的真实回复'), false)
})

test('isRuntimeAsyncWorkHandoffRun only unlocks terminal core work handoff runs', () => {
  assert.equal(isRuntimeAsyncWorkHandoffRun(run({ status: 'completed' })), true)
  assert.equal(isRuntimeAsyncWorkHandoffRun(run({ status: 'in_progress' })), false)
  assert.equal(isRuntimeAsyncWorkHandoffRun({ ...run({ status: 'completed' }), steps: [] }), false)
})

function activity(overrides: Partial<ChatRunActivity> = {}): ChatRunActivity {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [{
      id: 'step_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
    events: [],
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: true,
    },
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      args: { kind: 'generation_job' },
      result: { workId: 'work_1', status: 'started' },
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
    ...overrides,
  }
}

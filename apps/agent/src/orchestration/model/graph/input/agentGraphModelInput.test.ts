import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMessage, AgentRun } from '../../../../state/shared/types.js'
import { prepareModelInput } from './agentGraphModelInput.js'

test('prepareModelInput keeps old runtime activity/status out of the next run prompt history', () => {
  const prepared = prepareModelInput({
    run: makeRun({
      id: 'run_2',
      metadata: { limits: { maxHistoryMessages: 10 } },
    }),
    threadMessages: [
      message({ id: 'u1', role: 'user', content: '生成一张图' }),
      message({
        id: 'a_status',
        role: 'assistant',
        content: 'SECRET_TOOL_RESULT_BODY generation_job work work_1已提交。',
        runId: 'run_1',
        metadata: {
          kind: 'runtime_status',
          runtimeStatus: {
            kind: 'async_work_handoff',
            title: '异步任务已提交',
            detail: 'SECRET_TOOL_RESULT_BODY',
            workId: 'work_1',
          },
        },
      }),
      message({
        id: 'a_activity',
        role: 'assistant',
        content: 'SECRET_ACTIVITY_TOOL_RESULT',
        runId: 'run_1',
        metadata: {
          localRunActivity: {
            runId: 'run_1',
            threadId: 'thread_1',
            status: 'completed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:01.000Z',
            steps: [{
              id: 'step_1',
              type: 'tool_call',
              status: 'completed',
              toolName: 'core_work_start',
              result: { secret: 'SECRET_ACTIVITY_TOOL_RESULT' },
              createdAt: '2026-01-01T00:00:00.000Z',
            }],
            events: [],
          },
        },
      }),
      message({ id: 'a_text', role: 'assistant', content: '自然语言答复', runId: 'run_1' }),
      message({ id: 'u2', role: 'user', content: '继续', runId: 'run_2' }),
    ],
    rootUserMessageId: 'u2',
    userMessage: '继续',
  })

  assert.ok(prepared)
  assert.deepEqual(prepared.promptHistory.messages.map((item) => item.id), ['u1', 'a_text'])
  assert.equal(prepared.promptHistory.filteredCount, 2)
  assert.equal(JSON.stringify(prepared.promptHistory).includes('SECRET_TOOL_RESULT_BODY'), false)
  assert.equal(JSON.stringify(prepared.promptHistory).includes('SECRET_ACTIVITY_TOOL_RESULT'), false)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 8, allowNetwork: false, allowFileBytes: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function message(overrides: Partial<AgentMessage>): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'message',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

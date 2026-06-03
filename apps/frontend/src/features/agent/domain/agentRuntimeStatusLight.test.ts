import assert from 'node:assert/strict'
import test from 'node:test'

import { runtimeStatusLightFromRuntimeStatusRecord } from '@/features/agent/domain/agentRuntimeStatusLight'
import type { AgentRuntimeStatusRecord } from '@/shared/infrastructure/localAgentClient'

test('runtimeStatusLightFromRuntimeStatusRecord reads runtime pushed status lights', () => {
  const light = runtimeStatusLightFromRuntimeStatusRecord(statusRecord({
    kind: 'status_light',
    state: 'active',
    label: '运行',
    detail: 'Runtime 正在触发 run 循环。',
  }))

  assert.deepEqual(light, {
    state: 'active',
    label: '运行',
    detail: 'Runtime 正在触发 run 循环。',
  })
})

test('runtimeStatusLightFromRuntimeStatusRecord ignores non-light runtime statuses', () => {
  const light = runtimeStatusLightFromRuntimeStatusRecord({
    id: 'runtime-status:work_1',
    threadId: 'thread_1',
    runId: 'run_1',
    content: 'handoff',
    status: {
      kind: 'async_work_handoff',
      title: '等待后台任务',
      detail: '后台任务运行中。',
      workId: 'work_1',
      workKind: 'async_tool',
      workStatus: 'running',
    },
    createdAt: '2026-05-27T00:00:00.000Z',
  })

  assert.equal(light, undefined)
})

function statusRecord(status: AgentRuntimeStatusRecord['status']): AgentRuntimeStatusRecord {
  return {
    id: 'runtime-status-light:thread_1',
    threadId: 'thread_1',
    runId: 'run_1',
    content: status.detail,
    status,
    createdAt: '2026-05-27T00:00:00.000Z',
  }
}

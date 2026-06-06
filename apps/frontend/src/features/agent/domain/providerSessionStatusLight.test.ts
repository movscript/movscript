import assert from 'node:assert/strict'
import test from 'node:test'

import { providerSessionStatusLightFromStatusRecord } from '@/features/agent/domain/providerSessionStatusLight'
import type { ProviderSessionStatusRecord } from '@/shared/infrastructure/providerSessionClient'

test('providerSessionStatusLightFromStatusRecord reads provider-session status lights from protocol records', () => {
  const light = providerSessionStatusLightFromStatusRecord(statusRecord({
    kind: 'status_light',
    state: 'active',
    label: '运行',
    detail: 'Provider 会话正在触发 run 循环。',
  }))

  assert.deepEqual(light, {
    state: 'active',
    label: '运行',
    detail: 'Provider 会话正在触发 run 循环。',
  })
})

test('providerSessionStatusLightFromStatusRecord ignores non-light protocol status records', () => {
  const light = providerSessionStatusLightFromStatusRecord({
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

function statusRecord(status: ProviderSessionStatusRecord['status']): ProviderSessionStatusRecord {
  return {
    id: 'runtime-status-light:thread_1',
    threadId: 'thread_1',
    runId: 'run_1',
    content: status.detail,
    status,
    createdAt: '2026-05-27T00:00:00.000Z',
  }
}

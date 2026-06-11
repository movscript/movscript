import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  providerSessionStatusLightForTargetKeys,
  providerSessionStatusLightFromStatusRecord,
  providerSessionStatusLightPriority,
  selectProviderSessionStatusLight,
} from '../dist/agent/index.js'

test('core reads provider-session status-light records without frontend state', () => {
  assert.deepEqual(providerSessionStatusLightFromStatusRecord(statusRecord({
    kind: 'status_light',
    state: 'error',
    label: 'Error',
    detail: 'Provider session failed.',
  })), {
    state: 'error',
    label: 'Error',
    detail: 'Provider session failed.',
  })

  assert.equal(providerSessionStatusLightFromStatusRecord(statusRecord({
    kind: 'async_work_handoff',
    title: 'Waiting',
    detail: 'External work is running.',
    workId: 'work_1',
    workKind: 'async_tool',
    workStatus: 'running',
  })), undefined)
})

test('core selects the highest-priority provider-session status light', () => {
  const fallback = light('stopped')
  assert.equal(providerSessionStatusLightPriority(light('error')), 3)
  assert.equal(providerSessionStatusLightPriority(light('active')), 2)
  assert.equal(providerSessionStatusLightPriority(light('waiting')), 1)
  assert.equal(providerSessionStatusLightPriority(light('stopped')), 0)

  assert.equal(selectProviderSessionStatusLight([
    light('waiting'),
    light('active'),
    light('error'),
  ], fallback).state, 'error')

  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': light('stopped'),
    'thread:thread_1': light('active'),
  }, ['session:session_1', 'thread:thread_1'], fallback).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({}, ['session:missing'], fallback), fallback)
})

test('core provider-session status light logic stays free of frontend fallback copy', () => {
  const source = readFileSync(resolve('src/agent/providerSessionStatusLight.ts'), 'utf8')
  assert.doesNotMatch(source, /STOPPED_PROVIDER_SESSION_STATUS_LIGHT/)
  assert.doesNotMatch(source, /停止|Provider 会话当前不会自行触发新的 run/)
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})

function statusRecord(status) {
  return {
    id: 'runtime-status:thread_1',
    threadId: 'thread_1',
    runId: 'run_1',
    content: status.detail,
    status,
    createdAt: '2026-05-27T00:00:00.000Z',
  }
}

function light(state) {
  return {
    state,
    label: state,
    detail: `${state} detail`,
  }
}

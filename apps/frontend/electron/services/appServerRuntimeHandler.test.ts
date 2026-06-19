import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTransientAppServerThreadHistoryError,
  requestAppServerWithTransientHistoryRetry,
} from './appServerRuntimeHandler'

test('app-server runtime retries transient empty rollout history errors', async () => {
  const calls: Array<{ method: string; params?: unknown }> = []
  const connection = {
    async request(method: string, params?: unknown) {
      calls.push({ method, params })
      if (calls.length === 1) {
        throw new Error('codex-app-server app-server error: failed to load thread history for thread thread_1: thread-store internal error: failed to read thread /tmp/rollout.jsonl: rollout at /tmp/rollout.jsonl is empty')
      }
      return { ok: true }
    },
  }

  const response = await requestAppServerWithTransientHistoryRetry(connection, 'turn/start', { threadId: 'thread_1' }, [0])

  assert.deepEqual(response, { ok: true })
  assert.deepEqual(calls, [
    { method: 'turn/start', params: { threadId: 'thread_1' } },
    { method: 'turn/start', params: { threadId: 'thread_1' } },
  ])
})

test('app-server runtime does not retry unrelated request errors', async () => {
  const calls: string[] = []
  const connection = {
    async request(method: string) {
      calls.push(method)
      throw new Error('codex-app-server app-server error: provider credentials are missing')
    },
  }

  await assert.rejects(
    () => requestAppServerWithTransientHistoryRetry(connection, 'turn/start', undefined, [0]),
    /provider credentials are missing/,
  )
  assert.deepEqual(calls, ['turn/start'])
})

test('app-server empty rollout detection is intentionally narrow', () => {
  assert.equal(isTransientAppServerThreadHistoryError(new Error('failed to load thread history: rollout at /tmp/a.jsonl is empty')), true)
  assert.equal(isTransientAppServerThreadHistoryError(new Error('failed to load thread history: permission denied')), false)
  assert.equal(isTransientAppServerThreadHistoryError(new Error('rollout at /tmp/a.jsonl is empty')), false)
})

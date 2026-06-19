import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  isAppServerIncludeTurnsFallbackError,
  isAppServerThreadUnavailableForMutationError,
  isTransientAppServerThreadHistoryError,
  requestAppServerThreadSettingsUpdate,
  requestAppServerThreadRead,
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

test('app-server thread/read retries unmaterialized includeTurns before falling back to metadata', async () => {
  const calls: Array<{ method: string; params?: unknown }> = []
  const connection = {
    async request(method: string, params?: unknown) {
      calls.push({ method, params })
      if ((params as { includeTurns?: boolean } | undefined)?.includeTurns) {
        throw new Error('mova-app-server app-server error: thread thr_1 is not materialized yet; includeTurns is unavailable before first user message')
      }
      return { thread: { id: 'thr_1', turns: [] } }
    },
  }

  const response = await requestAppServerThreadRead(connection, 'thr_1', true, [0])

  assert.deepEqual(response, { thread: { id: 'thr_1', turns: [] } })
  assert.deepEqual(calls, [
    { method: 'thread/read', params: { threadId: 'thr_1', includeTurns: true } },
    { method: 'thread/read', params: { threadId: 'thr_1', includeTurns: true } },
    { method: 'thread/read', params: { threadId: 'thr_1', includeTurns: false } },
  ])
})

test('app-server thread/read falls back when includeTurns is unsupported for ephemeral threads', async () => {
  const calls: Array<{ method: string; params?: unknown }> = []
  const connection = {
    async request(method: string, params?: unknown) {
      calls.push({ method, params })
      if ((params as { includeTurns?: boolean } | undefined)?.includeTurns) {
        throw new Error('codex-app-server app-server error: ephemeral threads do not support includeTurns')
      }
      return { thread: { id: 'thr_ephemeral', turns: [] } }
    },
  }

  const response = await requestAppServerThreadRead(connection, 'thr_ephemeral', true, [0])

  assert.deepEqual(response, { thread: { id: 'thr_ephemeral', turns: [] } })
  assert.deepEqual(calls, [
    { method: 'thread/read', params: { threadId: 'thr_ephemeral', includeTurns: true } },
    { method: 'thread/read', params: { threadId: 'thr_ephemeral', includeTurns: false } },
  ])
})

test('app-server thread/settings/update resumes an unloaded thread before retrying', async () => {
  const calls: Array<{ method: string; params?: unknown }> = []
  const params: AgentRuntimeRpcRequestMap['thread/settings/update'] = {
    provider: { id: 'codex', kind: 'codex', label: 'Codex', enabled: true },
    runtime: { id: 'codex-codex-app-server', api: 'codex-app-server', label: 'Codex App Server' },
    threadId: 'thr_1',
    model: 'gpt-5',
  }
  const connection = {
    async request(method: string, params?: unknown) {
      calls.push({ method, params })
      if (method === 'thread/settings/update' && calls.filter((call) => call.method === method).length === 1) {
        throw new Error('codex-app-server app-server error: thread not found: thr_1')
      }
      return method === 'thread/resume' ? { thread: { id: 'thr_1' } } : { ok: true }
    },
  }

  const response = await requestAppServerThreadSettingsUpdate(connection, params, { workspaceDir: '/tmp/movscript-workspace' })

  assert.deepEqual(response, { ok: true })
  assert.deepEqual(calls.map((call) => call.method), [
    'thread/settings/update',
    'thread/resume',
    'thread/settings/update',
  ])
  assert.equal((calls[1]?.params as { threadId?: string } | undefined)?.threadId, 'thr_1')
})

test('app-server history error detection is intentionally narrow', () => {
  assert.equal(isTransientAppServerThreadHistoryError(new Error('failed to load thread history: rollout at /tmp/a.jsonl is empty')), true)
  assert.equal(isTransientAppServerThreadHistoryError(new Error('thread thr_1 is not materialized yet; includeTurns is unavailable before first user message')), true)
  assert.equal(isTransientAppServerThreadHistoryError(new Error('failed to load thread history: permission denied')), false)
  assert.equal(isTransientAppServerThreadHistoryError(new Error('rollout at /tmp/a.jsonl is empty')), false)
  assert.equal(isAppServerIncludeTurnsFallbackError(new Error('ephemeral threads do not support includeTurns')), true)
  assert.equal(isAppServerIncludeTurnsFallbackError(new Error('thread not loaded: thr_1')), false)
  assert.equal(isAppServerThreadUnavailableForMutationError(new Error('thread not found: thr_1')), true)
  assert.equal(isAppServerThreadUnavailableForMutationError(new Error('thread not loaded: thr_1')), true)
  assert.equal(isAppServerThreadUnavailableForMutationError(new Error('provider credentials are missing')), false)
})

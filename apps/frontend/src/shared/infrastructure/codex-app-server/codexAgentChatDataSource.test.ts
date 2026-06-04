import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexAgentChatDataSource } from '@/shared/infrastructure/codex-app-server/codexAgentChatDataSource'
import type { CodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'

test('Codex Agent data source maps provider-neutral thread lifecycle operations to app-server requests', async () => {
  const requests: Array<{ method: string; params: unknown }> = []
  const client = {
    requestProtocol: async (method: string, params: unknown) => {
      requests.push({ method, params })
      return { thread: codexThread({ name: method }) }
    },
  } as unknown as CodexAppServerRpcClient

  const dataSource = createCodexAgentChatDataSource(client)
  const renamed = await dataSource.renameThread?.({ threadId: 'thread_1', name: 'Renamed' })
  await dataSource.archiveThread?.({ threadId: 'thread_1' })
  await dataSource.unarchiveThread?.({ threadId: 'thread_1' })

  assert.equal(renamed && typeof renamed === 'object' && 'provider' in renamed ? renamed.provider : null, 'codex')
  assert.deepEqual(requests, [
    { method: 'thread/name/set', params: { threadId: 'thread_1', name: 'Renamed' } },
    { method: 'thread/archive', params: { threadId: 'thread_1' } },
    { method: 'thread/unarchive', params: { threadId: 'thread_1' } },
  ])
})

function codexThread(patch: Record<string, unknown> = {}) {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    preview: 'hello',
    name: null,
    createdAt: 1,
    updatedAt: 2,
    status: { type: 'idle' },
    turns: [],
    ...patch,
  }
}

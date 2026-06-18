import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import {
  agentRuntimeDataSourceFactories,
  agentRuntimeDataSourceFactoryForProvider,
  registerAgentRuntimeDataSourceFactory,
} from '@/features/agent/application/agentRuntimeDataSourceRegistry'

test('runtime data source registry registers and unregisters SDK factories', () => {
  const factory = () => fakeDataSource()
  const unregister = registerAgentRuntimeDataSourceFactory('codex-sdk', factory)

  assert.equal(agentRuntimeDataSourceFactories()['codex-sdk'], factory)
  assert.equal(agentRuntimeDataSourceFactoryForProvider('codex-sdk', 'codex'), factory)

  unregister()
  assert.equal(agentRuntimeDataSourceFactories()['codex-sdk'], undefined)
})

test('runtime data source registry rejects non-SDK runtime APIs', () => {
  assert.throws(
    () => registerAgentRuntimeDataSourceFactory('app-server', () => fakeDataSource()),
    /not SDK-backed/,
  )
})

test('runtime data source registry lets call sites override registered factories', () => {
  const registered = () => fakeDataSource('registered')
  const override = () => fakeDataSource('override')
  const unregister = registerAgentRuntimeDataSourceFactory('claude-sdk', registered)

  assert.equal(agentRuntimeDataSourceFactoryForProvider('claude-sdk', 'claude'), registered)
  assert.equal(agentRuntimeDataSourceFactoryForProvider('claude-sdk', 'claude', {
    'claude-sdk': override,
  }), override)

  unregister()
})

test('runtime data source registry hides unsupported provider/runtime pairs', () => {
  const factory = () => fakeDataSource()
  const unregister = registerAgentRuntimeDataSourceFactory('claude-sdk', factory)

  assert.equal(agentRuntimeDataSourceFactoryForProvider('claude-sdk', 'codex'), undefined)

  unregister()
})

function fakeDataSource(label = 'runtime'): AgentChatDataSource {
  return {
    provider: 'codex',
    label,
    async listThreads() {
      return { threads: [] }
    },
    async readThread() {
      throw new Error('not implemented')
    },
    async startThread() {
      throw new Error('not implemented')
    },
    async startTextTurn() {
      throw new Error('not implemented')
    },
  }
}

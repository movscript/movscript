import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatDataSource } from '@/features/agent/domain/agentChatProtocol'
import type { AgentProviderConfig } from '@/features/agent/state/agentProviderConfigStore'
import {
  failedAgentChatCapabilityProbeResult,
  probeAgentChatDataSourceCapabilities,
} from '@/features/agent/application/agentChatCapabilityProbe'

const codexProvider: AgentProviderConfig = {
  id: 'codex',
  kind: 'codex',
  label: 'Codex',
  enabled: true,
  codexProfile: {
    id: 'codex-movscript-home',
    label: 'Codex',
    codexHome: '.movscript/.codex',
    lifecycle: 'movscript-owned',
  },
}

test('probes provider-neutral agent data-source capabilities without leaking Codex protocol types into UI', async () => {
  const requestedMethods: string[] = []
  const dataSource: AgentChatDataSource = {
    provider: 'codex',
    label: 'Codex app-server',
    listThreads: async () => {
      requestedMethods.push('thread/list')
      return { threads: [], nextCursor: null }
    },
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
    subscribeThread: () => undefined,
    capabilities: {
      command: {
        exec: async () => ({ processId: 'p1' }),
      },
      fs: {
        readFile: async () => ({ dataBase64: '' }),
        writeFile: async () => ({}),
      },
      mcp: {
        listServers: async () => {
          requestedMethods.push('mcpServerStatus/list')
          return { servers: [{ name: 'filesystem' }] }
        },
        readResource: async () => ({}),
        callTool: async () => ({}),
      },
      plugins: {
        list: async () => {
          requestedMethods.push('plugin/list')
          return { plugins: [{ name: 'docs' }] }
        },
      },
      skills: {
        list: async () => {
          requestedMethods.push('skills/list')
          return { skills: [{ name: 'review' }] }
        },
      },
      models: {
        list: async () => {
          requestedMethods.push('model/list')
          return { models: ['gpt-5'] }
        },
      },
      config: {
        read: async () => {
          requestedMethods.push('config/read')
          return { config: {} }
        },
        listPermissionProfiles: async () => {
          requestedMethods.push('permissionProfile/list')
          return { permissionProfiles: ['default'] }
        },
      },
      account: {
        read: async () => {
          requestedMethods.push('account/read')
          return { account: { plan: 'plus' } }
        },
        readRateLimits: async () => {
          requestedMethods.push('account/rateLimits/read')
          return { limits: [{ id: 'codex' }] }
        },
      },
      realtime: {
        supported: true,
        listVoices: async () => {
          requestedMethods.push('thread/realtime/listVoices')
          return { voices: { v1: ['alloy'], v2: ['alloy'] } }
        },
        start: async () => ({}),
        appendAudio: async () => ({}),
        appendText: async () => ({}),
        stop: async () => ({}),
      },
    },
  }

  const result = await probeAgentChatDataSourceCapabilities({ provider: codexProvider, dataSource })

  assert.equal(result.providerId, 'codex')
  assert.equal(result.providerKind, 'codex')
  assert.equal(result.dataSourceLabel, 'Codex app-server')
  assert.equal(result.ok, true)
  assert.equal(result.items.find((item) => item.id === 'command-exec')?.detail, '已实现命令/终端流入口；探针不会主动执行命令。')
  assert.equal(result.items.find((item) => item.id === 'filesystem')?.detail, '已实现文件系统流入口；探针不会主动读取路径。')
  assert.deepEqual(requestedMethods.sort(), [
    'account/rateLimits/read',
    'account/read',
    'config/read',
    'mcpServerStatus/list',
    'model/list',
    'permissionProfile/list',
    'plugin/list',
    'skills/list',
    'thread/list',
    'thread/realtime/listVoices',
  ].sort())
})

test('marks missing or failing capabilities as warnings without blocking other probes', async () => {
  const movscriptProvider: AgentProviderConfig = {
    id: 'movscript-agent',
    kind: 'movscript-agent',
    label: 'MovScript Agent',
    enabled: true,
  }
  const dataSource: AgentChatDataSource = {
    provider: 'movscript',
    label: 'MovScript Agent',
    listThreads: async () => ({ threads: [], nextCursor: null }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
    capabilities: {
      plugins: {
        list: async () => { throw new Error('catalog unavailable') },
      },
      skills: {
        list: async () => ({ skills: [] }),
      },
      config: {
        read: async () => ({ config: {} }),
      },
    },
  }

  const result = await probeAgentChatDataSourceCapabilities({ provider: movscriptProvider, dataSource })

  assert.equal(result.ok, false)
  assert.equal(result.items.find((item) => item.id === 'plugins')?.tone, 'action')
  assert.equal(result.items.find((item) => item.id === 'plugins')?.error, 'catalog unavailable')
  assert.equal(result.items.find((item) => item.id === 'command-exec')?.tone, 'warning')
  assert.equal(result.items.find((item) => item.id === 'skills')?.tone, 'ready')
})

test('builds a failed probe result when a provider data source cannot be created', () => {
  const result = failedAgentChatCapabilityProbeResult({
    provider: codexProvider,
    error: new Error('Codex app-server failed to start'),
  })

  assert.equal(result.ok, false)
  assert.equal(result.warningCount, 1)
  assert.equal(result.items[0]?.method, 'createAgentChatDataSourceForProvider')
  assert.equal(result.items[0]?.detail, 'Codex app-server failed to start')
})

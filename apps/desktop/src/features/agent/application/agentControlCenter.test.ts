import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inspectAgentControlDataSourceCapabilities,
  summarizeAgentControlCapabilityHealth,
} from './agentControlCenter'
import type { AgentChatDataSource } from '@movscript/agent-chat'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('agent control capability health counts tools, skills, and plugins from provider responses', async () => {
  let pluginListCalled = false
  const health = await inspectAgentControlDataSourceCapabilities(providerFixture(), {
    provider: 'codex',
    label: 'Codex',
    capabilities: {
      command: {
        exec: async () => ({}),
      },
      fs: {
        readFile: async () => ({}),
        writeFile: async () => ({}),
      },
      mcp: {
        listServers: async () => ({
          servers: [
            { name: 'filesystem', tools: { read_file: {}, write_file: {} } },
            { name: 'browser', tools: [{ name: 'open' }] },
          ],
        }),
        readResource: async () => ({}),
        callTool: async () => ({}),
      },
      plugins: {
        installed: async () => ({ installed: [{ name: 'movscript' }, { name: 'docs' }] }),
        list: async () => {
          pluginListCalled = true
          throw new Error('plugin/list must not be used by passive health checks')
        },
      },
      skills: {
        list: async () => ({
          items: [
            { cwd: '/workspace', skills: [{ name: 'generation' }, { name: 'project' }] },
            { cwd: '/shared', skills: [{ name: 'documents' }] },
          ],
        }),
      },
    },
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource)

  assert.equal(health.ok, true)
  assert.equal(health.toolCount, 5)
  assert.equal(health.mcpServerCount, 2)
  assert.equal(health.mcpToolCount, 3)
  assert.equal(health.pluginCount, 2)
  assert.equal(health.skillCount, 3)
  assert.equal(pluginListCalled, false)

  const summary = summarizeAgentControlCapabilityHealth([health], 1)
  assert.equal(summary.toolSummary.available, 5)
  assert.equal(summary.skillSummary.enabled, 3)
  assert.equal(summary.pluginSummary.enabled, 2)
  assert.equal(summary.warningCount, 0)
})

test('agent control capability health treats absent optional SDK capability surfaces as empty', async () => {
  const health = await inspectAgentControlDataSourceCapabilities(providerFixture(), {
    provider: 'codex',
    label: 'Codex',
    capabilities: {},
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource)

  assert.equal(health.ok, true)
  assert.equal(health.toolCount, 0)
  assert.equal(health.warningCount, 0)
  assert.deepEqual(health.warnings, [])

  const summary = summarizeAgentControlCapabilityHealth([health], 1)
  assert.equal(summary.toolSummary.blocked, 0)
  assert.equal(summary.warningCount, health.warningCount)
})

test('agent control capability health surfaces SDK credential readiness', async () => {
  const health = await inspectAgentControlDataSourceCapabilities(providerFixture({ kind: 'claude', label: 'Claude Code' }), {
    provider: 'claude',
    label: 'Claude Code',
    capabilities: {
      runtime: {
        probe: async () => ({
          ok: false,
          credentials: {
            ok: false,
            configured: false,
            env: 'ANTHROPIC_API_KEY',
            acceptedEnv: ['ANTHROPIC_API_KEY'],
            source: 'none',
            detail: 'Set ANTHROPIC_API_KEY.',
          },
        }),
      },
    },
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource)

  assert.equal(health.ok, false)
  assert.equal(health.warningCount, 1)
  assert.deepEqual(health.credential, {
    ok: false,
    configured: false,
    env: 'ANTHROPIC_API_KEY',
    source: 'none',
    detail: 'Set ANTHROPIC_API_KEY.',
  })
  assert.deepEqual(health.warnings, ['Runtime 凭据：Set ANTHROPIC_API_KEY.'])
})

test('agent control capability health counts Mova SDK capability surfaces and resolved catalog tools', async () => {
  const health = await inspectAgentControlDataSourceCapabilities(providerFixture({ kind: 'mova' }), {
    provider: 'mova',
    label: 'Mova',
    capabilities: {
      command: {
        exec: async () => ({}),
      },
      fs: {
        readFile: async () => ({}),
        writeFile: async () => ({}),
      },
      plugins: {
        list: async () => ({ plugins: [{ id: 'movscript' }] }),
      },
      skills: {
        list: async () => ({
          skills: [{ id: 'skill.generation' }, { id: 'skill.project' }],
          resolvedTools: {
            available: [{ name: 'context_current_get' }, { name: 'workspace_fetch' }],
            blocked: [{ name: 'workspace_apply' }],
          },
        }),
      },
      mcp: {
        listServers: async () => ({ servers: [] }),
        readResource: async () => ({}),
        callTool: async () => ({}),
      },
    },
    listThreads: async () => ({ threads: [] }),
    readThread: async () => { throw new Error('not used') },
    startThread: async () => { throw new Error('not used') },
    startTextTurn: async () => { throw new Error('not used') },
  } satisfies AgentChatDataSource)

  assert.equal(health.ok, true)
  assert.equal(health.toolCount, 4)
  assert.equal(health.blockedToolCount, 1)
  assert.equal(health.skillCount, 2)
  assert.equal(health.pluginCount, 1)
  assert.deepEqual(health.warnings, [])

  const summary = summarizeAgentControlCapabilityHealth([health], 1)
  assert.equal(summary.toolSummary.available, 4)
  assert.equal(summary.toolSummary.blocked, 1)
})

function providerFixture(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'codex',
    kind: 'codex',
    label: 'Codex',
    enabled: true,
    ...patch,
  } as ProviderConfig
}

import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentProviderConfig } from '@/features/agent/state/agentProviderConfigStore'
import { normalizeAgentPluginMarketplace } from './agentPluginMarketplace'

const codexProvider: AgentProviderConfig = {
  id: 'codex-a',
  kind: 'codex',
  label: 'Codex A',
  enabled: true,
}

const secondCodexProvider: AgentProviderConfig = {
  id: 'codex-b',
  kind: 'codex',
  label: 'Codex B',
  enabled: true,
}

test('normalizes marketplace source and per-agent install state separately', () => {
  const listed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      interface: { displayName: 'Personal' },
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        localVersion: '0.1.2',
        remotePluginId: null,
        source: { type: 'local', path: './plugins/movscript' },
        installed: false,
        enabled: true,
        installPolicy: 'AVAILABLE',
        authPolicy: 'ON_INSTALL',
        availability: 'AVAILABLE',
        interface: {
          displayName: 'MovScript',
          shortDescription: 'Workspace tools.',
          developerName: 'MovScript',
          category: 'Productivity',
          capabilities: ['mcp', 'skills'],
        },
        keywords: ['workspace'],
      }],
    }],
    marketplaceLoadErrors: [],
    featuredPluginIds: [],
  }
  const installed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      interface: { displayName: 'Personal' },
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        source: { type: 'local', path: './plugins/movscript' },
        installed: true,
        enabled: true,
        installPolicy: 'AVAILABLE',
        authPolicy: 'ON_INSTALL',
        availability: 'AVAILABLE',
        interface: { displayName: 'MovScript', capabilities: [] },
        keywords: [],
      }],
    }],
    marketplaceLoadErrors: [],
  }

  const firstAgentItems = normalizeAgentPluginMarketplace(codexProvider, listed, installed)
  const secondAgentItems = normalizeAgentPluginMarketplace(secondCodexProvider, listed)

  assert.equal(firstAgentItems.length, 1)
  assert.equal(firstAgentItems[0]?.agentProviderId, 'codex-a')
  assert.equal(firstAgentItems[0]?.installed, true)
  assert.equal(firstAgentItems[0]?.sourceType, 'local')
  assert.equal(firstAgentItems[0]?.sourcePath, './plugins/movscript')
  assert.equal(firstAgentItems[0]?.marketplaceDisplayName, 'Personal')
  assert.deepEqual(firstAgentItems[0]?.capabilities, ['mcp', 'skills'])

  assert.equal(secondAgentItems.length, 1)
  assert.equal(secondAgentItems[0]?.agentProviderId, 'codex-b')
  assert.equal(secondAgentItems[0]?.installed, false)
})

test('normalizes legacy MovScript local plugin lists as installed local agent plugins', () => {
  const movscriptProvider: AgentProviderConfig = {
    id: 'movscript-agent',
    kind: 'movscript-agent',
    label: 'MovScript Agent',
    enabled: true,
  }

  const items = normalizeAgentPluginMarketplace(movscriptProvider, {
    plugins: [{
      id: 'story-pack',
      name: 'Story Pack',
      version: '1.0.0',
      author: 'Local Team',
      description: 'Local pack.',
    }],
  })

  assert.equal(items.length, 1)
  assert.equal(items[0]?.installed, true)
  assert.equal(items[0]?.sourceType, 'local')
  assert.equal(items[0]?.marketplaceName, 'agent-local')
  assert.equal(items[0]?.developerName, 'Local Team')
})

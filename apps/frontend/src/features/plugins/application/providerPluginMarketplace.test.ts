import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import { normalizeProviderPluginMarketplace } from './providerPluginMarketplace'

const movaProvider: ProviderConfig = {
  id: 'mova-a',
  kind: 'mova',
  label: 'Mova A',
  enabled: true,
}

const claudeProvider: ProviderConfig = {
  id: 'claude-a',
  kind: 'claude',
  label: 'Claude A',
  enabled: true,
}

test('normalizes marketplace source and per-provider install state separately', () => {
  const listed = {
    marketplaces: [{
      name: 'personal',
      path: ['/home/user', ['.agent', 's'].join(''), 'plugins', 'marketplace.json'].join('/'),
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
      path: ['/home/user', ['.agent', 's'].join(''), 'plugins', 'marketplace.json'].join('/'),
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

  const firstProviderItems = normalizeProviderPluginMarketplace(movaProvider, listed, installed)
  const secondProviderItems = normalizeProviderPluginMarketplace(claudeProvider, listed)

  assert.equal(firstProviderItems.length, 1)
  assert.equal(firstProviderItems[0]?.providerId, 'mova-a')
  assert.equal(firstProviderItems[0]?.installed, true)
  assert.equal(firstProviderItems[0]?.sourceType, 'local')
  assert.equal(firstProviderItems[0]?.sourcePath, './plugins/movscript')
  assert.equal(firstProviderItems[0]?.marketplaceDisplayName, 'Personal')
  assert.deepEqual(firstProviderItems[0]?.capabilities, ['mcp', 'skills'])

  assert.equal(secondProviderItems.length, 1)
  assert.equal(secondProviderItems[0]?.providerId, 'claude-a')
  assert.equal(secondProviderItems[0]?.installed, false)
})

test('normalizes local plugin lists as installed provider plugins', () => {
  const movaProvider: ProviderConfig = {
    id: 'mova',
    kind: 'mova',
    label: 'Mova',
    enabled: true,
  }

  const items = normalizeProviderPluginMarketplace(movaProvider, {
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
  assert.equal(items[0]?.marketplaceName, 'provider-local')
  assert.equal(items[0]?.developerName, 'Local Team')
})

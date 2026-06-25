import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  extractProviderPluginCatalogFiles,
  normalizeProviderPluginMarketplace,
  providerPluginArchiveContributions,
  providerPluginInstallInput,
  providerPluginMarketplaceKey,
  readProviderPluginManifestFromArchive,
} from '../dist/index.js'

test('plugins package reads provider plugin archive manifests and catalog files', async () => {
  const archive = fakeArchive({
    '.provider-plugin/plugin.json': JSON.stringify({
      name: 'story-pack',
      version: '1.0.0',
      skills: './skills',
      mcpServers: './mcp.json',
    }),
    'mcp.json': JSON.stringify({
      mcpServers: {
        story: {
          command: 'story-mcp',
          label: 'Story MCP',
          tools: [{ name: 'story_outline', description: 'Outline story.' }],
        },
      },
    }),
    'skills/story/SKILL.md': 'Use story.',
  })

  const manifest = await readProviderPluginManifestFromArchive(archive)
  assert.equal(manifest?.name, 'story-pack')
  assert.deepEqual(await providerPluginArchiveContributions(archive, manifest), {
    skills: [{ path: './skills' }],
    mcpServers: [{
      id: 'story',
      label: 'Story MCP',
      tools: [{ name: 'story_outline', description: 'Outline story.' }],
    }],
  })
  assert.deepEqual(await extractProviderPluginCatalogFiles(archive, manifest), [
    { path: 'plugin-skills/story/SKILL.md', content: 'Use story.' },
  ])
})

test('plugins package normalizes provider marketplace inventories', () => {
  const provider = { id: 'mova-a', kind: 'mova', label: 'Mova A' }
  const listed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      interface: { displayName: 'Personal' },
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        localVersion: '0.1.2',
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
  }
  const installed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        installed: true,
      }],
    }],
  }

  const items = normalizeProviderPluginMarketplace(provider, listed, installed)

  assert.equal(items.length, 1)
  assert.equal(items[0]?.key, 'mova-a:/home/user/.agents/plugins/marketplace.json:movscript')
  assert.equal(items[0]?.providerKind, 'mova')
  assert.equal(items[0]?.installed, true)
  assert.equal(items[0]?.sourceType, 'local')
  assert.equal(items[0]?.sourcePath, './plugins/movscript')
  assert.equal(items[0]?.sourceLabel, 'Local · ./plugins/movscript')
  assert.equal(items[0]?.marketplaceDisplayName, 'Personal')
  assert.deepEqual(items[0]?.capabilities, ['mcp', 'skills'])
  assert.deepEqual(providerPluginInstallInput(items[0]), {
    pluginName: 'movscript',
    marketplacePath: '/home/user/.agents/plugins/marketplace.json',
  })
})

test('plugins package normalizes local plugin lists as installed provider plugins', () => {
  const items = normalizeProviderPluginMarketplace({ id: 'mova', kind: 'mova', label: 'Mova' }, {
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
  assert.equal(providerPluginMarketplaceKey('mova', undefined, 'provider-local', 'story-pack'), 'mova:provider-local:story-pack')
})

test('plugin marketplace rules stay independent from frontend runtime', () => {
  const source = readFileSync(new URL('../src/providerPluginMarketplace.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|useProviderConfigStore|createAgentChatDataSource|window\.|document\.|localStorage|sessionStorage/)
})

function fakeArchive(files) {
  return {
    file(path) {
      if (!(path in files)) return null
      return fakeEntry(files[path] ?? '')
    },
    forEach(callback) {
      for (const [path, content] of Object.entries(files)) callback(path, fakeEntry(content))
    },
  }
}

function fakeEntry(content) {
  return {
    dir: false,
    async: async (type) => type === 'base64' ? Buffer.from(content).toString('base64') : content,
  }
}

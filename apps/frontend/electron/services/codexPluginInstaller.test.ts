import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  installMovScriptCodexPlugin,
  prepareMovScriptCodexMarketplace,
} from './codexPluginInstaller'

test('prepareMovScriptCodexMarketplace stages bundled plugin and marketplace manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-codex-plugin-'))
  try {
    const source = writePluginSource(root)
    const marketplaceRoot = join(root, 'marketplace')

    const result = prepareMovScriptCodexMarketplace({ sourcePluginRoot: source, marketplaceRoot })

    assert.equal(result.marketplaceRoot, marketplaceRoot)
    assert.equal(result.marketplacePath, join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'))
    assert.equal(result.pluginRoot, join(marketplaceRoot, 'plugins', 'movscript'))
    assert.equal(existsSync(join(result.pluginRoot, '.codex-plugin', 'plugin.json')), true)
    assert.equal(existsSync(join(result.pluginRoot, 'skills', 'generation', 'SKILL.md')), true)
    assert.equal(existsSync(join(marketplaceRoot, 'marketplace.json')), false)

    const marketplace = JSON.parse(readFileSync(result.marketplacePath, 'utf8'))
    assert.equal(marketplace.name, 'movscript-local')
    assert.equal(marketplace.plugins[0].name, 'movscript')
    assert.equal(marketplace.plugins[0].source.path, './plugins/movscript')
    assert.equal(marketplace.plugins[0].policy.installation, 'AVAILABLE')
    assert.equal(marketplace.plugins[0].policy.authentication, 'ON_USE')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('installMovScriptCodexPlugin runs marketplace and plugin install commands', async () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-codex-plugin-'))
  try {
    const source = writePluginSource(root)
    const marketplaceRoot = join(root, 'marketplace')
    const calls: string[][] = []

    await installMovScriptCodexPlugin({
      sourcePluginRoot: source,
      marketplaceRoot,
      execCodex: async (args) => {
        calls.push(args)
      },
    })

    assert.deepEqual(calls, [
      ['plugin', 'marketplace', 'add', marketplaceRoot],
      ['plugin', 'add', 'movscript@movscript-local'],
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function writePluginSource(root: string): string {
  const source = join(root, 'source-plugin')
  mkdirSync(join(source, '.provider-plugin'), { recursive: true })
  mkdirSync(join(source, '.codex-plugin'), { recursive: true })
  mkdirSync(join(source, 'skills', 'generation'), { recursive: true })
  mkdirSync(join(source, 'bin'), { recursive: true })
  const manifest = {
    name: 'movscript',
    version: '0.1.0',
    description: 'MovScript plugin',
  }
  writeFileSync(join(source, '.provider-plugin', 'plugin.json'), JSON.stringify(manifest), 'utf8')
  writeFileSync(join(source, '.codex-plugin', 'plugin.json'), JSON.stringify(manifest), 'utf8')
  writeFileSync(join(source, '.mcp.json'), JSON.stringify({ mcpServers: {} }), 'utf8')
  writeFileSync(join(source, 'skills', 'generation', 'SKILL.md'), '---\nname: generation\n---\n', 'utf8')
  writeFileSync(join(source, 'bin', 'mcp-stdio-bridge'), '#!/bin/sh\n', 'utf8')
  return source
}

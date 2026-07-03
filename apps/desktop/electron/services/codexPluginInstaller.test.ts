import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  codexCommandEnv,
  installMovScriptCodexPlugin,
  prepareMovScriptCodexMarketplace,
  resolveCodexExecutable,
} from './codexPluginInstaller'

test('prepareMovScriptCodexMarketplace points Codex marketplace at Home current plugin', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-codex-plugin-'))
  try {
    const source = writePluginSource(root)
    const homeDir = join(root, 'home')
    const marketplaceRoot = join(root, 'marketplace')

    const result = prepareMovScriptCodexMarketplace({ sourcePluginRoot: source, homeDir, marketplaceRoot })

    assert.equal(result.homeDir, homeDir)
    assert.equal(result.marketplaceRoot, marketplaceRoot)
    assert.equal(result.marketplacePath, join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'))
    assert.equal(result.pluginRoot, join(marketplaceRoot, 'plugins', 'movscript'))
    assert.equal(result.homeCurrentPluginRoot, join(homeDir, 'plugins', 'movscript', '0.1.0+abcdef123456'))
    assert.equal(result.homeCurrentPluginVersion, '0.1.0')
    assert.equal(result.homeCurrentBundleHash, 'abcdef1234567890')
    assert.equal(realpathSync(result.pluginRoot), realpathSync(result.homeCurrentPluginRoot))
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
    const homeDir = join(root, 'home')
    const marketplaceRoot = join(root, 'marketplace')
    const calls: string[][] = []

    await installMovScriptCodexPlugin({
      sourcePluginRoot: source,
      homeDir,
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

test('resolveCodexExecutable falls back to common macOS CLI locations when GUI PATH is sparse', () => {
  const found = resolveCodexExecutable({
    env: { PATH: '/usr/bin:/bin' },
    platform: 'darwin',
    exists: (path) => path === '/opt/homebrew/bin/codex',
  })

  assert.equal(found, '/opt/homebrew/bin/codex')
})

test('resolveCodexExecutable honors explicit CLI path', () => {
  const found = resolveCodexExecutable({
    env: { MOVSCRIPT_CODEX_CLI: '/custom/bin/codex', PATH: '/usr/bin:/bin' },
    platform: 'darwin',
    exists: () => false,
  })

  assert.equal(found, '/custom/bin/codex')
})

test('codexCommandEnv prepends Homebrew paths so env node works from GUI launches', () => {
  const env = codexCommandEnv('/opt/homebrew/bin/codex', { PATH: '/usr/bin:/bin' }, 'darwin')
  const entries = env.PATH?.split(':') ?? []

  assert.deepEqual(entries.slice(0, 4), [
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/node/bin',
    '/opt/homebrew/opt/node@22/bin',
    '/usr/local/bin',
  ])
  assert.equal(entries.filter((entry) => entry === '/opt/homebrew/bin').length, 1)
  assert.equal(entries.includes('/usr/bin'), true)
  assert.equal(entries.includes('/bin'), true)
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
  writeFileSync(join(source, 'bin', 'movscript'), '#!/bin/sh\n', 'utf8')
  writeFileSync(join(source, 'bin', 'movscript.mjs'), 'export {}\n', 'utf8')
  writeFileSync(join(source, 'bin', 'movscript-agent-mcp'), '#!/bin/sh\n', 'utf8')
  writeFileSync(join(source, 'manifest.runtime.json'), JSON.stringify({
    schema: 'movscript.runtime-bundle.v1',
    appId: 'plugin',
    applicationId: 'movscript.agent-plugin',
    artifact: 'movscript-agent-plugin',
    version: '0.1.0',
    packageName: '@movscript/plugin-movscript',
    generatedAt: '2026-07-02T00:00:00.000Z',
    apiVersion: '1.0',
    minDaemonApiVersion: '1.0',
    bundleHash: 'abcdef1234567890',
    bundleHashAlgorithm: 'sha256',
    capabilities: {
      cli: true,
      mcp: true,
      daemon: true,
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
    mcpServer: 'movscript',
    entrypoint: './bin/movscript',
    mcpArgs: ['mcp', 'stdio'],
    daemonArgs: ['daemon', 'run'],
    cliEntrypoint: './bin/movscript',
    legacyMcpEntrypoint: './bin/movscript-agent-mcp',
  }), 'utf8')
  return source
}

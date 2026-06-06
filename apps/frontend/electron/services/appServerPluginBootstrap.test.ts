import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensureMovScriptAppServerPlugin,
  resolveMovScriptAppServerPluginSource,
} from './appServerPluginBootstrap'

test('installs MovScript bundled app-server plugin into managed home', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-bootstrap-'))
  const providerHome = join(root, '.movscript', '.mova')
  const pluginSource = createPluginSource(root)
  mkdirSync(providerHome, { recursive: true })
  writeFileSync(join(providerHome, 'config.toml'), [
    'model_provider = "movscript"',
    '',
  ].join('\n'))

  const result = ensureMovScriptAppServerPlugin({ home: providerHome, pluginSourcePath: pluginSource })

  assert.equal(result.ok, true)
  assert.equal(result.marketplaceName, 'movscript-bundled')
  assert.equal(result.pluginName, 'movscript')
  assert.equal(result.pluginKey, 'movscript@movscript-bundled')
  assert.equal(result.version, '1.2.3')
  assert.equal(existsSync(join(result.installedPluginRoot, '.provider-plugin', 'plugin.json')), true)
  // Current upstream app-server providers still discover plugin metadata through this compatibility manifest.
  assert.equal(existsSync(join(result.installedPluginRoot, '.codex-plugin', 'plugin.json')), true)
  assert.equal(existsSync(join(result.installedPluginRoot, '.mcp.json')), true)
  assert.equal(existsSync(join(result.installedPluginRoot, 'skills', 'workspace', 'SKILL.md')), true)

  const marketplace = JSON.parse(readFileSync(join(
    result.marketplaceRoot,
    ['.agent', 's'].join(''),
    'plugins',
    'marketplace.json',
  ), 'utf8'))
  assert.equal(marketplace.name, 'movscript-bundled')
  assert.equal(marketplace.plugins[0].name, 'movscript')
  assert.equal(marketplace.plugins[0].policy.installation, 'INSTALLED_BY_DEFAULT')
  assert.equal(marketplace.plugins[0].policy.authentication, 'ON_USE')
  assert.equal(marketplace.plugins[0].source.path, './plugins/movscript')

  const configToml = readFileSync(join(providerHome, 'config.toml'), 'utf8')
  assert.match(configToml, /\[features]\nplugins = true/)
  assert.match(configToml, /\[marketplaces\.movscript-bundled]\nsource_type = "local"/)
  assert.match(configToml, /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
})

test('updates bundled app-server plugin config idempotently', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-bootstrap-repeat-'))
  const providerHome = join(root, '.movscript', '.mova')
  const pluginSource = createPluginSource(root)
  mkdirSync(providerHome, { recursive: true })
  writeFileSync(join(providerHome, 'config.toml'), [
    '[features]',
    'plugins = false',
    '',
    '[plugins."movscript@movscript-bundled"]',
    'enabled = false',
    '',
  ].join('\n'))

  const first = ensureMovScriptAppServerPlugin({ home: providerHome, pluginSourcePath: pluginSource })
  const second = ensureMovScriptAppServerPlugin({ home: providerHome, pluginSourcePath: pluginSource })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.hash, second.hash)
  const configToml = readFileSync(join(providerHome, 'config.toml'), 'utf8')
  assert.equal((configToml.match(/\[features]/g) ?? []).length, 1)
  assert.equal((configToml.match(/\[plugins\."movscript@movscript-bundled"]/g) ?? []).length, 1)
  assert.match(configToml, /\[features]\nplugins = true/)
  assert.match(configToml, /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
})

test('resolves bundled app-server plugin source from neutral environment variable', () => {
  const previous = process.env.MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-env-'))
  const pluginSource = createPluginSource(root)
  try {
    process.env.MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE = pluginSource
    assert.equal(resolveMovScriptAppServerPluginSource(), pluginSource)
  } finally {
    if (previous === undefined) delete process.env.MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE
    else process.env.MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE = previous
  }
})

test('requires provider-neutral plugin manifest even when upstream compatibility manifest exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-provider-manifest-'))
  const providerHome = join(root, '.movscript', '.mova')
  const pluginSource = createPluginSource(root)
  mkdirSync(providerHome, { recursive: true })
  rmSync(join(pluginSource, '.provider-plugin'), { recursive: true, force: true })

  const result = ensureMovScriptAppServerPlugin({ home: providerHome, pluginSourcePath: pluginSource })

  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /\.provider-plugin/)
  assert.equal(existsSync(join(result.installedPluginRoot, '.codex-plugin', 'plugin.json')), false)
})

function createPluginSource(root: string): string {
  const pluginSource = join(root, 'plugins', 'movscript')
  mkdirSync(join(pluginSource, '.provider-plugin'), { recursive: true })
  mkdirSync(join(pluginSource, '.codex-plugin'), { recursive: true })
  mkdirSync(join(pluginSource, 'skills', 'workspace'), { recursive: true })
  mkdirSync(join(pluginSource, 'bin'), { recursive: true })
  const manifest = JSON.stringify({
    name: 'movscript',
    version: '1.2.3',
    skills: './skills',
    mcpServers: './.mcp.json',
  }, null, 2)
  writeFileSync(join(pluginSource, '.provider-plugin', 'plugin.json'), manifest)
  writeFileSync(join(pluginSource, '.codex-plugin', 'plugin.json'), manifest)
  writeFileSync(join(pluginSource, '.mcp.json'), JSON.stringify({
    mcpServers: {
      movscript_workspace: {
        command: 'node',
        args: ['./bin/mcp-stdio-bridge.mjs'],
        cwd: '.',
      },
    },
  }, null, 2))
  writeFileSync(join(pluginSource, 'skills', 'workspace', 'SKILL.md'), '# Workspace\n')
  writeFileSync(join(pluginSource, 'bin', 'mcp-stdio-bridge.mjs'), '#!/usr/bin/env node\n')
  return pluginSource
}

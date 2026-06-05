import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureMovScriptBundledCodexPlugin } from './codexBundledPluginBootstrap'

test('installs MovScript bundled Codex plugin into managed CODEX_HOME', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-codex-plugin-bootstrap-'))
  const codexHome = join(root, '.movscript', '.codex')
  const pluginSource = createPluginSource(root)
  mkdirSync(codexHome, { recursive: true })
  writeFileSync(join(codexHome, 'config.toml'), [
    'model_provider = "movscript"',
    '',
  ].join('\n'))

  const result = ensureMovScriptBundledCodexPlugin({ codexHome, pluginSourcePath: pluginSource })

  assert.equal(result.ok, true)
  assert.equal(result.marketplaceName, 'movscript-bundled')
  assert.equal(result.pluginName, 'movscript')
  assert.equal(result.pluginKey, 'movscript@movscript-bundled')
  assert.equal(result.version, '1.2.3')
  assert.equal(existsSync(join(result.installedPluginRoot, '.codex-plugin', 'plugin.json')), true)
  assert.equal(existsSync(join(result.installedPluginRoot, '.mcp.json')), true)
  assert.equal(existsSync(join(result.installedPluginRoot, 'skills', 'workspace', 'SKILL.md')), true)

  const marketplace = JSON.parse(readFileSync(join(
    result.marketplaceRoot,
    '.agents',
    'plugins',
    'marketplace.json',
  ), 'utf8'))
  assert.equal(marketplace.name, 'movscript-bundled')
  assert.equal(marketplace.plugins[0].name, 'movscript')
  assert.equal(marketplace.plugins[0].policy.installation, 'INSTALLED_BY_DEFAULT')
  assert.equal(marketplace.plugins[0].policy.authentication, 'ON_USE')
  assert.equal(marketplace.plugins[0].source.path, './plugins/movscript')

  const configToml = readFileSync(join(codexHome, 'config.toml'), 'utf8')
  assert.match(configToml, /\[features]\nplugins = true/)
  assert.match(configToml, /\[marketplaces\.movscript-bundled]\nsource_type = "local"/)
  assert.match(configToml, /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
})

test('updates bundled Codex plugin config idempotently', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-codex-plugin-bootstrap-repeat-'))
  const codexHome = join(root, '.movscript', '.codex')
  const pluginSource = createPluginSource(root)
  mkdirSync(codexHome, { recursive: true })
  writeFileSync(join(codexHome, 'config.toml'), [
    '[features]',
    'plugins = false',
    '',
    '[plugins."movscript@movscript-bundled"]',
    'enabled = false',
    '',
  ].join('\n'))

  const first = ensureMovScriptBundledCodexPlugin({ codexHome, pluginSourcePath: pluginSource })
  const second = ensureMovScriptBundledCodexPlugin({ codexHome, pluginSourcePath: pluginSource })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.hash, second.hash)
  const configToml = readFileSync(join(codexHome, 'config.toml'), 'utf8')
  assert.equal((configToml.match(/\[features]/g) ?? []).length, 1)
  assert.equal((configToml.match(/\[plugins\."movscript@movscript-bundled"]/g) ?? []).length, 1)
  assert.match(configToml, /\[features]\nplugins = true/)
  assert.match(configToml, /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
})

function createPluginSource(root: string): string {
  const pluginSource = join(root, 'plugins', 'movscript')
  mkdirSync(join(pluginSource, '.codex-plugin'), { recursive: true })
  mkdirSync(join(pluginSource, 'skills', 'workspace'), { recursive: true })
  mkdirSync(join(pluginSource, 'bin'), { recursive: true })
  writeFileSync(join(pluginSource, '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'movscript',
    version: '1.2.3',
    skills: './skills',
    mcpServers: './.mcp.json',
  }, null, 2))
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

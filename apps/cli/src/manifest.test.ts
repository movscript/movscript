import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadPluginProjectManifest, loadMovJson } from './manifest.js'

test('loads provider plugin manifest before legacy mov.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-cli-plugin-manifest-'))
  try {
    mkdirSync(join(dir, '.provider-plugin'), { recursive: true })
    writeFileSync(join(dir, '.provider-plugin', 'plugin.json'), JSON.stringify({
      name: 'story-tools',
      version: '1.2.3',
      description: 'Story tools.',
      skills: './skills',
      mcpServers: './mcp.json',
    }), 'utf8')
    writeFileSync(join(dir, 'mov.json'), JSON.stringify({
      schema: 'movscript.plugin.v1',
      id: 'com.example.legacy',
      name: 'legacy',
      version: '0.1.0',
    }), 'utf8')

    const manifest = loadPluginProjectManifest(dir)

    assert.equal(manifest.manifestFormat, 'provider-plugin')
    assert.equal(manifest.id, 'story-tools')
    assert.equal(manifest.name, 'story-tools')
    assert.equal(manifest.version, '1.2.3')
    assert.deepEqual(manifest.providerPlugin, {
      name: 'story-tools',
      version: '1.2.3',
      description: 'Story tools.',
      skills: './skills',
      mcpServers: './mcp.json',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('does not treat upstream compatibility provider plugin manifest as source metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-cli-upstream-provider-plugin-manifest-'))
  try {
    mkdirSync(join(dir, '.codex-plugin'), { recursive: true })
    writeFileSync(join(dir, '.codex-plugin', 'plugin.json'), JSON.stringify({
      name: 'upstream-provider',
      version: '1.0.0',
    }), 'utf8')

    assert.throws(() => loadPluginProjectManifest(dir), /mov\.json not found/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('falls back to legacy mov.json when provider plugin manifest is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-cli-legacy-manifest-'))
  try {
    writeFileSync(join(dir, 'mov.json'), JSON.stringify({
      schema: 'movscript.plugin.v1',
      id: 'com.example.legacy',
      name: 'legacy',
      version: '0.1.0',
    }), 'utf8')

    assert.equal(loadPluginProjectManifest(dir).manifestFormat, 'movscript')
    assert.equal(loadMovJson(dir).id, 'com.example.legacy')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

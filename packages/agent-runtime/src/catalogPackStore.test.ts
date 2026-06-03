import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  installAgentCatalogPack,
  listAgentCatalogPackPlugins,
  resolveAgentCatalogPackStoreDirs,
  uninstallAgentCatalogPack,
} from './catalogPackStore.js'

test('resolveAgentCatalogPackStoreDirs resolves dedicated catalog dirs from dataDir', () => {
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir: '/tmp/movscript-data', env: {} })

  assert.equal(dirs.rootDir, '/tmp/movscript-data/agent-catalog')
  assert.equal(dirs.skillsDir, '/tmp/movscript-data/agent-catalog/skills')
  assert.equal(dirs.toolsDir, '/tmp/movscript-data/agent-catalog/tools')
  assert.equal(dirs.packsDir, '/tmp/movscript-data/agent-catalog/packs')
  assert.equal(dirs.configFilesDir, '/tmp/movscript-data/agent-catalog/config-files')
})

test('installAgentCatalogPack writes contributed files into kind-specific plugin dirs', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir, env: {} })

  const result = installAgentCatalogPack({
    pluginId: 'studio/plugin',
    dirs,
    files: [
      { path: 'agent-skills/story/SKILL.md', content: '---\nname: Story\n---\nStory' },
      { path: 'agent-tools/workspace/edit.tool.json', content: '{"name":"workspace.edit"}' },
      { path: 'agent-packs/story.pack.json', content: '{"id":"story"}' },
      { path: 'agent-config-files/default.config-file.json', content: '{"id":"default"}' },
    ],
  })

  assert.deepEqual(result.installedFiles, [
    'agent-config-files/plugins/studio_plugin/default.config-file.json',
    'agent-packs/plugins/studio_plugin/story.pack.json',
    'agent-skills/plugins/studio_plugin/story/SKILL.md',
    'agent-tools/plugins/studio_plugin/workspace/edit.tool.json',
  ])
  assert.equal(readFileSync(join(dirs.skillsDir, 'plugins/studio_plugin/story/SKILL.md'), 'utf8'), '---\nname: Story\n---\nStory')
  assert.equal(readFileSync(join(dirs.toolsDir, 'plugins/studio_plugin/workspace/edit.tool.json'), 'utf8'), '{"name":"workspace.edit"}')

  const listed = listAgentCatalogPackPlugins(dirs)
  assert.deepEqual(listed.plugins, [{
    pluginId: 'studio_plugin',
    kinds: ['skills', 'tools', 'packs', 'configFiles'],
    paths: {
      skills: 'plugins/studio_plugin',
      tools: 'plugins/studio_plugin',
      packs: 'plugins/studio_plugin',
      configFiles: 'plugins/studio_plugin',
    },
  }])
})

test('installAgentCatalogPack rewrites plugin pack resource paths for installed plugin dirs', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir, env: {} })

  installAgentCatalogPack({
    pluginId: 'studio/plugin',
    dirs,
    files: [{
      path: 'agent-packs/story.pack.json',
      content: JSON.stringify({
        id: 'story.pack',
        resources: {
          skills: ['story', 'plugins/studio_plugin/already-prefixed'],
          tools: ['workspace'],
        },
        skills: ['story.skill'],
        tools: ['story.tool'],
      }),
    }],
  })

  const installedPack = JSON.parse(readFileSync(join(dirs.packsDir, 'plugins/studio_plugin/story.pack.json'), 'utf8'))

  assert.equal(installedPack.source, 'plugin')
  assert.equal(installedPack.pluginId, 'studio/plugin')
  assert.deepEqual(installedPack.resources.skills, [
    'plugins/studio_plugin/story',
    'plugins/studio_plugin/already-prefixed',
  ])
  assert.deepEqual(installedPack.resources.tools, ['plugins/studio_plugin/workspace'])
})

test('installAgentCatalogPack replaces the plugin across every catalog kind', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir, env: {} })

  installAgentCatalogPack({
    pluginId: 'studio/plugin',
    dirs,
    files: [
      { path: 'agent-skills/story/SKILL.md', content: 'Story' },
      { path: 'agent-tools/story.tool.json', content: '{"name":"story.old"}' },
      { path: 'agent-packs/story.pack.json', content: '{"id":"story.old"}' },
      { path: 'agent-config-files/story.config-file.json', content: '{"id":"story.old"}' },
    ],
  })

  installAgentCatalogPack({
    pluginId: 'studio/plugin',
    dirs,
    files: [{ path: 'agent-skills/story/SKILL.md', content: 'Updated story' }],
  })

  assert.equal(readFileSync(join(dirs.skillsDir, 'plugins/studio_plugin/story/SKILL.md'), 'utf8'), 'Updated story')
  assert.equal(existsSync(join(dirs.toolsDir, 'plugins/studio_plugin/story.tool.json')), false)
  assert.equal(existsSync(join(dirs.packsDir, 'plugins/studio_plugin/story.pack.json')), false)
  assert.equal(existsSync(join(dirs.configFilesDir, 'plugins/studio_plugin/story.config-file.json')), false)
})

test('uninstallAgentCatalogPack removes the plugin from every catalog kind', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir, env: {} })
  installAgentCatalogPack({
    pluginId: 'studio/plugin',
    dirs,
    files: [
      { path: 'agent-skills/story/SKILL.md', content: 'Story' },
      { path: 'agent-packs/story.pack.json', content: '{"id":"story"}' },
    ],
  })

  const result = uninstallAgentCatalogPack({ pluginId: 'studio/plugin', dirs })

  assert.equal(result.removed, true)
  assert.deepEqual(listAgentCatalogPackPlugins(dirs).plugins, [])
})

test('installAgentCatalogPack rejects traversal paths', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const dirs = resolveAgentCatalogPackStoreDirs({ dataDir, env: {} })

  assert.throws(() => installAgentCatalogPack({
    pluginId: 'bad',
    dirs,
    files: [{ path: 'agent-skills/../escape/SKILL.md', content: 'x' }],
  }), /unsafe agent catalog pack path/)
})

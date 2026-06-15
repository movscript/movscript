import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveMovScriptProjectCwd } from '@movscript/core/workspace/node'
import {
  getProjectPluginSnapshot,
  installProjectPlugin,
  setProjectSkillEnabled,
} from './projectPluginStore'

test('project plugin install writes project manifest, lock, codex config, and repo skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'movscript-project-plugin-'))
    try {
      const workspaceDir = join(root, 'workspace')
      const projectId = 42
      const projectCwd = resolveMovScriptProjectCwd({ workspaceDir, projectId })
      const desktopDataDir = join(root, 'desktop-data')
      const source = join(root, 'plugin-source')
    mkdirSync(join(source, 'skills', 'story'), { recursive: true })
    writeFileSync(join(source, 'skills', 'story', 'SKILL.md'), [
      '---',
      'name: story',
      'description: Story planning.',
      '---',
      '',
      'Use story planning.',
      '',
    ].join('\n'), 'utf8')

      const snapshot = installProjectPlugin({
        workspaceDir,
        projectId,
        desktopDataDir,
        id: 'story-pack',
      name: 'story-pack',
      displayName: 'Story Pack',
      marketplaceName: 'local',
      pluginKey: 'story-pack@local',
      sourceType: 'local',
      sourcePath: source,
    })

    assert.equal(snapshot.plugins.length, 1)
    assert.equal(snapshot.projectCwd, projectCwd)
    assert.equal(snapshot.plugins[0]?.prepared, true)
    assert.equal(snapshot.skills.length, 1)
    assert.equal(snapshot.skills[0]?.name, 'story')
    assert.equal(snapshot.skills[0]?.enabled, true)
    assert.equal(snapshot.desktopPluginCacheRoot, join(desktopDataDir, 'plugin-cache'))
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'manifest.json')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'lock.json')), true)
    assert.match(readFileSync(join(projectCwd, '.codex', 'config.toml'), 'utf8'), /\[plugins\."story-pack@local"]\nenabled = true/)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'bundles', 'story-pack_local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(desktopDataDir, 'plugin-cache', 'local', 'story-pack', '0.0.0')), false)
    const cacheDir = snapshot.plugins[0]?.preparedPaths?.desktopPluginCacheDir
    assert.equal(Boolean(cacheDir), true)
    assert.equal(existsSync(join(cacheDir!, 'skills', 'story', 'SKILL.md')), true)
    assert.match(readFileSync(join(cacheDir!, 'metadata.json'), 'utf8'), /"schema": "movscript\.desktop-plugin-cache\.v1"/)
    assert.match(readFileSync(join(projectCwd, '.agents', 'plugins', 'marketplace.json'), 'utf8'), /"name": "local"/)
    assert.match(readFileSync(join(projectCwd, '.agents', 'plugins', 'marketplace.json'), 'utf8'), /"path": "\.\/bundles\/story-pack_local"/)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'catalog', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)

    const reread = getProjectPluginSnapshot({ workspaceDir, projectId, desktopDataDir })
    assert.equal(reread.plugins[0]?.pluginKey, 'story-pack@local')
    assert.equal(reread.plugins[0]?.preparedPaths?.desktopPluginCacheDir, cacheDir)
    assert.equal(reread.plugins[0]?.preparedPaths?.codexSkillsDir?.endsWith('story-pack_local'), true)
    assert.equal(reread.plugins[0]?.preparedPaths?.repoSkillsDir?.endsWith('story-pack_local'), true)
    assert.equal(reread.plugins[0]?.preparedPaths?.projectMarketplacePath?.endsWith('.agents/plugins/marketplace.json'), true)

    const disabled = setProjectSkillEnabled({ workspaceDir, projectId, desktopDataDir, skillId: reread.skills[0]!.id, enabled: false })
    assert.equal(disabled.skills[0]?.enabled, false)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), false)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), false)

    const enabled = setProjectSkillEnabled({ workspaceDir, projectId, desktopDataDir, skillId: reread.skills[0]!.id, enabled: true })
    assert.equal(enabled.skills[0]?.enabled, true)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

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

test('project plugin install writes project manifest, lock, provider config, and provider-native skills', () => {
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
      providerTargets: ['codex', 'mova', 'claude'],
    })

    assert.equal(snapshot.plugins.length, 1)
    assert.equal(snapshot.projectCwd, projectCwd)
    assert.equal(snapshot.plugins[0]?.prepared, true)
    assert.deepEqual(snapshot.plugins[0]?.providerTargets, ['codex', 'mova', 'claude'])
    assert.equal(snapshot.skills.length, 3)
    assert.equal(snapshot.skills[0]?.name, 'story')
    assert.deepEqual(snapshot.skills.map((skill) => skill.providerTarget).sort(), ['claude', 'codex', 'mova'])
    assert.deepEqual(snapshot.skills.map((skill) => skill.providerScope).sort(), ['claude', 'codex', 'mova'])
    assert.equal(snapshot.skills.every((skill) => skill.providerScope === skill.providerTarget), true)
    assert.equal(snapshot.skills.every((skill) => skill.sourceScope === 'global'), true)
    assert.equal(snapshot.skills.every((skill) => /^[a-f0-9]{64}$/.test(skill.contentHash)), true)
    assert.equal(snapshot.skills.every((skill) => skill.enabled), true)
    assert.equal(snapshot.desktopPluginCacheRoot, join(desktopDataDir, 'plugin-cache'))
    assert.equal(snapshot.providerSkillDirs.codex, join(projectCwd, '.codex', 'skills'))
    assert.equal(snapshot.providerSkillDirs.mova, join(projectCwd, '.mova', 'skills'))
    assert.equal(snapshot.providerSkillDirs.claude, join(projectCwd, '.claude', 'skills'))
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'manifest.json')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'lock.json')), true)
    assert.match(readFileSync(join(projectCwd, '.codex', 'config.toml'), 'utf8'), /\[plugins\."story-pack@local"]\nenabled = true/)
    assert.match(readFileSync(join(projectCwd, '.mova', 'config.toml'), 'utf8'), /\[plugins\."story-pack@local"]\nenabled = true/)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.mova', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.claude', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills')), false)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'bundles', 'story-pack_local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(desktopDataDir, 'plugin-cache', 'local', 'story-pack', '0.0.0')), false)
    const cacheDir = snapshot.plugins[0]?.preparedPaths?.desktopPluginCacheDir
    assert.equal(Boolean(cacheDir), true)
    assert.equal(existsSync(join(cacheDir!, 'skills', 'story', 'SKILL.md')), true)
    assert.match(readFileSync(join(cacheDir!, 'metadata.json'), 'utf8'), /"schema": "movscript\.desktop-plugin-cache\.v1"/)
    assert.match(readFileSync(join(cacheDir!, 'metadata.json'), 'utf8'), /"providerTargets": \[/)
    assert.match(readFileSync(join(projectCwd, '.agents', 'plugins', 'marketplace.json'), 'utf8'), /"name": "local"/)
    assert.match(readFileSync(join(projectCwd, '.agents', 'plugins', 'marketplace.json'), 'utf8'), /"path": "\.\/bundles\/story-pack_local"/)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'catalog', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)

    const reread = getProjectPluginSnapshot({ workspaceDir, projectId, desktopDataDir })
    assert.equal(reread.plugins[0]?.pluginKey, 'story-pack@local')
    assert.equal(reread.plugins[0]?.preparedPaths?.desktopPluginCacheDir, cacheDir)
    assert.equal(reread.plugins[0]?.preparedPaths?.providerSkillDirs?.codex?.endsWith('story-pack_local'), true)
    assert.equal(reread.plugins[0]?.preparedPaths?.providerSkillDirs?.mova?.endsWith('story-pack_local'), true)
    assert.equal(reread.plugins[0]?.preparedPaths?.providerSkillDirs?.claude?.endsWith('story-pack_local'), true)
    assert.equal(reread.plugins[0]?.preparedPaths?.projectMarketplacePath?.endsWith('.agents/plugins/marketplace.json'), true)

    const movaSkill = reread.skills.find((skill) => skill.providerTarget === 'mova')
    assert.ok(movaSkill)
    const disabled = setProjectSkillEnabled({ workspaceDir, projectId, desktopDataDir, skillId: movaSkill.id, enabled: false })
    assert.equal(disabled.skills.find((skill) => skill.providerTarget === 'mova')?.enabled, false)
    assert.equal(disabled.skills.find((skill) => skill.providerTarget === 'codex')?.enabled, true)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.mova', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), false)
    assert.equal(existsSync(join(projectCwd, '.claude', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills')), false)

    const enabled = setProjectSkillEnabled({ workspaceDir, projectId, desktopDataDir, skillId: movaSkill.id, enabled: true })
    assert.equal(enabled.skills.find((skill) => skill.providerTarget === 'mova')?.enabled, true)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.mova', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.claude', 'skills', 'plugins', 'story-pack_local', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('project plugin install requires explicit provider targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-project-plugin-targets-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const projectId = 42
    const projectCwd = resolveMovScriptProjectCwd({ workspaceDir, projectId })
    const source = join(root, 'plugin-source')
    mkdirSync(join(source, 'skills', 'story'), { recursive: true })
    writeFileSync(join(source, 'skills', 'story', 'SKILL.md'), 'Use story planning.\n', 'utf8')

    assert.throws(
      () => installProjectPlugin({
        workspaceDir,
        projectId,
        id: 'story-pack',
        name: 'story-pack',
        marketplaceName: 'local',
        pluginKey: 'story-pack@local',
        sourceType: 'local',
        sourcePath: source,
      }),
      /requires at least one provider target/,
    )

    assert.equal(existsSync(join(projectCwd, '.codex', 'skills')), false)
    assert.equal(existsSync(join(projectCwd, '.mova', 'skills')), false)
    assert.equal(existsSync(join(projectCwd, '.claude', 'skills')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

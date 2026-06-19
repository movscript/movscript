import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveMovScriptProjectCwd } from '@movscript/core/workspace/node'
import {
  getProjectPluginSnapshot,
  installProjectPlugin,
  installSystemPlugin,
  setProjectPluginEnabled,
  setProjectSkillEnabled,
  uninstallSystemPlugin,
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
    assert.equal(snapshot.systemPlugins.length, 1)
    assert.equal(snapshot.projectCwd, projectCwd)
    assert.equal(snapshot.plugins[0]?.prepared, true)
    assert.equal(snapshot.systemPlugins[0]?.installed, true)
    assert.equal(snapshot.systemPlugins[0]?.projectEnabled, true)
    assert.equal(snapshot.systemPlugins[0]?.globalEnabled, false)
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
    assert.equal(snapshot.plugins[0]?.preparedPaths?.providerPluginCacheDirs?.codex, join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'story-pack', 'local'))
    assert.equal(snapshot.plugins[0]?.preparedPaths?.providerPluginCacheDirs?.mova, join(projectCwd, '.mova', 'plugins', 'cache', 'local', 'story-pack', 'local'))
    assert.equal(snapshot.plugins[0]?.preparedPaths?.providerPluginCacheDirs?.claude, join(projectCwd, '.claude', 'plugins', 'cache', 'local', 'story-pack', 'local'))
    assert.equal(existsSync(join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'story-pack', 'local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.mova', 'plugins', 'cache', 'local', 'story-pack', 'local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.claude', 'plugins', 'cache', 'local', 'story-pack', 'local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.agents', 'skills')), false)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'bundles', 'story-pack_local', 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(desktopDataDir, 'plugin-cache', 'local', 'story-pack', '0.0.0')), false)
    const cacheDir = snapshot.plugins[0]?.preparedPaths?.desktopPluginCacheDir
    assert.equal(Boolean(cacheDir), true)
    assert.equal(snapshot.systemPlugins[0]?.cacheDir, cacheDir)
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
    assert.equal(reread.plugins[0]?.preparedPaths?.providerPluginCacheDirs?.codex, join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'story-pack', 'local'))
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

    const projectDisabled = setProjectPluginEnabled({ workspaceDir, projectId, desktopDataDir, pluginKey: 'story-pack@local', enabled: false })
    assert.equal(projectDisabled.systemPlugins[0]?.installed, true)
    assert.equal(projectDisabled.systemPlugins[0]?.projectEnabled, false)
    assert.equal(projectDisabled.plugins[0]?.enabled, false)
    assert.equal(projectDisabled.plugins[0]?.prepared, false)
    assert.equal(existsSync(join(cacheDir!, 'skills', 'story', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'story-pack', 'local')), false)
    assert.equal(existsSync(join(projectCwd, '.mova', 'plugins', 'cache', 'local', 'story-pack', 'local')), false)
    assert.equal(existsSync(join(projectCwd, '.claude', 'plugins', 'cache', 'local', 'story-pack', 'local')), false)
    assert.equal(existsSync(join(projectCwd, '.codex', 'skills', 'plugins', 'story-pack_local')), false)
    assert.equal(existsSync(join(projectCwd, '.mova', 'skills', 'plugins', 'story-pack_local')), false)
    assert.equal(existsSync(join(projectCwd, '.claude', 'skills', 'plugins', 'story-pack_local')), false)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'bundles', 'story-pack_local')), false)
    assert.match(readFileSync(join(projectCwd, '.codex', 'config.toml'), 'utf8'), /\[plugins\."story-pack@local"]\nenabled = false/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('system plugin install only populates the desktop cache until the project enables it', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-system-plugin-cache-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const projectId = 77
    const projectCwd = resolveMovScriptProjectCwd({ workspaceDir, projectId })
    const desktopDataDir = join(root, 'desktop-data')
    const source = join(root, 'plugin-source')
    mkdirSync(join(source, 'skills', 'beat'), { recursive: true })
    writeFileSync(join(source, 'skills', 'beat', 'SKILL.md'), [
      '---',
      'name: beat',
      'description: Beat planning.',
      '---',
      '',
      'Use beat planning.',
      '',
    ].join('\n'), 'utf8')

    const installed = installSystemPlugin({
      workspaceDir,
      projectId,
      desktopDataDir,
      id: 'beat-pack',
      name: 'beat-pack',
      displayName: 'Beat Pack',
      marketplaceName: 'local',
      pluginKey: 'beat-pack@local',
      sourceType: 'local',
      sourcePath: source,
      providerTargets: ['codex', 'mova'],
    })

    assert.equal(installed.plugins.length, 0)
    assert.equal(installed.systemPlugins.length, 1)
    assert.equal(installed.systemPlugins[0]?.installed, true)
    assert.equal(installed.systemPlugins[0]?.projectEnabled, false)
    assert.equal(existsSync(join(installed.systemPlugins[0]!.cacheDir, 'skills', 'beat', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.codex')), false)
    assert.equal(existsSync(join(projectCwd, '.mova')), false)
    assert.equal(existsSync(join(projectCwd, '.claude')), false)
    assert.equal(existsSync(join(projectCwd, '.agents', 'plugins', 'manifest.json')), false)
    assert.deepEqual(installed.skills.map((skill) => skill.providerTarget).sort(), ['codex', 'mova'])
    assert.equal(installed.skills.every((skill) => !skill.enabled), true)

    const enabled = setProjectPluginEnabled({ workspaceDir, projectId, desktopDataDir, pluginKey: 'beat-pack@local', enabled: true })
    assert.equal(enabled.plugins.length, 1)
    assert.equal(enabled.systemPlugins[0]?.projectEnabled, true)
    assert.equal(existsSync(join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'beat-pack', 'local', 'skills', 'beat', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.mova', 'plugins', 'cache', 'local', 'beat-pack', 'local', 'skills', 'beat', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectCwd, '.claude')), false)

    const uninstalled = uninstallSystemPlugin({ workspaceDir, projectId, desktopDataDir, pluginKey: 'beat-pack@local' })
    assert.equal(uninstalled.systemPlugins[0]?.installed, false)
    assert.equal(existsSync(installed.systemPlugins[0]!.cacheDir), false)
    assert.equal(existsSync(join(projectCwd, '.codex', 'plugins', 'cache', 'local', 'beat-pack', 'local', 'skills', 'beat', 'SKILL.md')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('global plugin enable writes workspace provider homes and is visible from project snapshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-global-plugin-enable-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const projectId = 78
    const projectCwd = resolveMovScriptProjectCwd({ workspaceDir, projectId })
    const desktopDataDir = join(root, 'desktop-data')
    const source = join(root, 'plugin-source')
    mkdirSync(join(source, 'skills', 'outline'), { recursive: true })
    writeFileSync(join(source, 'skills', 'outline', 'SKILL.md'), [
      '---',
      'name: outline',
      'description: Outline planning.',
      '---',
      '',
      'Use outline planning.',
      '',
    ].join('\n'), 'utf8')

    installSystemPlugin({
      workspaceDir,
      desktopDataDir,
      id: 'outline-pack',
      name: 'outline-pack',
      displayName: 'Outline Pack',
      marketplaceName: 'local',
      pluginKey: 'outline-pack@local',
      sourceType: 'local',
      sourcePath: source,
      providerTargets: ['codex', 'claude'],
    })

    const globalEnabled = setProjectPluginEnabled({ workspaceDir, desktopDataDir, pluginKey: 'outline-pack@local', enabled: true })
    assert.equal(globalEnabled.systemPlugins[0]?.globalEnabled, true)
    assert.equal(globalEnabled.systemPlugins[0]?.projectEnabled, true)
    assert.equal(existsSync(join(workspaceDir, '.codex', 'plugins', 'cache', 'local', 'outline-pack', 'local', 'skills', 'outline', 'SKILL.md')), true)
    assert.equal(existsSync(join(workspaceDir, '.claude', 'plugins', 'cache', 'local', 'outline-pack', 'local', 'skills', 'outline', 'SKILL.md')), true)
    assert.equal(existsSync(join(workspaceDir, '.mova')), false)
    assert.match(readFileSync(join(workspaceDir, '.codex', 'config.toml'), 'utf8'), /\[plugins\."outline-pack@local"]\nenabled = true/)

    const projectSnapshot = getProjectPluginSnapshot({ workspaceDir, projectId, desktopDataDir })
    assert.equal(projectSnapshot.systemPlugins[0]?.globalEnabled, true)
    assert.equal(projectSnapshot.systemPlugins[0]?.projectEnabled, false)
    assert.equal(projectSnapshot.plugins.length, 0)
    assert.equal(existsSync(join(projectCwd, '.codex')), false)
    assert.equal(projectSnapshot.skills.filter((skill) => skill.enabled).length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('project plugin cache defaults under the MovScript Home workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-project-plugin-cache-home-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const snapshot = getProjectPluginSnapshot({ workspaceDir, projectId: 42 })

    assert.equal(snapshot.desktopPluginCacheRoot, join(workspaceDir, 'plugin-cache'))
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

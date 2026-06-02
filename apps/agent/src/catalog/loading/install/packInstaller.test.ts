import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { installAgentPack, listAgentPackPlugins, uninstallAgentPack } from './packInstaller.js'

test('installAgentPack writes plugin-owned files under the pack install root', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-'))
  const result = installAgentPack({
    packInstallRootDir,
    pluginId: 'studio/directors',
    files: [{
      path: 'agent-skills/directors/jiangwen/SKILL.md',
      content: '---\nname: 姜文导演\ndescription: 姜文风格\n---\n黑色幽默。',
    }],
  })

  assert.deepEqual(result.installedFiles, ['plugins/studio_directors/directors/jiangwen/SKILL.md'])
  const installedPath = join(packInstallRootDir, 'plugins', 'studio_directors', 'directors', 'jiangwen', 'SKILL.md')
  assert.equal(readFileSync(installedPath, 'utf8'), '---\nname: 姜文导演\ndescription: 姜文风格\n---\n黑色幽默。')
})

test('installAgentPack replaces only the plugin-owned pack directory', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-replace-'))
  installAgentPack({
    packInstallRootDir,
    pluginId: 'studio.director',
    files: [{ path: 'agent-skills/old/SKILL.md', content: '---\nname: Old\ndescription: Old\n---\nOld' }],
  })
  installAgentPack({
    packInstallRootDir,
    pluginId: 'studio.director',
    files: [{ path: 'agent-skills/new/SKILL.md', content: '---\nname: New\ndescription: New\n---\nNew' }],
  })

  assert.equal(existsSync(join(packInstallRootDir, 'plugins', 'studio.director', 'old', 'SKILL.md')), false)
  assert.equal(existsSync(join(packInstallRootDir, 'plugins', 'studio.director', 'new', 'SKILL.md')), true)
})

test('installAgentPack rejects traversal paths', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-unsafe-'))
  assert.throws(() => installAgentPack({
    packInstallRootDir,
    pluginId: 'bad',
    files: [{ path: 'agent-skills/../escape/SKILL.md', content: 'x' }],
  }), /unsafe agent pack path/)
})

test('uninstallAgentPack removes only the plugin-owned pack directory', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-uninstall-'))
  installAgentPack({
    packInstallRootDir,
    pluginId: 'studio/director',
    files: [{ path: 'agent-skills/director/SKILL.md', content: '---\nname: Director\ndescription: Director\n---\nDirector' }],
  })
  installAgentPack({
    packInstallRootDir,
    pluginId: 'other',
    files: [{ path: 'agent-skills/other/SKILL.md', content: '---\nname: Other\ndescription: Other\n---\nOther' }],
  })

  const result = uninstallAgentPack({ packInstallRootDir, pluginId: 'studio/director' })

  assert.equal(result.pluginId, 'studio/director')
  assert.equal(result.removed, true)
  assert.equal(existsSync(join(packInstallRootDir, 'plugins', 'studio_director')), false)
  assert.equal(existsSync(join(packInstallRootDir, 'plugins', 'other', 'other', 'SKILL.md')), true)
})

test('uninstallAgentPack reports no-op for missing plugin pack', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-uninstall-missing-'))
  const result = uninstallAgentPack({ packInstallRootDir, pluginId: 'missing' })

  assert.equal(result.pluginId, 'missing')
  assert.equal(result.removed, false)
})

test('listAgentPackPlugins returns installed plugin-owned pack directories', () => {
  const packInstallRootDir = mkdtempSync(join(tmpdir(), 'movscript-agent-pack-list-'))
  installAgentPack({
    packInstallRootDir,
    pluginId: 'zeta',
    files: [{ path: 'agent-skills/zeta/SKILL.md', content: '---\nname: Zeta\ndescription: Zeta\n---\nZeta' }],
  })
  installAgentPack({
    packInstallRootDir,
    pluginId: 'alpha/plugin',
    files: [{ path: 'agent-skills/alpha/SKILL.md', content: '---\nname: Alpha\ndescription: Alpha\n---\nAlpha' }],
  })

  assert.deepEqual(listAgentPackPlugins(packInstallRootDir), [
    { pluginId: 'alpha_plugin', path: 'plugins/alpha_plugin' },
    { pluginId: 'zeta', path: 'plugins/zeta' },
  ])
})

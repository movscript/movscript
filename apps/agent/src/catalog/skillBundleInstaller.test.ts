import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { installAgentSkillBundle, listAgentSkillBundlePlugins, uninstallAgentSkillBundle } from './skillBundleInstaller.js'

test('installAgentSkillBundle writes plugin-owned Codex skill files under skillsDir', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-'))
  const result = installAgentSkillBundle({
    skillsDir,
    pluginId: 'studio/directors',
    files: [{
      path: 'agent-skills/directors/jiangwen/SKILL.md',
      content: '---\nname: 姜文导演\ndescription: 姜文风格\n---\n黑色幽默。',
    }],
  })

  assert.deepEqual(result.installedFiles, ['plugins/studio_directors/directors/jiangwen/SKILL.md'])
  const installedPath = join(skillsDir, 'plugins', 'studio_directors', 'directors', 'jiangwen', 'SKILL.md')
  assert.equal(readFileSync(installedPath, 'utf8'), '---\nname: 姜文导演\ndescription: 姜文风格\n---\n黑色幽默。')
})

test('installAgentSkillBundle replaces only the plugin-owned skill bundle directory', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-replace-'))
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'studio.director',
    files: [{ path: 'agent-skills/old/SKILL.md', content: '---\nname: Old\ndescription: Old\n---\nOld' }],
  })
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'studio.director',
    files: [{ path: 'agent-skills/new/SKILL.md', content: '---\nname: New\ndescription: New\n---\nNew' }],
  })

  assert.equal(existsSync(join(skillsDir, 'plugins', 'studio.director', 'old', 'SKILL.md')), false)
  assert.equal(existsSync(join(skillsDir, 'plugins', 'studio.director', 'new', 'SKILL.md')), true)
})

test('installAgentSkillBundle rejects traversal paths', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-unsafe-'))
  assert.throws(() => installAgentSkillBundle({
    skillsDir,
    pluginId: 'bad',
    files: [{ path: 'agent-skills/../escape/SKILL.md', content: 'x' }],
  }), /unsafe agent skill bundle path/)
})

test('uninstallAgentSkillBundle removes only the plugin-owned skill bundle directory', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-uninstall-'))
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'studio/director',
    files: [{ path: 'agent-skills/director/SKILL.md', content: '---\nname: Director\ndescription: Director\n---\nDirector' }],
  })
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'other',
    files: [{ path: 'agent-skills/other/SKILL.md', content: '---\nname: Other\ndescription: Other\n---\nOther' }],
  })

  const result = uninstallAgentSkillBundle({ skillsDir, pluginId: 'studio/director' })

  assert.equal(result.pluginId, 'studio/director')
  assert.equal(result.removed, true)
  assert.equal(existsSync(join(skillsDir, 'plugins', 'studio_director')), false)
  assert.equal(existsSync(join(skillsDir, 'plugins', 'other', 'other', 'SKILL.md')), true)
})

test('uninstallAgentSkillBundle reports no-op for missing plugin bundle', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-uninstall-missing-'))
  const result = uninstallAgentSkillBundle({ skillsDir, pluginId: 'missing' })

  assert.equal(result.pluginId, 'missing')
  assert.equal(result.removed, false)
})

test('listAgentSkillBundlePlugins returns installed plugin-owned bundle directories', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'movscript-agent-skill-bundle-list-'))
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'zeta',
    files: [{ path: 'agent-skills/zeta/SKILL.md', content: '---\nname: Zeta\ndescription: Zeta\n---\nZeta' }],
  })
  installAgentSkillBundle({
    skillsDir,
    pluginId: 'alpha/plugin',
    files: [{ path: 'agent-skills/alpha/SKILL.md', content: '---\nname: Alpha\ndescription: Alpha\n---\nAlpha' }],
  })

  assert.deepEqual(listAgentSkillBundlePlugins(skillsDir), [
    { pluginId: 'alpha_plugin', path: 'plugins/alpha_plugin' },
    { pluginId: 'zeta', path: 'plugins/zeta' },
  ])
})

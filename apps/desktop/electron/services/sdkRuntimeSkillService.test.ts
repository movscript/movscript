import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ensureSdkRuntimeDefaultSkills,
  listSdkRuntimeSkills,
} from './sdkRuntimeSkillService'

test('SDK runtime default skill bootstrap installs the root plugin once and respects manual removal', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-skills-'))
  try {
    const codex = ensureSdkRuntimeDefaultSkills({
      cwd,
      provider: { id: 'codex', kind: 'codex' },
      runtime: { api: 'codex-sdk' },
    })
    const claude = ensureSdkRuntimeDefaultSkills({
      cwd,
      provider: { id: 'claude', kind: 'claude' },
      runtime: { api: 'claude-sdk' },
    })

    assert.equal(codex.installed, true)
    assert.equal(claude.installed, false)
    assert.equal(Boolean(codex.targetDir), true)
    assert.equal(Boolean(claude.targetDir), true)
    assert.equal(existsSync(join(codex.targetDir!, 'domain', 'SKILL.md')), true)
    assert.equal(existsSync(join(claude.targetDir!, 'domain', 'SKILL.md')), true)

    const lock = readFileSync(join(cwd, '.agents', 'plugins', 'default-skills-lock.json'), 'utf8')
    assert.match(lock, /"providerTarget": "codex"/)
    assert.match(lock, /"providerTarget": "claude"/)

    const listed = listSdkRuntimeSkills({
      provider: { id: 'codex', kind: 'codex' },
      runtime: { id: 'codex-codex-sdk', api: 'codex-sdk' },
      workspaceDir: cwd,
      cwds: [cwd],
    })
    assert.equal(listed.skills.some((skill) => skill.name === 'domain' && skill.providerTarget === 'codex'), true)

    rmSync(codex.targetDir!, { recursive: true, force: true })
    const afterRemoval = ensureSdkRuntimeDefaultSkills({
      cwd,
      provider: { id: 'codex', kind: 'codex' },
      runtime: { api: 'codex-sdk' },
    })
    assert.equal(afterRemoval.installed, false)
    assert.equal(existsSync(join(codex.targetDir!, 'domain', 'SKILL.md')), false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('SDK runtime default skills install once at workspace root and project cwd inherits them', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-inherited-skills-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const projectCwd = join(root, 'project')
    mkdirSync(projectCwd, { recursive: true })

    const inherited = ensureSdkRuntimeDefaultSkills({
      cwd: projectCwd,
      workspaceDir,
      provider: { id: 'codex', kind: 'codex' },
      runtime: { api: 'codex-sdk' },
    })

    const rootSkillDir = join(workspaceDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled')
    const projectSkillDir = join(projectCwd, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled')
    assert.equal(inherited.installed, true)
    assert.equal(inherited.inheritedFromRoot, true)
    assert.equal(inherited.targetDir, rootSkillDir)
    assert.equal(existsSync(join(rootSkillDir, 'domain', 'SKILL.md')), true)
    assert.equal(existsSync(join(projectSkillDir, 'domain', 'SKILL.md')), false)

    const listed = listSdkRuntimeSkills({
      provider: { id: 'codex', kind: 'codex' },
      runtime: { id: 'codex-codex-sdk', api: 'codex-sdk' },
      workspaceDir,
      cwds: [projectCwd],
    })
    const domainSkill = listed.skills.find((skill) => skill.name === 'domain' && skill.providerTarget === 'codex')
    assert.ok(domainSkill)
    assert.equal(domainSkill.inherited, true)
    assert.equal(domainSkill.layer, 'workspace-root')
    assert.equal(domainSkill.sourceRoot, join(workspaceDir, '.codex', 'skills'))

    mkdirSync(join(projectSkillDir, 'domain'), { recursive: true })
    writeFileSync(join(projectSkillDir, 'domain', 'SKILL.md'), [
      '---',
      'name: domain',
      'description: Project domain override.',
      '---',
      '',
      'Use the project-specific domain override.',
      '',
    ].join('\n'), 'utf8')

    const overridden = listSdkRuntimeSkills({
      provider: { id: 'codex', kind: 'codex' },
      runtime: { id: 'codex-codex-sdk', api: 'codex-sdk' },
      workspaceDir,
      cwds: [projectCwd],
    })
    const domainSkills = overridden.skills.filter((skill) => skill.name === 'domain' && skill.providerTarget === 'codex')
    assert.equal(domainSkills.length, 1)
    assert.equal(domainSkills[0]?.inherited, false)
    assert.equal(domainSkills[0]?.layer, 'project-cwd')
    assert.match(domainSkills[0]?.instruction ?? '', /project-specific domain override/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SDK runtime default skills fall back to workspace root when no cwd is provided', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-root-skills-'))
  try {
    const workspaceDir = join(root, 'workspace')

    const installed = ensureSdkRuntimeDefaultSkills({
      workspaceDir,
      provider: { id: 'codex', kind: 'codex' },
      runtime: { api: 'codex-sdk' },
    })

    const rootSkillDir = join(workspaceDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled')
    assert.equal(installed.installed, true)
    assert.equal(installed.inheritedFromRoot, false)
    assert.equal(installed.targetDir, rootSkillDir)
    assert.equal(existsSync(join(rootSkillDir, 'domain', 'SKILL.md')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

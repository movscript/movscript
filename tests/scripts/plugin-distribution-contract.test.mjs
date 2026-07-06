import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()

test('plugin distribution source hash ignores local runtime staging output', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-distribution-'))

  try {
    const scriptPath = join(tempDir, 'scripts/check-plugin-distribution.mjs')
    mkdirSync(join(tempDir, 'scripts'), { recursive: true })
    cpSync(resolve(root, 'scripts/check-plugin-distribution.mjs'), scriptPath)

    writeJSON(join(tempDir, 'package.json'), { version: '0.1.41' })
    writeJSON(join(tempDir, 'apps/plugin/package.json'), {
      name: '@movscript/plugin-movscript',
      version: '0.1.41',
    })
    writeJSON(join(tempDir, 'apps/plugin/.agent-package/package.json'), {
      schema: 'movscript.agent-package.v1',
      id: 'movscript',
      name: 'MovScript',
      version: '0.1.41',
      kind: 'runtime-agent',
      targets: [{ id: 'codex' }],
    })
    writeJSON(join(tempDir, 'apps/plugin/.codex-plugin/plugin.json'), {
      version: '0.1.41',
    })
    writeJSON(join(tempDir, 'apps/plugin/.provider-plugin/plugin.json'), {
      version: '0.1.41',
    })
    writeFile(join(tempDir, 'apps/plugin/.mcp.json'), '{}\n')
    writeFile(join(tempDir, 'apps/plugin/assets/logo.txt'), 'logo\n')
    writeFile(join(tempDir, 'apps/plugin/bin/movscript'), '#!/usr/bin/env node\n')
    writeFile(join(tempDir, 'apps/plugin/bin/movscript.mjs'), 'console.log("movscript")\n')
    writeFile(join(tempDir, 'apps/plugin/skills/runtime/SKILL.md'), '# Runtime\n')
    writeFile(join(tempDir, 'apps/plugin/README.md'), '# Plugin\n')

    const writeResult = spawnSync(process.execPath, [scriptPath, '--write'], {
      cwd: tempDir,
      encoding: 'utf8',
    })
    assert.equal(writeResult.status, 0, writeResult.stderr || writeResult.stdout)

    const manifestPath = join(tempDir, 'plugins/movscript/manifest.runtime.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    writeFile(
      join(tempDir, 'plugins/movscript/runtime/services/data-service/bin/movscript-server'),
      'local runtime staging output\n',
    )

    const checkResult = spawnSync(process.execPath, [scriptPath, '--check'], {
      cwd: tempDir,
      encoding: 'utf8',
    })
    assert.equal(checkResult.status, 0, checkResult.stderr || checkResult.stdout)
    assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).bundleHash, manifest.bundleHash)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

function writeJSON(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeFile(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, value, 'utf8')
}

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cmdInit } from './init.js'

test('init creates provider manifest without Codex compatibility manifest by default', async () => {
  const cwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'movscript-cli-init-'))
  const logs: string[] = []
  const originalLog = console.log
  try {
    process.chdir(dir)
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }

    await cmdInit('story-plugin', {})

    const projectDir = join(dir, 'story-plugin')
    assert.equal(existsSync(join(projectDir, '.provider-plugin', 'plugin.json')), true)
    assert.equal(existsSync(join(projectDir, '.codex-plugin', 'plugin.json')), false)
    assert.equal(logs.some((line) => line.includes('.provider-plugin/plugin.json')), true)
    assert.equal(logs.some((line) => line.includes('.codex-plugin/plugin.json')), false)
  } finally {
    console.log = originalLog
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('production add allocates production id from title when omitted', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-production-id-'))
  const result = runMovscript(['--cwd', projectDir, 'production', 'add', '--title', 'Trailer Cut', '--json'])

  assert.equal(result.json.productionId, 'trailer_cut')
  assert.equal(result.json.productionPath, 'productions/trailer_cut/production.json')

  const written = JSON.parse(readFileSync(join(projectDir, 'productions/trailer_cut/production.json'), 'utf8'))
  assert.equal(written.id, 'trailer_cut')
  assert.equal(written.title, 'Trailer Cut')
})

function runMovscript(args, options = {}) {
  const child = spawnSync(process.execPath, ['dist/index.cjs', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const expectedStatus = options.expectStatus ?? 0
  assert.equal(child.status, expectedStatus, child.stderr || child.stdout)
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    json: JSON.parse(child.stdout),
  }
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const scriptPath = new URL('../../../install.sh', import.meta.url)
const source = readFileSync(scriptPath, 'utf8')

test('install script is valid POSIX shell syntax', () => {
  const result = spawnSync('sh', ['-n', scriptPath.pathname], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('install script defaults to GitHub release assets with checksum verification', () => {
  assert.match(source, /REPO="\$\{MOVSCRIPT_GITHUB_REPO:-movscript\/movscript\}"/)
  assert.match(source, /ASSET="\$\{MOVSCRIPT_ASSET:-movscript-desktop-macos-arm64-Movscript\.dmg\}"/)
  assert.match(source, /CHECKSUM_ASSET="\$\{MOVSCRIPT_CHECKSUM_ASSET:-SHA256SUMS\.txt\}"/)
  assert.match(source, /releases\/latest\/download/)
  assert.match(source, /checksum verified/)
})

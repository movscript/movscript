import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('Desktop and Agent Plugin attach to local surface runtime instead of owning business services', () => {
  const supplement = read('docs/movscript-surface-runtime-supplement.zh-CN.md')
  const desktopRefresh = read('apps/desktop/scripts/dev-local-daemon-refresh.mjs')
  const localSurfaceManifest = read('services/local-surface-host/program.manifest.ts')

  assert.match(supplement, /movscript\.local-node/)
  assert.match(supplement, /local-surface-host/)
  assert.match(supplement, /desktop-surface-host/)
  assert.match(supplement, /Project\/Editing\/Data/)

  assert.match(desktopRefresh, /const localNodeApplicationId = 'movscript\.local-node'/)
  assert.match(desktopRefresh, /movscript\.local-node\.control/)
  assert.match(desktopRefresh, /movscript\.local-surface\.host/)

  assert.match(localSurfaceManifest, /profiles: \[[^\]]*'plugin-full-local'/)
  assert.match(localSurfaceManifest, /profiles: \[[^\]]*'desktop-connected'/)
})

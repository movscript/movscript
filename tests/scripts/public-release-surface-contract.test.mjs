import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

test('GitHub release publishes Agent Plugin and Desktop as the two public product tracks', () => {
  const releaseWorkflow = read('.github/workflows/release.yml')
  const releaseNotes = read('.github/release-workspace-notes.md')
  const scriptsReadme = read('scripts/README.md')

  assert.match(releaseWorkflow, /package-plugin:/)
  assert.match(releaseWorkflow, /name: Package Agent Plugin/)
  assert.match(releaseWorkflow, /pnpm run release -- package --app plugin/)
  assert.match(releaseWorkflow, /name: movscript-agent-plugin/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-macos-arm64/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-macos-x64/)
  assert.match(releaseWorkflow, /artifact: movscript-desktop-windows-x64/)
  assert.match(releaseWorkflow, /needs: \[package, package-plugin\]/)

  assert.match(releaseNotes, /Movscript Agent Plugin And Desktop/)
  assert.match(releaseNotes, /Movscript Agent Plugin/)
  assert.match(releaseNotes, /Movscript Desktop/)
  assert.match(releaseNotes, /movscript-agent-plugin/)
  assert.match(releaseNotes, /movscript\.local-node` daemon/)
  assert.match(releaseNotes, /not a third public download choice/)

  assert.match(scriptsReadme, /Agent Plugin only/)
  assert.match(scriptsReadme, /Desktop App/)
  assert.match(scriptsReadme, /not a third public release track/)
})

test('GitHub Pages install surface keeps plugin-only and Desktop paths separate', () => {
  const installDoc = read('docs/install.md')
  const pagesWorkflow = read('.github/workflows/pages.yml')
  const page = read('site/index.html')

  assert.match(installDoc, /Movscript publishes two app releases/)
  assert.match(installDoc, /Agent Plugin only/)
  assert.match(installDoc, /Desktop App/)
  assert.match(installDoc, /install-plugin\.sh/)
  assert.match(installDoc, /install-desktop\.sh/)
  assert.match(installDoc, /plugin installer .* does not install or launch the Desktop app/s)

  assert.match(pagesWorkflow, /cp install-desktop\.sh public\/install-desktop\.sh/)
  assert.match(pagesWorkflow, /cp install-plugin\.sh public\/install-plugin\.sh/)

  assert.match(page, /Agent plugin only/)
  assert.match(page, /Desktop app/)
  assert.match(page, /data-release-asset="plugin"/)
  assert.match(page, /data-release-asset="macos-arm64"/)
  assert.match(page, /data-release-asset="macos-x64"/)
  assert.match(page, /data-release-asset="windows-x64"/)
  assert.match(page, /Desktop reuses the same local runtime daemon/)
  assert.match(page, /Desktop 与 Agent 插件和 CLI 复用同一个本机 runtime daemon/)
  assert.doesNotMatch(page, /Desktop[^<。]*owner/)
})

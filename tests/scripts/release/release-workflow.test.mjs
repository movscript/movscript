import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const releaseWorkflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/release.yml'), 'utf8')

test('release workflow packages every desktop target through one parameterized command', () => {
  assert.match(releaseWorkflow, /pnpm run release -- package-desktop --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
  for (const pair of [
    ['package-platform: darwin', 'package-arch: arm64'],
    ['package-platform: darwin', 'package-arch: x64'],
    ['package-platform: linux', 'package-arch: x64'],
    ['package-platform: linux', 'package-arch: arm64'],
    ['package-platform: win32', 'package-arch: x64'],
  ]) {
    assert.match(releaseWorkflow, new RegExp(pair[0]))
    assert.match(releaseWorkflow, new RegExp(pair[1]))
  }
})

test('release workflow downloads ffmpeg-static in each desktop package job', () => {
  for (const pair of [
    ['ffmpeg-platform: darwin', 'ffmpeg-arch: x64'],
    ['ffmpeg-platform: darwin', 'ffmpeg-arch: arm64'],
    ['ffmpeg-platform: linux', 'ffmpeg-arch: x64'],
    ['ffmpeg-platform: linux', 'ffmpeg-arch: arm64'],
    ['ffmpeg-platform: win32', 'ffmpeg-arch: x64'],
  ]) {
    assert.match(releaseWorkflow, new RegExp(pair[0]))
    assert.match(releaseWorkflow, new RegExp(pair[1]))
  }
  assert.match(releaseWorkflow, /release -- download-ffmpeg-static --platform=\$\{\{\s*matrix\.ffmpeg-platform\s*\}\} --arch=\$\{\{\s*matrix\.ffmpeg-arch\s*\}\}/)
})

test('release workflow uploads architecture-specific desktop artifact names', () => {
  for (const artifact of [
    'movscript-desktop-macos-x64',
    'movscript-desktop-macos-arm64',
    'movscript-desktop-linux-x64',
    'movscript-desktop-linux-arm64',
    'movscript-desktop-windows-x64',
  ]) {
    assert.match(releaseWorkflow, new RegExp(`artifact: ${artifact}`))
  }
})

test('release workflow installs locked dependencies without mutating package specs', () => {
  assert.doesNotMatch(releaseWorkflow, /movscript-lang-deps\.mjs latest/)
  assert.doesNotMatch(releaseWorkflow, /pnpm install --no-frozen-lockfile/)
  assert.match(releaseWorkflow, /pnpm install --frozen-lockfile/)
})

test('release workflow verifies readiness before packaging and smoke-tests runnable packages', () => {
  assert.match(releaseWorkflow, /pnpm run release -- verify-release-readiness --tag="\$RELEASE_TAG" --platform=\$\{\{\s*matrix\.package-platform\s*\}\}/)
  assert.match(releaseWorkflow, /MOVSCRIPT_RELEASE_REQUIRE_SIGNING:\s+\$\{\{\s*vars\.MOVSCRIPT_RELEASE_REQUIRE_SIGNING \|\| '0'\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- smoke-desktop-package --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
})

test('release workflow checks out and builds pinned private app-server dependencies', () => {
  assert.match(releaseWorkflow, /uses:\s+actions\/create-github-app-token@v1/)
  assert.match(releaseWorkflow, /app-id:\s+\$\{\{\s*vars\.MOVSCRIPT_DEPS_APP_ID \|\| secrets\.MOVSCRIPT_DEPS_APP_ID\s*\}\}/)
  assert.match(releaseWorkflow, /repository:\s+\$\{\{\s*steps\.binary-deps\.outputs\.mova_repository\s*\}\}/)
  assert.match(releaseWorkflow, /repository:\s+\$\{\{\s*steps\.binary-deps\.outputs\.codex_repository\s*\}\}/)
  assert.match(releaseWorkflow, /uses:\s+actions\/cache@v4/)
  assert.match(releaseWorkflow, /deps\/mova\/codex-rs\/target/)
  assert.match(releaseWorkflow, /deps\/codex\/codex-rs\/target/)
  assert.match(releaseWorkflow, /steps\.binary-deps\.outputs\.mova_ref/)
  assert.match(releaseWorkflow, /steps\.binary-deps\.outputs\.codex_ref/)
  assert.match(releaseWorkflow, /pnpm run release -- build-app-server-deps --platform=\$\{\{\s*matrix\.package-platform\s*\}\} --arch=\$\{\{\s*matrix\.package-arch\s*\}\}/)
})

test('release workflow does not package Windows ARM64 without a vetted ffmpeg-static source', () => {
  assert.doesNotMatch(releaseWorkflow, /package-platform: win32\s+package-arch: arm64/)
  assert.doesNotMatch(releaseWorkflow, /artifact: movscript-desktop-windows-arm64/)
})

test('release workflow collects package artifacts without plugin duplicates', () => {
  assert.match(releaseWorkflow, /MOVSCRIPT_COLLECT_PLUGINS:\s+'0'/)
  assert.match(releaseWorkflow, /MOVSCRIPT_ARTIFACT_PREFIX:\s+\$\{\{\s*matrix\.artifact\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release -- collect/)
  assert.match(releaseWorkflow, /merge-multiple:\s+true/)
  assert.match(releaseWorkflow, /find downloaded-artifacts -maxdepth 1 -type f -name '\*SHA256SUMS\.txt' -delete/)
})

test('release workflow creates attestations and uses the checked-in release notes file', () => {
  assert.match(releaseWorkflow, /id-token:\s+write/)
  assert.match(releaseWorkflow, /attestations:\s+write/)
  assert.match(releaseWorkflow, /uses:\s+actions\/attest-build-provenance@v2/)
  assert.match(releaseWorkflow, /--notes-file \.github\/release-workspace-notes\.md/)
  assert.doesNotMatch(releaseWorkflow, /release-draft-notes\.md/)
})

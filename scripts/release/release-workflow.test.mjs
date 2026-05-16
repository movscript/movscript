import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const releaseWorkflow = await readFile(resolve(import.meta.dirname, '../../.github/workflows/release.yml'), 'utf8')

test('release workflow packages every explicit desktop target', () => {
  for (const command of [
    'package:desktop:mac:x64',
    'package:desktop:mac:arm64',
    'package:desktop:linux:x64',
    'package:desktop:linux:arm64',
    'package:desktop:win',
  ]) {
    assert.match(releaseWorkflow, new RegExp(`command: ${command}`))
  }
})

test('release workflow downloads ffmpeg-static before checks and desktop packaging', () => {
  assert.match(releaseWorkflow, /pnpm run release:download-ffmpeg-static:matrix/)
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
  assert.match(releaseWorkflow, /release:download-ffmpeg-static -- --platform=\$\{\{\s*matrix\.ffmpeg-platform\s*\}\} --arch=\$\{\{\s*matrix\.ffmpeg-arch\s*\}\}/)
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

test('release workflow does not package Windows ARM64 without a vetted ffmpeg-static source', () => {
  assert.doesNotMatch(releaseWorkflow, /command: package:desktop:win:arm64/)
  assert.doesNotMatch(releaseWorkflow, /artifact: movscript-desktop-windows-arm64/)
})

test('release workflow collects package artifacts without plugin duplicates', () => {
  assert.match(releaseWorkflow, /MOVSCRIPT_COLLECT_PLUGINS:\s+'0'/)
  assert.match(releaseWorkflow, /MOVSCRIPT_ARTIFACT_PREFIX:\s+\$\{\{\s*matrix\.artifact\s*\}\}/)
  assert.match(releaseWorkflow, /pnpm run release:collect/)
  assert.match(releaseWorkflow, /merge-multiple:\s+true/)
  assert.match(releaseWorkflow, /find downloaded-artifacts -maxdepth 1 -type f -name '\*SHA256SUMS\.txt' -delete/)
})

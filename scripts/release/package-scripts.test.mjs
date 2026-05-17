import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../../package.json'), 'utf8'))
const frontendPackageJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../../apps/frontend/package.json'), 'utf8'))
const electronBuilderConfig = await readFile(resolve(import.meta.dirname, '../../apps/frontend/electron-builder.yml'), 'utf8')
const ffmpegReadme = await readFile(resolve(import.meta.dirname, '../../apps/frontend/vendor/ffmpeg/README.md'), 'utf8')

test('desktop package scripts pass explicit target platforms for cross-platform builds', () => {
  assert.match(packageJson.scripts['package:desktop'], /release:prepare-desktop/)
  assert.match(packageJson.scripts['package:desktop'], /movscript-frontend dist/)
  assert.match(packageJson.scripts['package:desktop'], /release:verify-desktop/)
  assert.match(packageJson.scripts['package:desktop:mac'], /release:prepare-desktop -- --platform=darwin/)
  assert.match(packageJson.scripts['package:desktop:mac'], /release:verify-desktop -- --platform=darwin/)
  assert.match(packageJson.scripts['package:desktop:mac:x64'], /release:prepare-desktop -- --platform=darwin --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:mac:x64'], /movscript-frontend dist:mac:x64/)
  assert.match(packageJson.scripts['package:desktop:mac:x64'], /release:verify-desktop -- --platform=darwin --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:mac:arm64'], /release:prepare-desktop -- --platform=darwin --arch=arm64/)
  assert.match(packageJson.scripts['package:desktop:mac:arm64'], /movscript-frontend dist:mac:arm64/)
  assert.match(packageJson.scripts['package:desktop:mac:arm64'], /release:verify-desktop -- --platform=darwin --arch=arm64/)
  assert.match(packageJson.scripts['package:desktop:linux:x64'], /release:prepare-desktop -- --platform=linux --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:linux:x64'], /movscript-frontend dist:linux:x64/)
  assert.match(packageJson.scripts['package:desktop:linux:x64'], /release:verify-desktop -- --platform=linux --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:linux:arm64'], /release:prepare-desktop -- --platform=linux --arch=arm64/)
  assert.match(packageJson.scripts['package:desktop:linux:arm64'], /movscript-frontend dist:linux:arm64/)
  assert.match(packageJson.scripts['package:desktop:linux:arm64'], /release:verify-desktop -- --platform=linux --arch=arm64/)
  assert.match(packageJson.scripts['package:desktop:win'], /release:prepare-desktop -- --platform=win32 --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:win'], /release:verify-desktop -- --platform=win32 --arch=x64/)
  assert.match(packageJson.scripts['package:desktop:win:arm64'], /release:prepare-desktop -- --platform=win32 --arch=arm64/)
  assert.match(packageJson.scripts['package:desktop:win:arm64'], /release:verify-desktop -- --platform=win32 --arch=arm64/)
})

test('frontend desktop dist scripts expose explicit target architectures', () => {
  assert.match(frontendPackageJson.scripts['dist:mac:x64'], /electron-builder --mac --x64/)
  assert.match(frontendPackageJson.scripts['dist:mac:arm64'], /electron-builder --mac --arm64/)
  assert.match(frontendPackageJson.scripts['dist:linux:x64'], /electron-builder --linux --x64/)
  assert.match(frontendPackageJson.scripts['dist:linux:arm64'], /electron-builder --linux --arm64/)
  assert.match(frontendPackageJson.scripts['dist:win'], /electron-builder --win --x64/)
  assert.match(frontendPackageJson.scripts['dist:win:arm64'], /electron-builder --win --arm64/)
  for (const script of [
    'dist',
    'dist:mac',
    'dist:mac:x64',
    'dist:mac:arm64',
    'dist:linux:x64',
    'dist:linux:arm64',
    'dist:win',
    'dist:win:arm64',
  ]) {
    assert.match(frontendPackageJson.scripts[script], /--publish never/)
  }
})

test('release scripts include ffmpeg staging and audit entry points', () => {
  assert.match(packageJson.scripts['release:check'], /release:audit-ffmpeg:matrix/)
  assert.equal(packageJson.scripts['release:stage-ffmpeg'], 'node scripts/release/stage-ffmpeg.mjs')
  assert.equal(packageJson.scripts['release:inspect-ffmpeg'], 'node scripts/release/stage-ffmpeg.mjs --inspect')
  assert.equal(packageJson.scripts['release:download-ffmpeg-static'], 'node scripts/release/download-ffmpeg-static.mjs')
  assert.equal(packageJson.scripts['release:download-ffmpeg-static:matrix'], 'node scripts/release/download-ffmpeg-static.mjs --matrix')
  assert.equal(packageJson.scripts['release:audit-ffmpeg'], 'node scripts/release/audit-ffmpeg.mjs')
  assert.equal(packageJson.scripts['release:audit-ffmpeg:all'], 'node scripts/release/audit-ffmpeg.mjs --all')
  assert.equal(packageJson.scripts['release:audit-ffmpeg:matrix'], 'node scripts/release/audit-ffmpeg.mjs --all --all-archs')
  assert.equal(packageJson.scripts['release:collect'], 'node scripts/release/collect-artifacts.mjs')
  assert.match(packageJson.scripts['test:release-scripts'], /stage-ffmpeg\.test\.mjs/)
  assert.match(packageJson.scripts['test:release-scripts'], /download-ffmpeg-static\.test\.mjs/)
  assert.match(packageJson.scripts['test:release-scripts'], /package-scripts\.test\.mjs/)
  assert.match(packageJson.scripts['test:release-scripts'], /collect-artifacts\.test\.mjs/)
  assert.match(packageJson.scripts['test:release-scripts'], /release-workflow\.test\.mjs/)
})

test('electron-builder bundles staged ffmpeg vendor resources', () => {
  assert.match(electronBuilderConfig, /extraResources:/)
  assert.match(electronBuilderConfig, /from:\s+vendor\/ffmpeg/)
  assert.match(electronBuilderConfig, /to:\s+ffmpeg/)
  assert.match(electronBuilderConfig, /"\*\*\/ffmpeg"/)
  assert.match(electronBuilderConfig, /"\*\*\/ffmpeg\.exe"/)
  assert.match(electronBuilderConfig, /"\*\*\/METADATA\.json"/)
  assert.doesNotMatch(electronBuilderConfig, /"\*\*\/\*"/)
})

test('electron-builder linux config avoids snap store publishing defaults', () => {
  assert.match(electronBuilderConfig, /linux:/)
  assert.match(electronBuilderConfig, /target:\s*\n\s+- AppImage/)
  assert.match(electronBuilderConfig, /category:\s+Utility/)
  assert.doesNotMatch(electronBuilderConfig, /snapStore/)
})

test('ffmpeg release docs describe audit remediation commands', () => {
  assert.match(ffmpegReadme, /stage with:/)
  assert.match(ffmpegReadme, /MOVSCRIPT_FFMPEG_VERSION/)
  assert.match(ffmpegReadme, /extracted binary build directory/)
  assert.match(ffmpegReadme, /release:inspect-ffmpeg/)
  assert.match(ffmpegReadme, /release:download-ffmpeg-static/)
  assert.match(ffmpegReadme, /release:download-ffmpeg-static:matrix/)
  assert.match(ffmpegReadme, /eugeneware\/ffmpeg-static/)
  assert.match(ffmpegReadme, /does not compile FFmpeg from\s+source/)
  assert.match(ffmpegReadme, /platform and architecture/)
})

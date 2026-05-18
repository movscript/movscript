import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  downloadAndStageFFmpegStatic,
  parseFFmpegStaticTag,
  runDownloadFFmpegStaticCli,
} from '../../../scripts/release/download-ffmpeg-static.mjs'
import {
  assertFFmpegStaticTarget,
  ffmpegStaticAssetName,
  ffmpegStaticBinaryUrl,
  ffmpegStaticLicense,
  ffmpegStaticSourcePlan,
} from '../../../scripts/release/release-common.mjs'

test('ffmpeg-static source plan maps supported release targets to GitHub assets', () => {
  assert.equal(ffmpegStaticAssetName('darwin', 'arm64'), 'ffmpeg-darwin-arm64.gz')
  assert.equal(ffmpegStaticBinaryUrl('win32', 'x64'), 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz')
  assert.deepEqual(ffmpegStaticSourcePlan('linux', 'arm64'), {
    arch: 'arm64',
    binary: 'ffmpeg',
    license: ffmpegStaticLicense,
    platform: 'linux',
    readmeUrl: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/linux-arm64.README',
    sourceUrl: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-arm64.gz',
    tag: 'b6.1.1',
  })
})

test('ffmpeg-static source plan rejects unsupported Windows ARM64', () => {
  assert.throws(() => assertFFmpegStaticTarget('win32', 'arm64'), /does not provide/)
  assert.throws(() => ffmpegStaticBinaryUrl('win32', 'arm64'), /does not provide/)
})

test('parseFFmpegStaticTag accepts explicit binary release tags', () => {
  assert.equal(parseFFmpegStaticTag([], 'b6.1.1'), 'b6.1.1')
  assert.equal(parseFFmpegStaticTag(['--tag=b7.0.2'], 'b6.1.1'), 'b7.0.2')
  assert.throws(() => parseFFmpegStaticTag(['--tag=latest'], 'b6.1.1'), /Unsupported/)
})

test('downloadAndStageFFmpegStatic downloads, expands, and stages metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-download-ffmpeg-static-'))
  try {
    const downloaded = []
    const result = await downloadAndStageFFmpegStatic(root, {
      platform: 'linux',
      arch: 'x64',
      runCheck: false,
      version: 'ffmpeg version 6.1.1-static',
      download: async (url, destinationPath) => {
        downloaded.push([url, destinationPath])
        await mkdir(resolve(destinationPath, '..'), { recursive: true })
        await writeFile(destinationPath, 'fake static ffmpeg')
      },
    })
    const target = resolve(root, 'apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg')
    const metadata = JSON.parse(await readFile(resolve(root, 'apps/frontend/vendor/ffmpeg/linux/x64/METADATA.json'), 'utf8'))
    assert.equal(result.target, target)
    assert.equal(downloaded[0][0], 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz')
    assert.equal(await readFile(target, 'utf8'), 'fake static ffmpeg')
    assert.equal(metadata.source_url, 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz')
    assert.equal(metadata.license, 'GPL-3.0-or-later')
    assert.equal(metadata.version, 'ffmpeg version 6.1.1-static')
    assert.equal((await stat(target)).mode & 0o111, 0o111)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runDownloadFFmpegStaticCli requires a version for non-current targets', async () => {
  const errors = []
  let exitCode = 0
  let called = false
  await runDownloadFFmpegStaticCli('/repo', {
    MOVSCRIPT_FFMPEG_VERSION: 'not a version line',
  }, ['--platform=linux', '--arch=x64'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    downloadAndStage: () => {
      called = true
      return {}
    },
  })
  assert.equal(exitCode, 1)
  assert.equal(called, false)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_VERSION/)
})

test('runDownloadFFmpegStaticCli can download the default release matrix', async () => {
  const staged = []
  let exitCode = 0
  await runDownloadFFmpegStaticCli('/repo', {}, ['--matrix'], {
    currentPlatform: 'linux',
    currentArch: 'x64',
    exit: (code) => { exitCode = code },
    log: () => undefined,
    downloadAndStage: async (root, options) => {
      staged.push([root, options])
      return {
        tag: options.tag,
        sourceUrl: `https://downloads.test/${options.platform}-${options.arch}.gz`,
        target: `${root}/${options.platform}/${options.arch}`,
      }
    },
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(staged.map((entry) => [entry[1].platform, entry[1].arch, entry[1].runCheck]), [
    ['darwin', 'x64', false],
    ['darwin', 'arm64', false],
    ['linux', 'x64', true],
    ['linux', 'arm64', false],
    ['win32', 'x64', false],
  ])
  assert.equal(staged.every((entry) => entry[1].version === 'ffmpeg version 6.1.1-static'), true)
})

test('runDownloadFFmpegStaticCli reports unsupported ffmpeg-static targets without downloading', async () => {
  const errors = []
  let exitCode = 0
  let called = false
  await runDownloadFFmpegStaticCli('/repo', {
    MOVSCRIPT_FFMPEG_VERSION: 'ffmpeg version 6.1.1-static',
  }, ['--platform=win32', '--arch=arm64'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    downloadAndStage: (...args) => {
      called = true
      return downloadAndStageFFmpegStatic(...args)
    },
  })
  assert.equal(exitCode, 1)
  assert.equal(called, true)
  assert.match(errors.join('\n'), /does not provide/)
})

test('runDownloadFFmpegStaticCli reports invalid target args as download errors', async () => {
  const errors = []
  let exitCode = 0
  let called = false
  await runDownloadFFmpegStaticCli('/repo', {
    MOVSCRIPT_FFMPEG_VERSION: 'ffmpeg version 6.1.1-static',
  }, ['--platform=freebsd', '--arch=x64'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    downloadAndStage: () => {
      called = true
      return {}
    },
  })
  assert.equal(exitCode, 1)
  assert.equal(called, false)
  assert.match(errors.join('\n'), /Unsupported ffmpeg-static download platform: freebsd/)
})

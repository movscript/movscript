import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  assertRedistributableSourcePath,
  inspectFFmpegSourceFromEnv,
  parseDesktopArch,
  parseDesktopPlatform,
  readFFmpegVersion,
  resolveDesktopFFmpegPath,
  resolveFFmpegSourceCandidate,
  runStageFFmpegCli,
  sha256File,
  stageFFmpegBinary,
  stageFFmpegFromEnv,
  validateFFmpegMetadataInput,
  verifyRunnableFFmpeg,
  writeFFmpegMetadata,
} from './stage-ffmpeg.mjs'

test('resolveDesktopFFmpegPath points at frontend vendor platform directories', () => {
  const root = resolve('/repo')
  assert.equal(resolveDesktopFFmpegPath(root, 'darwin', 'arm64'), resolve(root, 'apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg'))
  assert.equal(resolveDesktopFFmpegPath(root, 'linux', 'x64'), resolve(root, 'apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg'))
  assert.equal(resolveDesktopFFmpegPath(root, 'win32', 'arm64'), resolve(root, 'apps/frontend/vendor/ffmpeg/win32/arm64/ffmpeg.exe'))
})

test('verifyRunnableFFmpeg returns empty string for successful -version', () => {
  const message = verifyRunnableFFmpeg('/tmp/ffmpeg', process.cwd(), () => ({ status: 0, stdout: 'ffmpeg version test', stderr: '' }))
  assert.equal(message, '')
})

test('verifyRunnableFFmpeg includes stderr for failed -version', () => {
  const message = verifyRunnableFFmpeg('/tmp/ffmpeg', process.cwd(), () => ({ status: 1, stdout: '', stderr: 'bad binary' }))
  assert.match(message, /not runnable/)
  assert.match(message, /bad binary/)
})

test('verifyRunnableFFmpeg reports timed out -version checks clearly', () => {
  const message = verifyRunnableFFmpeg('/tmp/ffmpeg', process.cwd(), () => ({
    error: Object.assign(new Error('spawnSync ffmpeg ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    signal: 'SIGTERM',
    status: null,
    stdout: '',
    stderr: '',
  }))
  assert.match(message, /not runnable/)
  assert.match(message, /timed out after 5s/)
})

test('readFFmpegVersion returns the first version line', () => {
  const result = readFFmpegVersion('/tmp/ffmpeg', process.cwd(), () => ({ status: 0, stdout: 'ffmpeg version 6.1\nbuilt with test', stderr: '' }))
  assert.deepEqual(result, { version: 'ffmpeg version 6.1', error: '' })
})

test('readFFmpegVersion applies a bounded release-script timeout', () => {
  const calls = []
  const result = readFFmpegVersion('/tmp/ffmpeg', process.cwd(), (command, args, options) => {
    calls.push([command, args, options])
    return { status: 0, stdout: 'ffmpeg version timeout-test', stderr: '' }
  }, 1234)

  assert.equal(result.error, '')
  assert.equal(calls[0][2].timeout, 1234)
  assert.deepEqual(calls[0][2].stdio, ['ignore', 'pipe', 'pipe'])
})

test('stageFFmpegFromEnv requires source, source URL, and license before staging', () => {
  const staged = []
  const errors = []
  let exitCode = 0

  stageFFmpegFromEnv('/repo', {}, {
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    stageBinary: (...args) => staged.push(args),
    currentArch: 'arm64',
  })
  assert.equal(exitCode, 1)
  assert.equal(staged.length, 0)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_BIN/)

  errors.length = 0
  exitCode = 0
  stageFFmpegFromEnv('/repo', { MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg' }, {
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    stageBinary: (...args) => staged.push(args),
    currentArch: 'arm64',
  })
  assert.equal(exitCode, 1)
  assert.equal(staged.length, 0)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_SOURCE_URL/)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_LICENSE/)
})

test('runStageFFmpegCli reports staging errors without throwing', () => {
  const errors = []
  let exitCode = 0

  runStageFFmpegCli('/repo', {
    MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg',
    MOVSCRIPT_FFMPEG_SOURCE_URL: 'https://downloads.movscript.dev/ffmpeg',
    MOVSCRIPT_FFMPEG_LICENSE: 'LGPL-2.1-or-later',
  }, ['--platform=linux'], {
    currentPlatform: 'linux',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    log: () => undefined,
    stageBinary: () => { throw new Error('staged binary failed validation') },
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['staged binary failed validation'])
})

test('runStageFFmpegCli can inspect extracted binary directories without release metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-inspect-'))
  const sourceDir = join(dir, 'ffmpeg-build')
  const sourceBin = join(sourceDir, 'bin', 'ffmpeg')
  await mkdir(join(sourceDir, 'bin'), { recursive: true })
  await writeFile(sourceBin, 'fake ffmpeg', 'utf8')
  try {
    const logs = []
    let exitCode = 0
    runStageFFmpegCli('/repo', {
      MOVSCRIPT_FFMPEG_BIN: sourceDir,
    }, ['--inspect', '--platform=darwin', '--arch=arm64'], {
      currentPlatform: 'darwin',
      currentArch: 'arm64',
      exit: (code) => { exitCode = code },
      log: (message) => logs.push(message),
      logError: (message) => logs.push(message),
      spawn: () => ({ status: 0, stdout: 'ffmpeg version inspect-test', stderr: '' }),
    })
    assert.equal(exitCode, 0)
    assert.match(logs.join('\n'), new RegExp(`Resolved ffmpeg source for darwin arm64: ${sourceBin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.match(logs.join('\n'), /ffmpeg -version: ffmpeg version inspect-test/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runStageFFmpegCli inspect exits when a current-target binary is not runnable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-inspect-bad-'))
  const sourceBin = join(dir, 'ffmpeg')
  await writeFile(sourceBin, 'fake ffmpeg', 'utf8')
  try {
    const errors = []
    let exitCode = 0
    runStageFFmpegCli('/repo', {
      MOVSCRIPT_FFMPEG_BIN: sourceBin,
    }, ['--inspect', '--platform=linux', '--arch=x64'], {
      currentPlatform: 'linux',
      currentArch: 'x64',
      exit: (code) => { exitCode = code },
      log: () => undefined,
      logError: (message) => errors.push(message),
      spawn: () => ({ status: 1, stdout: '', stderr: 'bad binary' }),
    })
    assert.equal(exitCode, 1)
    assert.match(errors.join('\n'), /bad binary/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runStageFFmpegCli inspect skips version checks for non-current targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-inspect-cross-'))
  const sourceBin = join(dir, 'ffmpeg.exe')
  await writeFile(sourceBin, 'fake ffmpeg', 'utf8')
  try {
    const logs = []
    let exitCode = 0
    runStageFFmpegCli('/repo', {
      MOVSCRIPT_FFMPEG_BIN: sourceBin,
    }, ['--inspect', '--platform=win32', '--arch=x64'], {
      currentPlatform: 'darwin',
      currentArch: 'arm64',
      exit: (code) => { exitCode = code },
      log: (message) => logs.push(message),
      spawn: () => {
        throw new Error('cross-target inspect should not execute binary')
      },
    })
    assert.equal(exitCode, 0)
    assert.match(logs.join('\n'), /ffmpeg -version: skipped for non-current target win32 x64/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('inspectFFmpegSourceFromEnv reports missing inspect source before metadata checks', () => {
  const errors = []
  let exitCode = 0
  inspectFFmpegSourceFromEnv('/repo', {}, {
    platform: 'linux',
    arch: 'x64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
  })
  assert.equal(exitCode, 1)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_BIN/)
})

test('runStageFFmpegCli reports unsupported platforms without stack traces', () => {
  const errors = []
  let exitCode = 0

  runStageFFmpegCli('/repo', {}, ['--platform=freebsd'], {
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    log: () => undefined,
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Unsupported ffmpeg staging platform: freebsd'])
})

test('stageFFmpegFromEnv uses MOVSCRIPT_FFMPEG_PLATFORM for validation messages', () => {
  const staged = []
  const errors = []
  let exitCode = 0

  stageFFmpegFromEnv('/repo', { MOVSCRIPT_FFMPEG_PLATFORM: 'win32' }, {
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    stageBinary: (...args) => staged.push(args),
  })

  assert.equal(exitCode, 1)
  assert.equal(staged.length, 0)
  assert.match(errors.join('\n'), /for win32/)
})

test('stageFFmpegFromEnv stages the platform target with metadata', () => {
  const staged = []
  const logs = []
  let exitCode = 0

  stageFFmpegFromEnv('/repo', {
    MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg',
    MOVSCRIPT_FFMPEG_SOURCE_URL: 'https://downloads.movscript.dev/ffmpeg',
    MOVSCRIPT_FFMPEG_LICENSE: 'LGPL-2.1-or-later',
  }, {
    platform: 'linux',
    arch: 'arm64',
    currentPlatform: 'linux',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    log: (message) => logs.push(message),
    stageBinary: (...args) => staged.push(args),
  })

  assert.equal(exitCode, 0)
  assert.equal(staged.length, 1)
  assert.equal(staged[0][0], '/tmp/ffmpeg')
  assert.equal(staged[0][1], resolve('/repo/apps/frontend/vendor/ffmpeg/linux/arm64/ffmpeg'))
  assert.deepEqual(staged[0][4], {
    sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
    license: 'LGPL-2.1-or-later',
    version: undefined,
    arch: 'arm64',
    runCheck: true,
  })
  assert.match(logs.join('\n'), /Staged ffmpeg for linux/)
})

test('stageFFmpegFromEnv stages env-selected platform targets', () => {
  const staged = []

  stageFFmpegFromEnv('/repo', {
    MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg.exe',
    MOVSCRIPT_FFMPEG_PLATFORM: 'win32',
    MOVSCRIPT_FFMPEG_SOURCE_URL: 'https://downloads.movscript.dev/ffmpeg',
    MOVSCRIPT_FFMPEG_LICENSE: 'LGPL-2.1-or-later',
    MOVSCRIPT_FFMPEG_VERSION: 'ffmpeg version n6.1-win',
    MOVSCRIPT_FFMPEG_ARCH: 'x64',
  }, {
    currentPlatform: 'darwin',
    stageBinary: (...args) => staged.push(args),
  })

  assert.equal(staged.length, 1)
  assert.equal(staged[0][1], resolve('/repo/apps/frontend/vendor/ffmpeg/win32/x64/ffmpeg.exe'))
  assert.equal(staged[0][4].runCheck, false)
  assert.equal(staged[0][4].version, 'ffmpeg version n6.1-win')
  assert.equal(staged[0][4].arch, 'x64')
})

test('stageFFmpegFromEnv requires a version before cross-platform staging', () => {
  const staged = []
  const errors = []
  let exitCode = 0

  stageFFmpegFromEnv('/repo', {
    MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg.exe',
    MOVSCRIPT_FFMPEG_PLATFORM: 'win32',
    MOVSCRIPT_FFMPEG_SOURCE_URL: 'https://downloads.movscript.dev/ffmpeg',
    MOVSCRIPT_FFMPEG_LICENSE: 'LGPL-2.1-or-later',
  }, {
    currentPlatform: 'darwin',
    arch: 'x64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    stageBinary: (...args) => staged.push(args),
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(staged, [])
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_VERSION/)
  assert.match(errors.join('\n'), /for win32 x64 from darwin arm64/)
})

test('stageFFmpegFromEnv requires a version before same-platform cross-arch staging', () => {
  const staged = []
  const errors = []
  let exitCode = 0

  stageFFmpegFromEnv('/repo', {
    MOVSCRIPT_FFMPEG_BIN: '/tmp/ffmpeg',
    MOVSCRIPT_FFMPEG_SOURCE_URL: 'https://downloads.movscript.dev/ffmpeg',
    MOVSCRIPT_FFMPEG_LICENSE: 'LGPL-2.1-or-later',
  }, {
    platform: 'linux',
    arch: 'x64',
    currentPlatform: 'linux',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    stageBinary: (...args) => staged.push(args),
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(staged, [])
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_VERSION/)
  assert.match(errors.join('\n'), /for linux x64 from linux arm64/)
})

test('stageFFmpegFromEnv rejects unsupported env-selected platforms', () => {
  assert.throws(() => stageFFmpegFromEnv('/repo', {
    MOVSCRIPT_FFMPEG_PLATFORM: 'freebsd',
  }), /Unsupported/)
})

test('parseDesktopPlatform supports CLI and env-selected staging targets', () => {
  assert.equal(parseDesktopPlatform([], 'darwin'), 'darwin')
  assert.equal(parseDesktopPlatform(['--platform=linux'], 'darwin'), 'linux')
  assert.equal(parseDesktopPlatform(['--platform=win32'], 'darwin'), 'win32')
  assert.throws(() => parseDesktopPlatform(['--platform=freebsd'], 'darwin'), /Unsupported/)
  assert.throws(() => parseDesktopPlatform([], 'freebsd'), /Unsupported/)
})

test('parseDesktopArch supports CLI and env-selected staging targets', () => {
  assert.equal(parseDesktopArch([], 'arm64'), 'arm64')
  assert.equal(parseDesktopArch(['--arch=x64'], 'arm64'), 'x64')
  assert.equal(parseDesktopArch(['--arch=arm64'], 'x64'), 'arm64')
  assert.throws(() => parseDesktopArch(['--arch=ia32'], 'arm64'), /Unsupported/)
  assert.throws(() => parseDesktopArch([], 'ia32'), /Unsupported/)
})

test('stageFFmpegBinary copies and revalidates the target binary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-'))
  const source = join(dir, 'source-ffmpeg')
  const target = join(dir, 'vendor/darwin/ffmpeg')
  await writeFile(source, 'fake ffmpeg', 'utf8')
  try {
    const calls = []
    stageFFmpegBinary(source, target, dir, (command, args) => {
      calls.push([command, args])
      return { status: 0, stdout: 'ffmpeg version test', stderr: '' }
    }, { sourceUrl: 'https://downloads.movscript.dev/ffmpeg', license: 'LGPL-2.1-or-later', arch: process.arch })
    assert.equal(await readFile(target, 'utf8'), 'fake ffmpeg')
    assert.ok(((await stat(target)).mode & 0o111) !== 0)
    const metadata = JSON.parse(await readFile(join(dir, 'vendor/darwin/METADATA.json'), 'utf8'))
    assert.equal(metadata.binary, 'ffmpeg')
    assert.equal(metadata.arch, process.arch)
    assert.equal(metadata.license, 'LGPL-2.1-or-later')
    assert.equal(metadata.source_basename, 'source-ffmpeg')
    assert.equal(metadata.source_url, 'https://downloads.movscript.dev/ffmpeg')
    assert.equal(metadata.version, 'ffmpeg version test')
    assert.equal(metadata.sha256, sha256File(target))
    assert.equal(metadata.size_bytes, 'fake ffmpeg'.length)
    assert.deepEqual(calls, [
      [source, ['-version']],
      [target, ['-version']],
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary can stage from an extracted binary directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-dir-'))
  const sourceDir = join(dir, 'ffmpeg-static-build')
  const sourceBinDir = join(sourceDir, 'bin')
  const source = join(sourceBinDir, 'ffmpeg')
  const target = join(dir, 'vendor/darwin/ffmpeg')
  await mkdir(sourceBinDir, { recursive: true })
  await writeFile(source, 'fake ffmpeg', 'utf8')
  try {
    const calls = []
    stageFFmpegBinary(sourceDir, target, dir, (command, args) => {
      calls.push([command, args])
      return { status: 0, stdout: 'ffmpeg version directory-test', stderr: '' }
    }, { sourceUrl: 'https://downloads.movscript.dev/ffmpeg', license: 'LGPL-2.1-or-later', arch: process.arch })
    assert.equal(await readFile(target, 'utf8'), 'fake ffmpeg')
    const metadata = JSON.parse(await readFile(join(dir, 'vendor/darwin/METADATA.json'), 'utf8'))
    assert.equal(metadata.source_basename, 'ffmpeg')
    assert.deepEqual(calls, [
      [source, ['-version']],
      [target, ['-version']],
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveFFmpegSourceCandidate explains source archives instead of compiling them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-source-'))
  const sourceDir = join(dir, 'ffmpeg-8.1')
  await mkdir(join(sourceDir, 'libavcodec'), { recursive: true })
  await writeFile(join(sourceDir, 'configure'), '#!/bin/sh\n', 'utf8')
  try {
    assert.throws(
      () => resolveFFmpegSourceCandidate(sourceDir, 'ffmpeg'),
      /source code, not a prebuilt binary/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveFFmpegSourceCandidate reports binary-free directories clearly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-empty-'))
  try {
    assert.throws(
      () => resolveFFmpegSourceCandidate(dir, 'ffmpeg.exe'),
      /No ffmpeg\.exe binary found/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveFFmpegSourceCandidate prefers root and bin binaries over examples', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-pick-'))
  const sourceDir = join(dir, 'ffmpeg-static-build')
  const sampleDir = join(sourceDir, 'examples')
  const binDir = join(sourceDir, 'nested', 'bin')
  const rootBinary = join(sourceDir, 'ffmpeg')
  const sampleBinary = join(sampleDir, 'ffmpeg')
  const binBinary = join(binDir, 'ffmpeg')
  try {
    await mkdir(sampleDir, { recursive: true })
    await mkdir(binDir, { recursive: true })
    await writeFile(sampleBinary, 'sample ffmpeg', 'utf8')
    await writeFile(binBinary, 'bin ffmpeg', 'utf8')
    assert.equal(resolveFFmpegSourceCandidate(sourceDir, 'ffmpeg'), binBinary)
    await writeFile(rootBinary, 'root ffmpeg', 'utf8')
    assert.equal(resolveFFmpegSourceCandidate(sourceDir, 'ffmpeg'), rootBinary)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary stages cross-platform binaries with an explicit version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-cross-'))
  const source = join(dir, 'source-ffmpeg.exe')
  const target = join(dir, 'vendor/win32/ffmpeg.exe')
  await writeFile(source, 'fake win ffmpeg', 'utf8')
  try {
    const calls = []
    stageFFmpegBinary(source, target, dir, (command, args) => {
      calls.push([command, args])
      throw new Error('cross-platform binaries should not be executed')
    }, {
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'LGPL-2.1-or-later',
      arch: 'x64',
      version: 'ffmpeg version n6.1-win',
      runCheck: false,
    })
    assert.deepEqual(calls, [])
    assert.equal(await readFile(target, 'utf8'), 'fake win ffmpeg')
    const metadata = JSON.parse(await readFile(join(dir, 'vendor/win32/METADATA.json'), 'utf8'))
    assert.equal(metadata.binary, 'ffmpeg.exe')
    assert.equal(metadata.arch, 'x64')
    assert.equal(metadata.version, 'ffmpeg version n6.1-win')
    assert.equal(metadata.sha256, sha256File(target))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary requires a version when run checks are disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-cross-'))
  const source = join(dir, 'source-ffmpeg.exe')
  const target = join(dir, 'vendor/win32/ffmpeg.exe')
  await writeFile(source, 'fake win ffmpeg', 'utf8')
  try {
    assert.throws(() => stageFFmpegBinary(source, target, dir, () => {
      throw new Error('not expected')
    }, {
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'LGPL-2.1-or-later',
      arch: 'x64',
      runCheck: false,
    }), /MOVSCRIPT_FFMPEG_VERSION/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary rejects invalid cross-platform version lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-cross-'))
  const source = join(dir, 'source-ffmpeg.exe')
  const target = join(dir, 'vendor/win32/ffmpeg.exe')
  await writeFile(source, 'fake win ffmpeg', 'utf8')
  try {
    assert.throws(() => stageFFmpegBinary(source, target, dir, () => {
      throw new Error('not expected')
    }, {
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'LGPL-2.1-or-later',
      arch: 'x64',
      version: 'n6.1-win',
      runCheck: false,
    }), /MOVSCRIPT_FFMPEG_VERSION/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary validates metadata before copying the binary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-'))
  const source = join(dir, 'source-ffmpeg')
  const target = join(dir, 'vendor/darwin/ffmpeg')
  await writeFile(source, 'fake ffmpeg', 'utf8')
  try {
    assert.throws(() => stageFFmpegBinary(source, target, dir, () => ({ status: 0, stdout: 'ffmpeg version test', stderr: '' }), {
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'redistributable ffmpeg build',
      arch: process.arch,
    }), /SPDX-style/)
    await assert.rejects(stat(target), /ENOENT/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stageFFmpegBinary rejects package-manager and system ffmpeg sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-'))
  const source = join(dir, 'ffmpeg')
  await writeFile(source, 'fake ffmpeg', 'utf8')
  try {
    assert.throws(() => assertRedistributableSourcePath('/opt/homebrew/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('/opt/local/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('/usr/local/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('/usr/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('/nix/store/hash-ffmpeg/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('/home/linuxbrew/.linuxbrew/bin/ffmpeg'), /Refusing to stage/)
    assert.throws(() => assertRedistributableSourcePath('C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe'), /Refusing to stage/)
    assert.doesNotThrow(() => assertRedistributableSourcePath(source))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeFFmpegMetadata records reproducible staging details', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-meta-'))
  const target = join(dir, 'vendor/linux/ffmpeg')
  try {
    await mkdir(join(dir, 'vendor/linux'), { recursive: true })
    await writeFile(target, 'fake ffmpeg', 'utf8')
    const metadataPath = writeFFmpegMetadata({
      target,
      source: '/release/ffmpeg-static',
      version: 'ffmpeg version test',
      sizeBytes: 11,
      sha256: 'abc123',
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'LGPL-2.1-or-later',
      arch: 'x64',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    assert.deepEqual(metadata, {
      arch: 'x64',
      binary: 'ffmpeg',
      license: 'LGPL-2.1-or-later',
      source_basename: 'ffmpeg-static',
      source_url: 'https://downloads.movscript.dev/ffmpeg',
      staged_at: '2026-05-16T00:00:00.000Z',
      sha256: 'abc123',
      size_bytes: 11,
      version: 'ffmpeg version test',
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeFFmpegMetadata requires source and license details', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-meta-'))
  const target = join(dir, 'vendor/linux/ffmpeg')
  try {
    await mkdir(join(dir, 'vendor/linux'), { recursive: true })
    await writeFile(target, 'fake ffmpeg', 'utf8')
    assert.throws(() => writeFFmpegMetadata({
      target,
      source: '/release/ffmpeg-static',
      version: 'ffmpeg version test',
      sizeBytes: 11,
    }), /sourceUrl and license/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeFFmpegMetadata validates source URL and license shape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-meta-'))
  const target = join(dir, 'vendor/linux/ffmpeg')
  try {
    await mkdir(join(dir, 'vendor/linux'), { recursive: true })
    await writeFile(target, 'fake ffmpeg', 'utf8')
    const base = {
      target,
      source: '/release/ffmpeg-static',
      version: 'ffmpeg version test',
      sizeBytes: 11,
      sha256: 'abc123',
      sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
      license: 'LGPL-2.1-or-later',
      arch: 'x64',
    }
    assert.throws(() => writeFFmpegMetadata({ ...base, sourceUrl: 'file:///tmp/ffmpeg' }), /http\(s\) URL/)
    assert.throws(() => writeFFmpegMetadata({ ...base, sourceUrl: 'https://example.com/ffmpeg' }), /example placeholder/)
    assert.throws(() => writeFFmpegMetadata({ ...base, sourceUrl: 'https://example.org/ffmpeg' }), /example placeholder/)
    assert.throws(() => writeFFmpegMetadata({ ...base, sourceUrl: 'https://example.net/ffmpeg' }), /example placeholder/)
    assert.throws(() => writeFFmpegMetadata({ ...base, license: 'redistributable ffmpeg build' }), /SPDX-style/)
    assert.doesNotThrow(() => writeFFmpegMetadata({ ...base, license: 'LGPL-2.1-or-later OR GPL-3.0-or-later' }))
    assert.throws(() => writeFFmpegMetadata({ ...base, arch: 'ia32' }), /arch/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('validateFFmpegMetadataInput accepts SPDX-style release metadata', () => {
  assert.doesNotThrow(() => validateFFmpegMetadataInput({
    sourceUrl: 'https://downloads.movscript.dev/ffmpeg',
    license: 'LGPL-2.1-or-later OR GPL-3.0-or-later',
    arch: 'arm64',
  }))
})

test('sha256File hashes staged binaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-stage-ffmpeg-hash-'))
  const target = join(dir, 'ffmpeg')
  try {
    await writeFile(target, 'fake ffmpeg', 'utf8')
    assert.equal(sha256File(target), '03e8ed15e6d0f4309bc358fd2dfa11b53805746e540860b72c9504e4d988044e')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

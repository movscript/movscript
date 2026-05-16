import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  findUnpackedResourceDirs,
  parseDesktopArch,
  parseDesktopPlatform,
  resolveDesktopFFmpegPath,
  runVerifyDesktopPackageCli,
  sha256File,
  verifyBundledDesktopFFmpeg,
  verifyDesktopFFmpeg,
  verifyDesktopFFmpegMetadata,
} from './verify-desktop-package.mjs'

test('resolveDesktopFFmpegPath uses platform-specific binary names', () => {
  const root = resolve('/repo')
  assert.equal(resolveDesktopFFmpegPath(root, 'darwin', 'arm64'), resolve(root, 'apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg'))
  assert.equal(resolveDesktopFFmpegPath(root, 'linux', 'x64'), resolve(root, 'apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg'))
  assert.equal(resolveDesktopFFmpegPath(root, 'win32', 'arm64'), resolve(root, 'apps/frontend/vendor/ffmpeg/win32/arm64/ffmpeg.exe'))
})

test('parseDesktopPlatform supports current and explicit desktop targets', () => {
  assert.equal(parseDesktopPlatform([], 'darwin'), 'darwin')
  assert.equal(parseDesktopPlatform(['--platform=win32'], 'darwin'), 'win32')
  assert.equal(parseDesktopPlatform(['--platform=linux'], 'darwin'), 'linux')
  assert.throws(() => parseDesktopPlatform(['--platform=freebsd'], 'darwin'), /Unsupported/)
})

test('runVerifyDesktopPackageCli reports unsupported platforms without stack traces', () => {
  const errors = []
  let exitCode = 0
  let verifyCalled = false

  runVerifyDesktopPackageCli('/repo', ['--platform=freebsd'], {
    currentPlatform: 'darwin',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    verifyPackage: () => { verifyCalled = true },
  })

  assert.equal(exitCode, 1)
  assert.equal(verifyCalled, false)
  assert.deepEqual(errors, ['Unsupported desktop package platform: freebsd'])
})

test('runVerifyDesktopPackageCli passes parsed platforms to verification', () => {
  const calls = []

  runVerifyDesktopPackageCli('/repo', ['--platform=win32', '--arch=x64'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    verifyPackage: (...args) => calls.push(args),
  })

  assert.deepEqual(calls, [['/repo', { platform: 'win32', arch: 'x64' }]])
})

test('parseDesktopArch supports current and explicit desktop targets', () => {
  assert.equal(parseDesktopArch([], 'arm64'), 'arm64')
  assert.equal(parseDesktopArch(['--arch=x64'], 'arm64'), 'x64')
  assert.equal(parseDesktopArch(['--arch=arm64'], 'x64'), 'arm64')
  assert.throws(() => parseDesktopArch(['--arch=ia32'], 'arm64'), /Unsupported/)
})

test('verifyDesktopFFmpeg reports missing binaries', () => {
  const message = verifyDesktopFFmpeg(resolve('/missing/ffmpeg'))
  assert.match(message, /ffmpeg prerequisite is missing/)
})

test('verifyDesktopFFmpeg runs -version against existing binaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  await writeMetadata(dir)
  try {
    const calls = []
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, (command, args) => {
      calls.push([command, args])
      return { status: 0, stdout: 'ffmpeg version test', stderr: '' }
    })
    assert.equal(message, '')
    assert.deepEqual(calls, [[fakeFFmpeg, ['-version']]])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpeg applies a bounded release-script timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  await writeMetadata(dir)
  try {
    const calls = []
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0, stdout: 'ffmpeg version test', stderr: '' }
    }, 1234)

    assert.equal(message, '')
    assert.equal(calls[0][2].timeout, 1234)
    assert.deepEqual(calls[0][2].stdio, ['ignore', 'pipe', 'pipe'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpeg reports nonzero -version checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  await writeMetadata(dir)
  try {
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, () => ({ status: 1, stdout: '', stderr: 'bad binary' }))
    assert.match(message, /not runnable/)
    assert.match(message, /bad binary/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpeg reports timed out -version checks clearly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  await writeMetadata(dir)
  try {
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, () => ({
      error: Object.assign(new Error('spawnSync ffmpeg ETIMEDOUT'), { code: 'ETIMEDOUT' }),
      signal: 'SIGTERM',
      status: null,
      stdout: '',
      stderr: '',
    }))
    assert.match(message, /not runnable/)
    assert.match(message, /timed out after 5s/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpeg compares metadata version with the runnable binary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  await writeMetadata(dir, { version: 'ffmpeg version metadata' })
  try {
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, () => ({ status: 0, stdout: 'ffmpeg version actual\nbuilt with test', stderr: '' }))
    assert.match(message, /version mismatch/)
    assert.match(message, /Expected ffmpeg version metadata/)
    assert.match(message, /got ffmpeg version actual/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpeg requires staging metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  const fakeFFmpeg = join(dir, 'ffmpeg')
  await writeFile(fakeFFmpeg, 'fake ffmpeg', 'utf8')
  try {
    const message = verifyDesktopFFmpeg(fakeFFmpeg, dir, () => ({ status: 0, stdout: 'ffmpeg version test', stderr: '' }))
    assert.match(message, /metadata is missing/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyDesktopFFmpegMetadata validates required metadata fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-ffmpeg-'))
  try {
    await writeMetadata(dir, { binary: 'other' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /binary mismatch/)

    await writeMetadata(dir, { binary: 'ffmpeg', version: '' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /Missing: version/)

    await writeMetadata(dir, { binary: 'ffmpeg', version: 'n6.1-static' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /version is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', arch: '' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /Missing: arch/)

    await writeMetadata(dir, { binary: 'ffmpeg', arch: 'ia32' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /arch is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', arch: 'x64' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg'), { arch: 'arm64' }), /arch mismatch/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: '' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /Missing: source_url/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: 'not-a-url' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /source_url is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: 'file:///tmp/ffmpeg' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /source_url is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: 'https://example.com/ffmpeg' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /source_url is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: 'https://example.org/ffmpeg' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /source_url is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', source_url: 'https://example.net/ffmpeg' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /source_url is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', license: 'redistributable ffmpeg build' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /license is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', license: 'LGPL-2.1-or-later OR GPL-3.0-or-later' })
    assert.equal(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), '')

    await chmod(join(dir, 'ffmpeg'), 0o644)
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /not executable/)
    await chmod(join(dir, 'ffmpeg'), 0o755)

    await writeMetadata(dir, { binary: 'ffmpeg', size_bytes: 999 })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /size_bytes mismatch/)

    await writeMetadata(dir, { binary: 'ffmpeg', sha256: 'bad-hash' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /sha256 is invalid/)

    await writeMetadata(dir, { binary: 'ffmpeg', sha256: 'a'.repeat(64) })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /sha256 mismatch/)

    await writeMetadata(dir, { binary: 'ffmpeg', staged_at: 'not-a-date' })
    assert.match(verifyDesktopFFmpegMetadata(join(dir, 'ffmpeg')), /staged_at is invalid/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('findUnpackedResourceDirs discovers platform-specific Electron resources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-release-'))
  try {
    const macResources = join(dir, 'mac-arm64/Movscript.app/Contents/Resources')
    const winResources = join(dir, 'win-unpacked/resources')
    const linuxResources = join(dir, 'linux-unpacked/resources')
    await mkdir(macResources, { recursive: true })
    await mkdir(winResources, { recursive: true })
    await mkdir(linuxResources, { recursive: true })

    assert.deepEqual(findUnpackedResourceDirs(dir, 'darwin'), [macResources])
    assert.deepEqual(findUnpackedResourceDirs(dir, 'win32'), [winResources])
    assert.deepEqual(findUnpackedResourceDirs(dir, 'linux'), [linuxResources])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyBundledDesktopFFmpeg requires ffmpeg inside unpacked Electron resources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-release-'))
  try {
    const resources = join(dir, 'win-unpacked/resources')
    await mkdir(resources, { recursive: true })
    assert.match(verifyBundledDesktopFFmpeg(dir, 'win32'), /Bundled desktop ffmpeg is missing/)

    const ffmpegDir = join(resources, 'ffmpeg/win32/x64')
    const ffmpegPath = join(ffmpegDir, 'ffmpeg.exe')
    await mkdir(ffmpegDir, { recursive: true })
    await writeFile(ffmpegPath, 'fake ffmpeg', 'utf8')
    await writeMetadata(ffmpegDir, { binary: 'ffmpeg.exe' })
    assert.equal(verifyBundledDesktopFFmpeg(dir, 'win32', { arch: 'x64' }), '')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyBundledDesktopFFmpeg validates bundled ffmpeg metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-release-'))
  try {
    const ffmpegDir = join(dir, 'linux-unpacked/resources/ffmpeg/linux/x64')
    const ffmpegPath = join(ffmpegDir, 'ffmpeg')
    await mkdir(ffmpegDir, { recursive: true })
    await writeFile(ffmpegPath, 'fake ffmpeg', 'utf8')
    await writeMetadata(ffmpegDir, { sha256: 'bad-hash' })

    assert.match(verifyBundledDesktopFFmpeg(dir, 'linux', { arch: 'x64' }), /metadata is invalid/)
    assert.match(verifyBundledDesktopFFmpeg(dir, 'linux', { arch: 'x64' }), /sha256 is invalid/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('verifyBundledDesktopFFmpeg compares bundled ffmpeg with staged source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-verify-release-'))
  const sourceDir = await mkdtemp(join(tmpdir(), 'movscript-verify-source-'))
  try {
    const ffmpegDir = join(dir, 'linux-unpacked/resources/ffmpeg/linux/x64')
    const ffmpegPath = join(ffmpegDir, 'ffmpeg')
    const sourcePath = join(sourceDir, 'ffmpeg')
    await mkdir(ffmpegDir, { recursive: true })
    await writeFile(ffmpegPath, 'fake ffmpeg', 'utf8')
    await writeFile(sourcePath, 'different ffmpeg', 'utf8')
    await writeMetadata(ffmpegDir)

    assert.match(verifyBundledDesktopFFmpeg(dir, 'linux', { sourcePath, arch: 'x64' }), /does not match staged source/)

    await writeFile(sourcePath, 'fake ffmpeg', 'utf8')
    assert.equal(verifyBundledDesktopFFmpeg(dir, 'linux', { sourcePath, arch: 'x64' }), '')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  }
})

async function writeMetadata(dir, overrides = {}) {
  await mkdir(dir, { recursive: true })
  const binaryName = overrides.binary || 'ffmpeg'
  const binaryPath = join(dir, binaryName)
  try {
    await writeFile(binaryPath, 'fake ffmpeg', { flag: 'wx' })
  } catch {
    // Keep the existing test binary if one already exists.
  }
  await chmod(binaryPath, 0o755)
  await writeFile(join(dir, 'METADATA.json'), `${JSON.stringify({
    binary: 'ffmpeg',
    arch: 'x64',
    license: 'LGPL-2.1-or-later',
    source_basename: 'source-ffmpeg',
    source_url: 'https://downloads.movscript.dev/ffmpeg',
    staged_at: '2026-05-16T00:00:00.000Z',
    sha256: sha256File(binaryPath),
    size_bytes: 11,
    version: 'ffmpeg version test',
    ...overrides,
  })}\n`, 'utf8')
}

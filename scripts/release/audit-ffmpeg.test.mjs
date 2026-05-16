import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { auditDesktopFFmpeg, parseDesktopArch, parseDesktopArchs, parsePlatforms, printFFmpegAudit, runFFmpegAuditCli } from './audit-ffmpeg.mjs'

test('auditDesktopFFmpeg reports all platform binaries and checks current platform runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-audit-ffmpeg-'))
  try {
    await writeFakeFFmpeg(root, 'darwin')
    await writeFakeFFmpeg(root, 'linux')
    await writeFakeFFmpeg(root, 'win32')

    const runnableChecks = []
    const result = auditDesktopFFmpeg(root, {
      platforms: ['darwin', 'linux', 'win32'],
      currentPlatform: 'linux',
      currentArch: 'x64',
      archs: ['x64'],
      verifyMetadata: () => '',
      verifyRunnable: (path) => {
        runnableChecks.push(path)
        return ''
      },
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.entries.map((entry) => [entry.platform, entry.ok, entry.runnableChecked]), [
      ['darwin', true, false],
      ['linux', true, true],
      ['win32', true, false],
    ])
    assert.deepEqual(runnableChecks, [resolve(root, 'apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg')])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('auditDesktopFFmpeg fails when binaries are missing or metadata is invalid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-audit-ffmpeg-'))
  try {
    await writeFakeFFmpeg(root, 'darwin')

    const result = auditDesktopFFmpeg(root, {
      platforms: ['darwin', 'linux', 'win32'],
      currentPlatform: 'darwin',
      currentArch: 'x64',
      archs: ['x64'],
      verifyMetadata: (path) => path.includes('/darwin/') ? 'metadata mismatch' : '',
      verifyRunnable: () => '',
    })

    assert.equal(result.ok, false)
    assert.equal(result.entries.find((entry) => entry.platform === 'darwin').ok, false)
    assert.match(result.entries.find((entry) => entry.platform === 'darwin').errors.join('\n'), /metadata mismatch/)
    assert.match(result.entries.find((entry) => entry.platform === 'linux').errors.join('\n'), /missing binary/)
    assert.match(result.entries.find((entry) => entry.platform === 'win32').errors.join('\n'), /missing binary/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('auditDesktopFFmpeg defaults to the current platform only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-audit-ffmpeg-'))
  try {
    await writeFakeFFmpeg(root, 'darwin')

    const result = auditDesktopFFmpeg(root, {
      currentPlatform: 'darwin',
      currentArch: 'x64',
      archs: ['x64'],
      verifyMetadata: () => '',
      verifyRunnable: () => '',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.entries.map((entry) => entry.platform), ['darwin'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('auditDesktopFFmpeg can check a platform and architecture matrix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-audit-ffmpeg-matrix-'))
  try {
    await writeFakeFFmpeg(root, 'darwin', 'x64')
    await writeFakeFFmpeg(root, 'darwin', 'arm64')

    const result = auditDesktopFFmpeg(root, {
      platforms: ['darwin'],
      archs: ['x64', 'arm64'],
      currentPlatform: 'darwin',
      currentArch: 'arm64',
      verifyMetadata: () => '',
      verifyRunnable: () => '',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.entries.map((entry) => [entry.platform, entry.arch, entry.runnableChecked]), [
      ['darwin', 'x64', false],
      ['darwin', 'arm64', true],
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parsePlatforms supports current, all, and explicit platform modes', () => {
  assert.deepEqual(parsePlatforms([], 'darwin'), ['darwin'])
  assert.deepEqual(parsePlatforms(['--all'], 'darwin'), ['darwin', 'linux', 'win32'])
  assert.deepEqual(parsePlatforms(['--platform=linux'], 'darwin'), ['linux'])
  assert.throws(() => parsePlatforms(['--platform=freebsd'], 'darwin'), /Unsupported/)
})

test('parseDesktopArch supports current and explicit audit targets', () => {
  assert.equal(parseDesktopArch([], 'arm64'), 'arm64')
  assert.equal(parseDesktopArch(['--arch=x64'], 'arm64'), 'x64')
  assert.equal(parseDesktopArch(['--arch=arm64'], 'x64'), 'arm64')
  assert.throws(() => parseDesktopArch(['--arch=ia32'], 'arm64'), /Unsupported/)
})

test('parseDesktopArchs supports current, explicit, and matrix audit targets', () => {
  assert.deepEqual(parseDesktopArchs([], 'arm64'), ['arm64'])
  assert.deepEqual(parseDesktopArchs(['--arch=x64'], 'arm64'), ['x64'])
  assert.deepEqual(parseDesktopArchs(['--all-archs'], 'arm64'), ['x64', 'arm64'])
  assert.deepEqual(parseDesktopArchs(['--matrix'], 'arm64'), ['x64', 'arm64'])
})

test('runFFmpegAuditCli reports unsupported platforms without stack traces', () => {
  const errors = []
  let exitCode = 0
  let auditCalled = false

  runFFmpegAuditCli('/repo', ['--platform=freebsd'], {
    currentPlatform: 'darwin',
    audit: () => {
      auditCalled = true
      return { ok: true, entries: [] }
    },
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
  })

  assert.equal(exitCode, 1)
  assert.equal(auditCalled, false)
  assert.deepEqual(errors, ['Unsupported ffmpeg audit platform: freebsd'])
})

test('runFFmpegAuditCli exits nonzero for failed audits', () => {
  const logs = []
  const errors = []
  let exitCode = 0

  runFFmpegAuditCli('/repo', ['--platform=linux'], {
    currentPlatform: 'darwin',
    audit: (root, options) => ({
      ok: false,
      entries: [{
        platform: options.platforms[0],
        arch: options.archs[0],
        binaryPath: `${root}/apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg`,
        runnableChecked: false,
        ok: false,
        errors: ['missing binary'],
      }],
    }),
    exit: (code) => { exitCode = code },
    log: (message) => logs.push(message),
    logError: (message) => errors.push(message),
  })

  assert.equal(exitCode, 1)
  assert.match(errors.join('\n'), /FAIL linux/)
  assert.match(errors.join('\n'), /missing binary/)
  assert.equal(logs.length, 0)
})

test('printFFmpegAudit emits a compact pass/fail report', () => {
  const logs = []
  const errors = []

  printFFmpegAudit({
    ok: false,
    entries: [
      {
        platform: 'darwin',
        arch: 'x64',
        binaryPath: '/repo/apps/frontend/vendor/ffmpeg/darwin/x64/ffmpeg',
        runnableChecked: true,
        ok: true,
        errors: [],
      },
      {
        platform: 'linux',
        arch: 'x64',
        binaryPath: '/repo/apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg',
        runnableChecked: false,
        ok: false,
        errors: ['missing binary'],
      },
    ],
  }, (message) => logs.push(message), (message) => errors.push(message))

  assert.match(logs.join('\n'), /OK darwin/)
  assert.match(logs.join('\n'), /runnable: checked/)
  assert.match(errors.join('\n'), /FAIL linux/)
  assert.match(errors.join('\n'), /missing binary/)
  assert.match(errors.join('\n'), /audit failed/)
})

async function writeFakeFFmpeg(root, platform, arch = 'x64', binary = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') {
  const dir = resolve(root, 'apps/frontend/vendor/ffmpeg', platform, arch)
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, binary), 'fake ffmpeg', 'utf8')
}

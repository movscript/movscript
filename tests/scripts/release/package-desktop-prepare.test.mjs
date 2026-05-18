import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import { prepareDesktopPackage, runDesktopPackageCli } from '../../../scripts/release/release-workflow.mjs'
import { goarchForDesktopArch, goosForDesktopPlatform, parseDesktopArchArg as parseDesktopArch, parseDesktopPlatformArg as parseDesktopPlatform } from '../../../scripts/release/release-common.mjs'

test('prepareDesktopPackage fails before build steps when ffmpeg is missing', () => {
  const root = resolve('/repo')
  const calls = []
  const errors = []
  let exitCode = 0
  const originalError = console.error
  console.error = (...args) => {
    errors.push(args.join(' '))
  }

  try {
    prepareDesktopPackage(root, {
      platform: 'darwin',
      currentPlatform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v99.0.0',
      resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg'),
      verifyFFmpeg: () => 'Desktop package ffmpeg prerequisite is missing: /repo/apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg',
      runStep: (...args) => calls.push(args),
      exit: (code) => {
        exitCode = code
      },
    })
  } finally {
    console.error = originalError
  }

  assert.equal(exitCode, 1)
  assert.deepEqual(calls, [])
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_SOURCE_URL/)
  assert.match(errors.join('\n'), /\$ACTUAL_FFMPEG_RELEASE_URL/)
  assert.doesNotMatch(errors.join('\n'), /example\.com\/ffmpeg/)
  assert.match(errors.join('\n'), /MOVSCRIPT_FFMPEG_LICENSE/)
})

test('prepareDesktopPackage prompts for ffmpeg version when staging another platform', () => {
  const root = resolve('/repo')
  const errors = []
  let exitCode = 0
  const originalError = console.error
  console.error = (...args) => {
    errors.push(args.join(' '))
  }

  try {
    prepareDesktopPackage(root, {
      platform: 'win32',
      currentPlatform: 'darwin',
      arch: 'x64',
      nodeVersion: 'v99.0.0',
      resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg.exe'),
      verifyFFmpeg: () => 'Desktop package ffmpeg prerequisite is missing: /repo/apps/frontend/vendor/ffmpeg/win32/x64/ffmpeg.exe',
      runStep: () => {
        throw new Error('build steps should not run')
      },
      exit: (code) => {
        exitCode = code
      },
    })
  } finally {
    console.error = originalError
  }

  const message = errors.join('\n')
  assert.equal(exitCode, 1)
  assert.match(message, /MOVSCRIPT_FFMPEG_BIN=\/path\/to\/ffmpeg\.exe/)
  assert.match(message, /MOVSCRIPT_FFMPEG_VERSION='ffmpeg version \.\.\.'/)
  assert.match(message, /pnpm run release -- stage-ffmpeg --platform=win32 --arch=x64/)
})

test('prepareDesktopPackage prompts for ffmpeg version when staging another architecture', () => {
  const root = resolve('/repo')
  const errors = []
  let exitCode = 0
  const originalError = console.error
  console.error = (...args) => {
    errors.push(args.join(' '))
  }

  try {
    prepareDesktopPackage(root, {
      platform: 'linux',
      currentPlatform: 'linux',
      currentArch: 'arm64',
      arch: 'x64',
      nodeVersion: 'v99.0.0',
      resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg'),
      verifyFFmpeg: () => 'Desktop package ffmpeg prerequisite is missing: /repo/apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg',
      runStep: () => {
        throw new Error('build steps should not run')
      },
      exit: (code) => {
        exitCode = code
      },
    })
  } finally {
    console.error = originalError
  }

  const message = errors.join('\n')
  assert.equal(exitCode, 1)
  assert.match(message, /MOVSCRIPT_FFMPEG_VERSION='ffmpeg version \.\.\.'/)
  assert.match(message, /pnpm run release -- stage-ffmpeg --platform=linux --arch=x64/)
})

test('prepareDesktopPackage runs prerequisite build steps after ffmpeg validation passes', () => {
  const root = resolve('/repo')
  const calls = []
  let exitCode = 0

  prepareDesktopPackage(root, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'arm64',
    nodeVersion: 'v99.0.0',
    resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg'),
    verifyFFmpeg: () => '',
    runStep: (...args) => calls.push(args),
    exit: (code) => {
      exitCode = code
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(calls.length, 4)
  assert.deepEqual(calls[0], ['Build workspace packages', 'pnpm', ['--filter', './packages/*', 'build'], { cwd: root }])
  assert.deepEqual(calls[1], ['Build admin app', 'pnpm', ['--filter', 'movscript-admin', 'build'], { cwd: root }])
  assert.equal(calls[2][0], 'Build backend binary')
  assert.equal(calls[2][1], 'pnpm')
  assert.deepEqual(calls[2][2], ['--filter', 'movscript-backend', 'build'])
  assert.equal(calls[2][3].cwd, root)
  assert.equal(calls[2][3].env.GOOS, 'darwin')
  assert.equal(calls[2][3].env.GOARCH, 'arm64')
  assert.deepEqual(calls[3], ['Copy admin assets into backend bundle', 'node', ['apps/backend/scripts/build.mjs', 'copy-admin-assets'], { cwd: root }])
})

test('prepareDesktopPackage skips ffmpeg run checks for cross-architecture targets', () => {
  const root = resolve('/repo')
  const verifyCalls = []
  const stepCalls = []

  prepareDesktopPackage(root, {
    platform: 'linux',
    currentPlatform: 'linux',
    currentArch: 'x64',
    arch: 'arm64',
    nodeVersion: 'v99.0.0',
    resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg'),
    verifyFFmpeg: (...args) => {
      verifyCalls.push(args)
      return ''
    },
    runStep: (...args) => stepCalls.push(args),
    exit: () => {},
  })

  assert.equal(stepCalls.length, 4)
  assert.deepEqual(verifyCalls[0][4], { arch: 'arm64', runCheck: false })
})

test('parseDesktopPlatform supports current and explicit desktop targets', () => {
  assert.equal(parseDesktopPlatform([], 'darwin'), 'darwin')
  assert.equal(parseDesktopPlatform(['--platform=win32'], 'darwin'), 'win32')
  assert.equal(parseDesktopPlatform(['--platform=linux'], 'darwin'), 'linux')
  assert.throws(() => parseDesktopPlatform(['--platform=freebsd'], 'darwin'), /Unsupported/)
})

test('runDesktopPackageCli reports unsupported platforms before preparation', () => {
  const errors = []
  let exitCode = 0
  let prepareCalled = false

  runDesktopPackageCli(['--platform=freebsd'], {
    defaults: { platform: 'darwin', arch: 'arm64' },
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    preparePackage: () => { prepareCalled = true },
  })

  assert.equal(exitCode, 1)
  assert.equal(prepareCalled, false)
  assert.deepEqual(errors, ['Unsupported desktop package platform: freebsd'])
})

test('runDesktopPackageCli reports unsupported architectures before preparation', () => {
  const errors = []
  let exitCode = 0
  let prepareCalled = false

  runDesktopPackageCli(['--arch=ia32'], {
    defaults: { platform: 'darwin', arch: 'arm64' },
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    preparePackage: () => { prepareCalled = true },
  })

  assert.equal(exitCode, 1)
  assert.equal(prepareCalled, false)
  assert.deepEqual(errors, ['Unsupported desktop package arch: ia32'])
})

test('runDesktopPackageCli passes parsed targets to preparation', () => {
  const prepareCalls = []
  const verifyCalls = []
  const spawnCalls = []

  runDesktopPackageCli(['--platform=win32', '--arch=x64'], {
    root: '/repo',
    defaults: { platform: 'darwin', arch: 'arm64' },
    exit: () => undefined,
    log: () => undefined,
    preparePackage: (...args) => prepareCalls.push(args),
    verifyPackage: (...args) => verifyCalls.push(args),
    spawn: (command, args) => {
      spawnCalls.push([command, args])
      return { status: 0 }
    },
  })

  assert.equal(prepareCalls.length, 1)
  assert.equal(prepareCalls[0][0], '/repo')
  assert.deepEqual({ ...prepareCalls[0][1], exit: undefined }, {
    platform: 'win32',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'x64',
    exit: undefined,
  })
  assert.equal(typeof prepareCalls[0][1].exit, 'function')
  assert.equal(verifyCalls.length, 1)
  assert.equal(verifyCalls[0][0], '/repo')
  assert.deepEqual({ ...verifyCalls[0][1], exit: undefined, log: undefined, logError: undefined }, {
    platform: 'win32',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'x64',
    exit: undefined,
    log: undefined,
    logError: undefined,
  })
  assert.equal(spawnCalls.length, 2)
})

test('runDesktopPackageCli stops when preparation returns false', () => {
  const spawnCalls = []

  runDesktopPackageCli(['--platform=darwin', '--arch=arm64'], {
    defaults: { platform: 'darwin', arch: 'arm64' },
    exit: () => undefined,
    log: () => undefined,
    preparePackage: () => false,
    spawn: (...args) => {
      spawnCalls.push(args)
      return { status: 0 }
    },
  })

  assert.deepEqual(spawnCalls, [])
})

test('prepareDesktopPackage maps Windows desktop targets to Go build env', () => {
  const root = resolve('/repo')
  const calls = []

  prepareDesktopPackage(root, {
    platform: 'win32',
    arch: 'x64',
    nodeVersion: 'v99.0.0',
    resolveFFmpeg: (repoRoot, platform, arch) => resolve(repoRoot, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg.exe'),
    verifyFFmpeg: () => '',
    runStep: (...args) => calls.push(args),
    exit: () => {},
  })

  const backendStep = calls.find((call) => call[0] === 'Build backend binary')
  assert.equal(backendStep[3].env.GOOS, 'windows')
  assert.equal(backendStep[3].env.GOARCH, 'amd64')
})

test('parseDesktopArch and Go target mapping support release targets', () => {
  assert.equal(parseDesktopArch([], 'arm64'), 'arm64')
  assert.equal(parseDesktopArch(['--arch=x64'], 'arm64'), 'x64')
  assert.equal(parseDesktopArch(['--arch=arm64'], 'x64'), 'arm64')
  assert.throws(() => parseDesktopArch(['--arch=ia32'], 'arm64'), /Unsupported/)
  assert.equal(goosForDesktopPlatform('win32'), 'windows')
  assert.equal(goosForDesktopPlatform('darwin'), 'darwin')
  assert.equal(goarchForDesktopArch('x64'), 'amd64')
  assert.equal(goarchForDesktopArch('arm64'), 'arm64')
})

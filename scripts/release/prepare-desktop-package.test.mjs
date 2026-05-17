import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import { goarchForDesktopArch, goosForDesktopPlatform, parseDesktopArch, parseDesktopPlatform, prepareDesktopPackage, runPrepareDesktopPackageCli } from './prepare-desktop-package.mjs'

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
  assert.match(message, /pnpm run release:stage-ffmpeg -- --platform=win32 --arch=x64/)
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
  assert.match(message, /pnpm run release:stage-ffmpeg -- --platform=linux --arch=x64/)
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
  assert.deepEqual(calls[0], ['Build workspace packages', 'pnpm', ['run', 'build:packages'], { cwd: root }])
  assert.deepEqual(calls[1], ['Build admin app', 'pnpm', ['run', 'build:admin'], { cwd: root }])
  assert.equal(calls[2][0], 'Build backend binary')
  assert.equal(calls[2][1], 'pnpm')
  assert.deepEqual(calls[2][2], ['run', 'build:backend'])
  assert.equal(calls[2][3].cwd, root)
  assert.equal(calls[2][3].env.GOOS, 'darwin')
  assert.equal(calls[2][3].env.GOARCH, 'arm64')
  assert.deepEqual(calls[3], ['Copy admin assets into backend bundle', 'node', ['scripts/release/copy-admin-assets.mjs'], { cwd: root }])
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

test('runPrepareDesktopPackageCli reports unsupported platforms without stack traces', () => {
  const errors = []
  let exitCode = 0
  let prepareCalled = false

  runPrepareDesktopPackageCli('/repo', ['--platform=freebsd'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    prepare: () => { prepareCalled = true },
  })

  assert.equal(exitCode, 1)
  assert.equal(prepareCalled, false)
  assert.deepEqual(errors, ['Unsupported desktop package platform: freebsd'])
})

test('runPrepareDesktopPackageCli reports unsupported architectures without stack traces', () => {
  const errors = []
  let exitCode = 0
  let prepareCalled = false

  runPrepareDesktopPackageCli('/repo', ['--arch=ia32'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
    prepare: () => { prepareCalled = true },
  })

  assert.equal(exitCode, 1)
  assert.equal(prepareCalled, false)
  assert.deepEqual(errors, ['Unsupported desktop package arch: ia32'])
})

test('runPrepareDesktopPackageCli passes parsed targets to preparation', () => {
  const calls = []

  runPrepareDesktopPackageCli('/repo', ['--platform=win32', '--arch=x64'], {
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    prepare: (...args) => calls.push(args),
  })

  assert.deepEqual(calls, [['/repo', { platform: 'win32', currentPlatform: 'darwin', currentArch: 'arm64', arch: 'x64' }]])
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

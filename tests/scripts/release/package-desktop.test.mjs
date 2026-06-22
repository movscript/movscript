import assert from 'node:assert/strict'
import test from 'node:test'

import {
  desktopPackageEnv,
  desktopPackagePlan,
  frontendBuilderArgsForTarget,
  parseDesktopSigningModeArg,
  releaseSpawnOptions,
  runDesktopPackageCli,
} from '../../../scripts/release/release-workflow.mjs'

test('frontendBuilderArgsForTarget maps desktop targets to electron-builder args', () => {
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'x64'), ['--mac', 'dmg', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64'), ['--mac', 'dmg', '--arm64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64', false), ['--mac', 'dmg', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'x64'), ['--linux', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'arm64'), ['--linux', '--arm64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'x64'), ['--win', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'arm64'), ['--win', '--arm64', '--publish', 'never'])
})

test('desktopPackagePlan keeps the current-platform package script generic and unsigned by default', () => {
  assert.deepEqual(desktopPackagePlan([], { platform: 'darwin', arch: 'arm64' }), {
    builderArgs: ['--publish', 'never', '-c.mac.identity=null', '-c.mac.notarize=false'],
    signingMode: 'unsigned',
    targetArgs: [],
  })
})

test('desktopPackagePlan parses explicit target args', () => {
  assert.deepEqual(desktopPackagePlan(['--platform=darwin'], { arch: 'arm64' }), {
    builderArgs: ['--mac', 'dmg', '--publish', 'never', '-c.mac.identity=null', '-c.mac.notarize=false'],
    signingMode: 'unsigned',
    targetArgs: ['--platform=darwin'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=linux', '--arch=arm64']), {
    builderArgs: ['--linux', '--arm64', '--publish', 'never'],
    signingMode: 'unsigned',
    targetArgs: ['--platform=linux', '--arch=arm64'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=win32', '--arch=x64']), {
    builderArgs: ['--win', '--x64', '--publish', 'never'],
    signingMode: 'unsigned',
    targetArgs: ['--platform=win32', '--arch=x64'],
  })
})

test('desktopPackagePlan supports explicit signed macOS packages', () => {
  assert.deepEqual(desktopPackagePlan(['--platform=darwin', '--arch=arm64', '--signed']), {
    builderArgs: ['--mac', 'dmg', '--arm64', '--publish', 'never'],
    signingMode: 'signed',
    targetArgs: ['--platform=darwin', '--arch=arm64'],
  })
})

test('parseDesktopSigningModeArg rejects conflicting signing modes', () => {
  assert.equal(parseDesktopSigningModeArg(['--unsigned']), 'unsigned')
  assert.equal(parseDesktopSigningModeArg(['--signed']), 'signed')
  assert.equal(parseDesktopSigningModeArg(['--signing-mode=signed']), 'signed')
  assert.throws(() => parseDesktopSigningModeArg(['--signed', '--unsigned']), /specified only once/)
})

test('desktopPackageEnv strips signing secrets for unsigned packages', () => {
  assert.deepEqual(desktopPackageEnv({
    PATH: '/bin',
    CSC_LINK: ' file:///cert.p12 ',
    CSC_KEY_PASSWORD: ' password ',
    APPLE_ID: 'user@example.com',
  }, 'unsigned'), {
    PATH: '/bin',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
  })
})

test('releaseSpawnOptions uses shell on Windows so pnpm.cmd can be resolved', () => {
  const env = { PATH: '/bin' }
  assert.deepEqual(releaseSpawnOptions(env, 'darwin'), {
    stdio: 'inherit',
    env,
  })
  assert.deepEqual(releaseSpawnOptions(env, 'win32'), {
    stdio: 'inherit',
    env,
    shell: true,
  })
})

test('runDesktopPackageCli runs prepare, frontend dist, and verify steps', () => {
  const calls = []
  const prepareCalls = []
  const verifyCalls = []
  const verifyDMGCalls = []
  let exitCode = 0
  const env = { PATH: '/bin' }
  runDesktopPackageCli(['--platform=darwin', '--arch=x64'], {
    exit: (code) => { exitCode = code },
    log: () => undefined,
    defaults: { platform: 'darwin', arch: 'arm64' },
    env,
    root: '/repo',
    patchMacOSDMGBuilder: () => undefined,
    preparePackage: (...args) => prepareCalls.push(args),
    verifyMacOSDMG: (...args) => verifyDMGCalls.push(args),
    verifyPackage: (...args) => verifyCalls.push(args),
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })
  assert.equal(exitCode, 0)
  assert.equal(prepareCalls.length, 1)
  assert.deepEqual({ ...prepareCalls[0][1], exit: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'x64',
    exit: undefined,
    signingMode: 'unsigned',
  })
  assert.equal(verifyCalls.length, 1)
  assert.equal(verifyDMGCalls.length, 1)
  assert.deepEqual({ ...verifyCalls[0][1], exit: undefined, log: undefined, logError: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'x64',
    exit: undefined,
    signingMode: 'unsigned',
    log: undefined,
    logError: undefined,
  })
  assert.equal(typeof verifyCalls[0][1].exit, 'function')
  assert.equal(typeof verifyCalls[0][1].log, 'function')
  assert.equal(typeof verifyCalls[0][1].logError, 'function')
  assert.deepEqual(calls, [
    ['pnpm', ['--filter', '@movscript/desktop', 'exec', 'electron-vite', 'build', '--logLevel', 'info', '--clearScreen=false'], { stdio: 'inherit', env }],
    ['pnpm', ['--filter', '@movscript/desktop', 'exec', 'electron-builder', '--mac', '--dir', '--x64', '--publish', 'never', '-c.mac.identity=null', '-c.mac.notarize=false'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
    ['xattr', ['-cr', '/repo/apps/frontend/release/mac/Movscript.app'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
    ['node', ['scripts/release/sign-macos-app.mjs', '/repo/apps/frontend/release/mac/Movscript.app'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
    ['xattr', ['-cr', '/repo/apps/frontend/release/mac/Movscript.app'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
    ['codesign', ['--verify', '--deep', '--strict', '--verbose=2', '/repo/apps/frontend/release/mac/Movscript.app'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
    ['pnpm', ['--filter', '@movscript/desktop', 'exec', 'electron-builder', '--mac', 'dmg', '--x64', '--publish', 'never', '--prepackaged', '/repo/apps/frontend/release/mac/Movscript.app', '-c.mac.identity=null', '-c.mac.notarize=false'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
  ])
})

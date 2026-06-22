import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  desktopPackageEnv,
  desktopPackagePlan,
  frontendBuilderArgsForTarget,
  parseDesktopSigningModeArg,
  releaseSpawnOptions,
  runDesktopPackageCli,
  verifyMacOSDMGArtifacts,
} from '../../../scripts/release/release-workflow.mjs'

const darwinX64Publish = '-c.publish.channel=latest-darwin-x64'
const darwinArm64Publish = '-c.publish.channel=latest-darwin-arm64'
const linuxX64Publish = '-c.publish.channel=latest-linux-x64'
const linuxArm64Publish = '-c.publish.channel=latest-linux-arm64'
const win32X64Publish = '-c.publish.channel=latest-win32-x64'
const win32Arm64Publish = '-c.publish.channel=latest-win32-arm64'

test('frontendBuilderArgsForTarget maps desktop targets to electron-builder args', () => {
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'x64'), ['--mac', 'dmg', 'zip', '--x64', '--publish', 'never', darwinX64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64'), ['--mac', 'dmg', 'zip', '--arm64', '--publish', 'never', darwinArm64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64', false), ['--mac', 'dmg', 'zip', '--publish', 'never', darwinArm64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'x64'), ['--linux', '--x64', '--publish', 'never', linuxX64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'arm64'), ['--linux', '--arm64', '--publish', 'never', linuxArm64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'x64'), ['--win', '--x64', '--publish', 'never', win32X64Publish])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'arm64'), ['--win', '--arm64', '--publish', 'never', win32Arm64Publish])
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
    builderArgs: ['--mac', 'dmg', 'zip', '--publish', 'never', darwinArm64Publish, '-c.mac.identity=null', '-c.mac.notarize=false'],
    signingMode: 'unsigned',
    targetArgs: ['--platform=darwin'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=linux', '--arch=arm64']), {
    builderArgs: ['--linux', '--arm64', '--publish', 'never', linuxArm64Publish],
    signingMode: 'unsigned',
    targetArgs: ['--platform=linux', '--arch=arm64'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=win32', '--arch=x64']), {
    builderArgs: ['--win', '--x64', '--publish', 'never', win32X64Publish],
    signingMode: 'unsigned',
    targetArgs: ['--platform=win32', '--arch=x64'],
  })
})

test('desktopPackagePlan supports explicit signed macOS packages', () => {
  assert.deepEqual(desktopPackagePlan(['--platform=darwin', '--arch=arm64', '--signed']), {
    builderArgs: ['--mac', 'dmg', 'zip', '--arm64', '--publish', 'never', darwinArm64Publish],
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
    ['pnpm', ['--filter', '@movscript/desktop', 'exec', 'electron-builder', '--mac', 'dmg', 'zip', '--x64', '--publish', 'never', darwinX64Publish, '--prepackaged', '/repo/apps/frontend/release/mac/Movscript.app', '-c.mac.identity=null', '-c.mac.notarize=false'], {
      stdio: 'inherit',
      env: {
        PATH: '/bin',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
      },
    }],
  ])
})

test('verifyMacOSDMGArtifacts verifies signed DMG distribution artifact when signature is present', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-release-test-'))
  const calls = []
  try {
    const releaseDir = join(root, 'apps/frontend/release')
    const iconPath = join(root, 'apps/frontend/build/icon.icns')
    const dmgPath = join(releaseDir, 'Movscript-0.1.28-arm64.dmg')
    mkdirSync(releaseDir, { recursive: true })
    mkdirSync(dirname(iconPath), { recursive: true })
    writeFileSync(dmgPath, 'dmg')
    writeFileSync(iconPath, 'icon')

    verifyMacOSDMGArtifacts(root, {
      arch: 'arm64',
      env: { APPLE_TEAM_ID: '99B6K2LFFN', MOVSCRIPT_RELEASE_SIGNING_MODE: 'signed' },
      log: () => undefined,
      spawn: (command, args) => {
        calls.push([command, args])
        if (command === 'codesign' && args[0] === '-dvvv') {
          return {
            status: 0,
            stderr: [
              'Authority=Developer ID Application: qian zhao (99B6K2LFFN)',
              'Authority=Developer ID Certification Authority',
              'TeamIdentifier=99B6K2LFFN',
            ].join('\n'),
            stdout: '',
          }
        }
        if (command === 'hdiutil' && args[0] === 'attach') {
          const mountPoint = args[args.indexOf('-mountpoint') + 1]
          const mountedIcon = join(mountPoint, 'Movscript.app/Contents/Resources/icon.icns')
          mkdirSync(dirname(mountedIcon), { recursive: true })
          writeFileSync(mountedIcon, 'icon')
        }
        return { status: 0 }
      },
    })

    assert.deepEqual(calls.map(([command, args]) => [command, args[0]]), [
      ['codesign', '--verify'],
      ['codesign', '-dvvv'],
      ['codesign', '--verify'],
      ['spctl', '-a'],
      ['xcrun', 'stapler'],
      ['hdiutil', 'verify'],
      ['hdiutil', 'attach'],
      ['hdiutil', 'detach'],
    ])
    assert.equal(calls.some(([command, args]) => command === 'spctl' && args.includes('execute')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verifyMacOSDMGArtifacts skips DMG Gatekeeper assessment when DMG has no standalone signature', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-release-test-'))
  const calls = []
  const logs = []
  try {
    const releaseDir = join(root, 'apps/frontend/release')
    const iconPath = join(root, 'apps/frontend/build/icon.icns')
    const dmgPath = join(releaseDir, 'Movscript-0.1.28-arm64.dmg')
    mkdirSync(releaseDir, { recursive: true })
    mkdirSync(dirname(iconPath), { recursive: true })
    writeFileSync(dmgPath, 'dmg')
    writeFileSync(iconPath, 'icon')

    verifyMacOSDMGArtifacts(root, {
      arch: 'arm64',
      env: { APPLE_TEAM_ID: '99B6K2LFFN', MOVSCRIPT_RELEASE_SIGNING_MODE: 'signed' },
      log: (message) => logs.push(message),
      spawn: (command, args) => {
        calls.push([command, args])
        if (command === 'codesign' && args[0] === '-dvvv') {
          return {
            status: 0,
            stderr: [
              'Authority=Developer ID Application: qian zhao (99B6K2LFFN)',
              'Authority=Developer ID Certification Authority',
              'TeamIdentifier=99B6K2LFFN',
            ].join('\n'),
            stdout: '',
          }
        }
        if (command === 'codesign' && args.includes(dmgPath)) return { status: 1 }
        if (command === 'hdiutil' && args[0] === 'attach') {
          const mountPoint = args[args.indexOf('-mountpoint') + 1]
          const mountedIcon = join(mountPoint, 'Movscript.app/Contents/Resources/icon.icns')
          mkdirSync(dirname(mountedIcon), { recursive: true })
          writeFileSync(mountedIcon, 'icon')
        }
        return { status: 0 }
      },
    })

    assert.deepEqual(calls.map(([command, args]) => [command, args[0]]), [
      ['codesign', '--verify'],
      ['codesign', '-dvvv'],
      ['codesign', '--verify'],
      ['hdiutil', 'verify'],
      ['hdiutil', 'attach'],
      ['hdiutil', 'detach'],
    ])
    assert.equal(calls.some(([command]) => command === 'spctl'), false)
    assert.equal(calls.some(([command]) => command === 'xcrun'), false)
    assert.ok(logs.includes('[package-desktop] DMG has no standalone code signature; skipping DMG Gatekeeper assessment'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verifyMacOSDMGArtifacts rejects ad-hoc signed macOS apps in signed mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-release-test-'))
  try {
    const releaseDir = join(root, 'apps/frontend/release')
    mkdirSync(releaseDir, { recursive: true })
    writeFileSync(join(releaseDir, 'Movscript-0.1.28-arm64.dmg'), 'dmg')

    assert.throws(() => verifyMacOSDMGArtifacts(root, {
      arch: 'arm64',
      env: { MOVSCRIPT_RELEASE_SIGNING_MODE: 'signed' },
      log: () => undefined,
      spawn: (command, args) => {
        if (command === 'codesign' && args[0] === '-dvvv') {
          return { status: 0, stderr: 'Signature=adhoc\nTeamIdentifier=not set', stdout: '' }
        }
        return { status: 0 }
      },
    }), /ad-hoc signed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

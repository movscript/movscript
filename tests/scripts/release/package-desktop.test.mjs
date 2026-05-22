import assert from 'node:assert/strict'
import test from 'node:test'

import { desktopPackagePlan, frontendBuilderArgsForTarget, runDesktopPackageCli } from '../../../scripts/release/release-workflow.mjs'

test('frontendBuilderArgsForTarget maps desktop targets to electron-builder args', () => {
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'x64'), ['--mac', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64'), ['--mac', '--arm64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('darwin', 'arm64', false), ['--mac', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'x64'), ['--linux', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('linux', 'arm64'), ['--linux', '--arm64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'x64'), ['--win', '--x64', '--publish', 'never'])
  assert.deepEqual(frontendBuilderArgsForTarget('win32', 'arm64'), ['--win', '--arm64', '--publish', 'never'])
})

test('desktopPackagePlan keeps the current-platform package script generic', () => {
  assert.deepEqual(desktopPackagePlan([], { platform: 'darwin', arch: 'arm64' }), {
    builderArgs: ['--publish', 'never'],
    targetArgs: [],
  })
})

test('desktopPackagePlan parses explicit target args', () => {
  assert.deepEqual(desktopPackagePlan(['--platform=darwin'], { arch: 'arm64' }), {
    builderArgs: ['--mac', '--publish', 'never'],
    targetArgs: ['--platform=darwin'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=linux', '--arch=arm64']), {
    builderArgs: ['--linux', '--arm64', '--publish', 'never'],
    targetArgs: ['--platform=linux', '--arch=arm64'],
  })
  assert.deepEqual(desktopPackagePlan(['--platform=win32', '--arch=x64']), {
    builderArgs: ['--win', '--x64', '--publish', 'never'],
    targetArgs: ['--platform=win32', '--arch=x64'],
  })
})

test('runDesktopPackageCli runs prepare, frontend dist, and verify steps', () => {
  const calls = []
  const prepareCalls = []
  const verifyCalls = []
  let exitCode = 0
  runDesktopPackageCli(['--platform=darwin', '--arch=x64'], {
    exit: (code) => { exitCode = code },
    log: () => undefined,
    defaults: { platform: 'darwin', arch: 'arm64' },
    preparePackage: (...args) => prepareCalls.push(args),
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
  })
  assert.equal(verifyCalls.length, 1)
  assert.deepEqual({ ...verifyCalls[0][1], exit: undefined, log: undefined, logError: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'arm64',
    arch: 'x64',
    exit: undefined,
    log: undefined,
    logError: undefined,
  })
  assert.equal(typeof verifyCalls[0][1].exit, 'function')
  assert.equal(typeof verifyCalls[0][1].log, 'function')
  assert.equal(typeof verifyCalls[0][1].logError, 'function')
  assert.deepEqual(calls, [
    ['pnpm', ['--filter', 'movscript-frontend', 'build'], { stdio: 'inherit' }],
    ['pnpm', ['--filter', 'movscript-frontend', 'exec', 'electron-builder', '--mac', '--x64', '--publish', 'never'], { stdio: 'inherit' }],
  ])
})

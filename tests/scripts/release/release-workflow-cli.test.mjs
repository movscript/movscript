import assert from 'node:assert/strict'
import test from 'node:test'

import { releaseSubcommands, releaseWorkflowSteps, runReleaseWorkflowCli } from '../../../scripts/release/release-workflow.mjs'

test('release workflow exposes the curated release subcommand surface', () => {
  assert.deepEqual(releaseSubcommands(), [
    'audit-ffmpeg',
    'bump-version',
    'collect',
    'download-ffmpeg-static',
    'package-desktop',
    'smoke-desktop-package',
    'stage-ffmpeg',
    'verify-package-resources',
    'verify-release-readiness',
  ])
})

test('release workflow check runs release gates in order', () => {
  assert.deepEqual(releaseWorkflowSteps('check'), [
    ['Verify release readiness', 'node', ['scripts/release/release-workflow.mjs', 'verify-release-readiness']],
    ['Build workspace packages', 'pnpm', ['--workspace-concurrency=1', '--filter', './packages/*', 'build']],
    ['Run workspace typecheck', 'pnpm', ['run', 'typecheck']],
    ['Run release script tests', 'node', ['scripts/run-node-tests.mjs', 'tests/scripts/release/*.test.mjs']],
    ['Run UI package quality gate', 'pnpm', ['run', 'quality:ui']],
    ['Verify package resource contract', 'node', ['scripts/release/release-workflow.mjs', 'verify-package-resources']],
  ])
})

test('release workflow full runs check, ffmpeg staging, desktop packaging, smoke, and collection', () => {
  assert.deepEqual(releaseWorkflowSteps('full'), [
    ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
    ['Download ffmpeg-static release binary', 'node', ['scripts/release/release-workflow.mjs', 'download-ffmpeg-static']],
    ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package-desktop', '--unsigned']],
    ['Smoke test desktop package', 'node', ['scripts/release/release-workflow.mjs', 'smoke-desktop-package']],
    ['Collect release artifacts', 'node', ['scripts/release/release-workflow.mjs', 'collect']],
  ])
})

test('release workflow dry-run forwards desktop target and signing mode args', () => {
  assert.deepEqual(releaseWorkflowSteps('dry-run', ['--platform=darwin', '--arch=arm64', '--signed']), [
    ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
    ['Download ffmpeg-static release binary', 'node', ['scripts/release/release-workflow.mjs', 'download-ffmpeg-static', '--platform=darwin', '--arch=arm64']],
    ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package-desktop', '--platform=darwin', '--arch=arm64', '--signed']],
    ['Smoke test desktop package', 'node', ['scripts/release/release-workflow.mjs', 'smoke-desktop-package', '--platform=darwin', '--arch=arm64']],
    ['Collect release artifacts', 'node', ['scripts/release/release-workflow.mjs', 'collect']],
  ])
})

test('runReleaseWorkflowCli rejects unknown modes', () => {
  let exitCode = 0
  const errors = []
  runReleaseWorkflowCli(['unknown'], {
    exit: (code) => { exitCode = code },
    logError: (message) => errors.push(message),
  })
  assert.equal(exitCode, 2)
  assert.match(errors.join('\n'), /\[check\|full\|/)
})

test('runReleaseWorkflowCli runs steps and stops on failure', () => {
  const calls = []
  let exitCode = 0
  runReleaseWorkflowCli(['check'], {
    exit: (code) => { exitCode = code },
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: calls.length === 1 ? 9 : 0 }
    },
  })

  assert.equal(exitCode, 9)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/release-workflow.mjs', 'verify-release-readiness']])
})

test('runReleaseWorkflowCli accepts pnpm argument separator before modes', () => {
  const calls = []
  runReleaseWorkflowCli(['--', 'check'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: calls.length === 1 ? 7 : 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/release-workflow.mjs', 'verify-release-readiness']])
})

test('runReleaseWorkflowCli dispatches release subcommands', () => {
  const calls = []
  let exitCode = 0
  runReleaseWorkflowCli(['stage-ffmpeg', '--inspect', '--platform=darwin'], {
    exit: (code) => { exitCode = code },
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/stage-ffmpeg.mjs', '--inspect', '--platform=darwin']])
})

test('runReleaseWorkflowCli dispatches release version bumping', () => {
  const calls = []
  runReleaseWorkflowCli(['bump-version', '0.1.3', '--dry-run'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/bump-version.mjs', '0.1.3', '--dry-run']])
})

test('runReleaseWorkflowCli dispatches package resource verification', () => {
  const calls = []
  runReleaseWorkflowCli(['verify-package-resources', '--manifest=package-resources.manifest.json'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/verify-package-resources.mjs', '--manifest=package-resources.manifest.json']])
})

test('runReleaseWorkflowCli dispatches release readiness verification', () => {
  const calls = []
  runReleaseWorkflowCli(['verify-release-readiness', '--tag=v0.1.0'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/verify-release-readiness.mjs', '--tag=v0.1.0']])
})

test('runReleaseWorkflowCli dispatches desktop package smoke verification', () => {
  const calls = []
  runReleaseWorkflowCli(['smoke-desktop-package', '--platform=linux', '--arch=x64'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/smoke-desktop-package.mjs', '--platform=linux', '--arch=x64']])
})

test('runReleaseWorkflowCli dispatches release artifact collection as a builtin command', () => {
  const logs = []
  const collectCalls = []
  runReleaseWorkflowCli(['collect'], {
    collectArtifacts: (...args) => {
      collectCalls.push(args)
      return {
        copied: ['/repo/release-artifacts/Movscript.dmg'],
        outputDir: '/repo/release-artifacts',
      }
    },
    env: { MOVSCRIPT_COLLECT_PLUGINS: '0' },
    exit: () => undefined,
    log: (message) => logs.push(message),
    root: '/repo',
  })

  assert.equal(collectCalls.length, 1)
  assert.equal(collectCalls[0][0], '/repo')
  assert.deepEqual(collectCalls[0][1], { env: { MOVSCRIPT_COLLECT_PLUGINS: '0' } })
  assert.deepEqual(logs, [
    'Collected 1 release artifact(s) in /repo/release-artifacts',
    '- /repo/release-artifacts/Movscript.dmg',
  ])
})

test('runReleaseWorkflowCli dispatches desktop packaging through release command map', () => {
  const calls = []
  const patchCalls = []
  const prepareCalls = []
  const verifyCalls = []
  const verifyDMGCalls = []
  runReleaseWorkflowCli(['package-desktop', '--platform=darwin', '--arch=arm64'], {
    exit: () => undefined,
    log: () => undefined,
    defaults: { platform: 'darwin', arch: 'x64' },
    env: { PATH: '/bin' },
    patchMacOSDMGBuilder: (...args) => patchCalls.push(args),
    preparePackage: (...args) => prepareCalls.push(args),
    verifyPackage: (...args) => verifyCalls.push(args),
    verifyMacOSDMG: (...args) => verifyDMGCalls.push(args),
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.equal(patchCalls.length, 1)
  assert.equal(prepareCalls.length, 1)
  assert.deepEqual({ ...prepareCalls[0][1], exit: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'x64',
    arch: 'arm64',
    exit: undefined,
    signingMode: 'unsigned',
  })
  assert.equal(verifyCalls.length, 1)
  assert.deepEqual({ ...verifyCalls[0][1], exit: undefined, log: undefined, logError: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'x64',
    arch: 'arm64',
    exit: undefined,
    signingMode: 'unsigned',
    log: undefined,
    logError: undefined,
  })
  assert.equal(verifyDMGCalls.length, 1)
  assert.deepEqual({ ...verifyDMGCalls[0][1], log: undefined, spawn: undefined }, {
    arch: 'arm64',
    env: {
      PATH: '/bin',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      MOVSCRIPT_RELEASE_SIGNING_MODE: 'unsigned',
    },
    log: undefined,
    spawn: undefined,
  })
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ['pnpm', ['--filter', '@movscript/desktop', 'build']],
    ['pnpm', ['--filter', '@movscript/desktop', 'exec', 'electron-builder', '--mac', 'dmg', '--arm64', '--publish', 'never', '-c.mac.identity=null', '-c.mac.notarize=false']],
  ])
})

test('runReleaseWorkflowCli accepts pnpm argument separator before subcommands', () => {
  const calls = []
  runReleaseWorkflowCli(['--', 'stage-ffmpeg', '--inspect', '--platform=darwin'], {
    exit: () => undefined,
    log: () => undefined,
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.deepEqual(calls[0].slice(0, 2), ['node', ['scripts/release/stage-ffmpeg.mjs', '--inspect', '--platform=darwin']])
})

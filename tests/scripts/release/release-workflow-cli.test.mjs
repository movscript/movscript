import assert from 'node:assert/strict'
import test from 'node:test'

import { releaseSubcommands, releaseWorkflowSteps, runReleaseWorkflowCli } from '../../../scripts/release/release-workflow.mjs'

test('release workflow exposes the curated release subcommand surface', () => {
  assert.deepEqual(releaseSubcommands(), [
    'audit-ffmpeg',
    'collect',
    'download-ffmpeg-static',
    'package-desktop',
    'stage-ffmpeg',
  ])
})

test('release workflow check runs release gates in order', () => {
  assert.deepEqual(releaseWorkflowSteps('check'), [
    ['Verify script inventory', 'pnpm', ['run', 'verify:scripts']],
    ['Audit desktop ffmpeg matrix', 'node', ['scripts/release/release-workflow.mjs', 'audit-ffmpeg', '--all', '--all-archs']],
    ['Run automation script tests', 'pnpm', ['run', 'test:scripts']],
    ['Run workspace tests', 'pnpm', ['run', 'test']],
    ['Run workspace typecheck', 'pnpm', ['run', 'typecheck']],
  ])
})

test('release workflow full runs check, packaging, plugins, and collection', () => {
  assert.deepEqual(releaseWorkflowSteps('full'), [
    ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
    ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package-desktop']],
    ['Build workspace packages', 'pnpm', ['--filter', './packages/*', 'build']],
    ['Build plugins', 'pnpm', ['--filter', './plugins/*', 'build']],
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
      return { status: calls.length === 2 ? 9 : 0 }
    },
  })

  assert.equal(exitCode, 9)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].slice(0, 2), ['pnpm', ['run', 'verify:scripts']])
  assert.deepEqual(calls[1].slice(0, 2), ['node', ['scripts/release/release-workflow.mjs', 'audit-ffmpeg', '--all', '--all-archs']])
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

  assert.deepEqual(calls[0].slice(0, 2), ['pnpm', ['run', 'verify:scripts']])
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
  const prepareCalls = []
  const verifyCalls = []
  runReleaseWorkflowCli(['package-desktop', '--platform=darwin', '--arch=arm64'], {
    exit: () => undefined,
    log: () => undefined,
    defaults: { platform: 'darwin', arch: 'x64' },
    preparePackage: (...args) => prepareCalls.push(args),
    verifyPackage: (...args) => verifyCalls.push(args),
    spawn: (command, args, options) => {
      calls.push([command, args, options])
      return { status: 0 }
    },
  })

  assert.equal(prepareCalls.length, 1)
  assert.deepEqual({ ...prepareCalls[0][1], exit: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'x64',
    arch: 'arm64',
    exit: undefined,
  })
  assert.equal(verifyCalls.length, 1)
  assert.deepEqual({ ...verifyCalls[0][1], exit: undefined, log: undefined, logError: undefined }, {
    platform: 'darwin',
    currentPlatform: 'darwin',
    currentArch: 'x64',
    arch: 'arm64',
    exit: undefined,
    log: undefined,
    logError: undefined,
  })
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ['pnpm', ['--filter', 'movscript-frontend', 'build']],
    ['pnpm', ['--filter', 'movscript-frontend', 'exec', 'electron-builder', '--mac', '--arm64', '--publish', 'never']],
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

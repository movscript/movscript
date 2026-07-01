import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareDaemonForDesktopUpdateInstall } from './appUpdateDaemon'

test('desktop update preparation force-stops the local runtime daemon for the target home', async () => {
  const calls: Array<{ homeDir: string; options?: { force?: boolean } }> = []

  const result = await prepareDaemonForDesktopUpdateInstall({
    homeDir: '/tmp/movscript-update-home',
    stopDaemon: async (homeDir, options) => {
      calls.push({ homeDir, options })
      return { status: 'stopping', forced: true, pid: 1234 }
    },
    logger: { warn: () => undefined },
  })

  assert.deepEqual(calls, [{
    homeDir: '/tmp/movscript-update-home',
    options: { force: true },
  }])
  assert.equal(result.ok, true)
  assert.equal(result.homeDir, '/tmp/movscript-update-home')
  assert.equal(result.daemonStatus, 'stopping')
  assert.equal(result.detail?.forced, true)
})

test('desktop update preparation treats a missing daemon as install-ready', async () => {
  const result = await prepareDaemonForDesktopUpdateInstall({
    homeDir: '/tmp/movscript-update-home',
    stopDaemon: async () => ({ status: 'not_running', forced: true }),
    logger: { warn: () => undefined },
  })

  assert.equal(result.ok, true)
  assert.equal(result.daemonStatus, 'not_running')
})

test('desktop update preparation reports daemon stop errors without throwing', async () => {
  const warnings: unknown[][] = []

  const result = await prepareDaemonForDesktopUpdateInstall({
    homeDir: '/tmp/movscript-update-home',
    stopDaemon: async () => {
      throw new Error('control endpoint unavailable')
    },
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
  })

  assert.equal(result.ok, false)
  assert.equal(result.daemonStatus, 'error')
  assert.match(result.error ?? '', /control endpoint unavailable/)
  assert.match(String(warnings[0]?.[0] ?? ''), /failed to stop local runtime daemon/)
})

test('desktop update preparation reports daemon error payloads without throwing', async () => {
  const warnings: unknown[][] = []

  const result = await prepareDaemonForDesktopUpdateInstall({
    homeDir: '/tmp/movscript-update-home',
    stopDaemon: async () => ({ status: 'error', forced: true, error: 'stale pid could not be signaled' }),
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
  })

  assert.equal(result.ok, false)
  assert.equal(result.daemonStatus, 'error')
  assert.equal(result.detail?.error, 'stale pid could not be signaled')
  assert.match(String(warnings[0]?.[0] ?? ''), /reported an error/)
})

import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  findPackagedExecutable,
  smokeDesktopPackage,
} from '../../../scripts/release/smoke-desktop-package.mjs'

test('findPackagedExecutable locates platform-specific unpacked executables', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-smoke-find-'))
  try {
    const macExecutable = path.join(root, 'mac-arm64/Movscript.app/Contents/MacOS/Movscript')
    const linuxExecutable = path.join(root, 'linux-unpacked/movscript')
    const windowsExecutable = path.join(root, 'win-unpacked/Movscript.exe')
    await writeExecutable(macExecutable)
    await writeExecutable(linuxExecutable)
    await writeExecutable(windowsExecutable)

    assert.equal(findPackagedExecutable(root, 'darwin'), macExecutable)
    assert.equal(findPackagedExecutable(root, 'linux'), linuxExecutable)
    assert.equal(findPackagedExecutable(root, 'win32'), windowsExecutable)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('smokeDesktopPackage skips cross-target packages without failing the release job', async () => {
  const result = smokeDesktopPackage('/repo', {
    arch: process.arch === 'x64' ? 'arm64' : 'x64',
    platform: process.platform,
  })
  assert.equal(result.skipped, true)
  assert.match(result.reason, /cannot run on current host/)
})

test('smokeDesktopPackage runs same-host package executable and requires the smoke marker', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-smoke-run-'))
  try {
    const releaseDir = path.join(root, 'apps/frontend/release')
    await writeExecutable(executablePathForCurrentPlatform(releaseDir))
    const calls = []
    const result = smokeDesktopPackage(root, {
      arch: process.arch,
      env: { DISPLAY: ':99' },
      platform: process.platform,
      releaseDir,
      spawn: (command, args, options) => {
        calls.push({ command, args, options })
        return {
          status: 0,
          stdout: 'booted\nMOVSCRIPT_DESKTOP_SMOKE_OK\n',
          stderr: '',
        }
      },
    })

    assert.equal(result.skipped, false)
    assert.equal(calls.length, 1)
    if (process.platform === 'darwin') {
      assert.equal(calls[0].command, '/usr/bin/open')
      assert.deepEqual(calls[0].args.slice(0, 3), ['-W', '-n', path.join(releaseDir, 'mac-arm64/Movscript.app')])
      assert.equal(calls[0].args[3], '--args')
      assert.equal(calls[0].args[4], '--movscript-desktop-smoke-test')
      assert.match(calls[0].args[5], /^--user-data-dir=/)
    } else {
      assert.equal(calls[0].args[0], '--movscript-desktop-smoke-test')
      assert.match(calls[0].args[1], /^--user-data-dir=/)
    }
    assert.match(calls[0].options.env.MOVSCRIPT_DESKTOP_SMOKE_MARKER_FILE, /movscript-electron-user-data.*\.marker$/)
    assert.equal(calls[0].options.env.MOVSCRIPT_DESKTOP_SMOKE_TEST, '1')
    assert.match(calls[0].options.env.MOVSCRIPT_DESKTOP_SMOKE_USER_DATA_DIR, /movscript-electron-user-data/)
    assert.match(calls[0].options.env.MOVSCRIPT_HOME, /movscript-smoke-home/)
    assert.match(calls[0].options.env.MOVSCRIPT_WORKSPACE_DIR, /movscript-smoke-home/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('smokeDesktopPackage fails when the packaged app exits without the smoke marker', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-smoke-missing-marker-'))
  try {
    const releaseDir = path.join(root, 'apps/frontend/release')
    await writeExecutable(executablePathForCurrentPlatform(releaseDir))
    assert.throws(
      () => smokeDesktopPackage(root, {
        arch: process.arch,
        env: { DISPLAY: ':99' },
        platform: process.platform,
        releaseDir,
        spawn: () => ({ status: 0, stdout: 'booted\n', stderr: '' }),
        timeoutMs: 1,
      }),
      /did not emit MOVSCRIPT_DESKTOP_SMOKE_OK/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function executablePathForCurrentPlatform(releaseDir) {
  if (process.platform === 'darwin') return path.join(releaseDir, 'mac-arm64/Movscript.app/Contents/MacOS/Movscript')
  if (process.platform === 'win32') return path.join(releaseDir, 'win-unpacked/Movscript.exe')
  return path.join(releaseDir, 'linux-unpacked/movscript')
}

async function writeExecutable(file) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, '')
  await chmod(file, 0o755)
}

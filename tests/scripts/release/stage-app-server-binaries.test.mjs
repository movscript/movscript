import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  appServerSourceCandidates,
  resolveAppServerSource,
  stageDesktopAppServerBinaries,
  stageDesktopAppServerBinary,
} from '../../../scripts/release/stage-app-server-binaries.mjs'

test('appServerSourceCandidates checks built dependency artifacts before debug outputs', () => {
  const root = resolve('/repo')
  const candidates = appServerSourceCandidates(root, 'codex', 'darwin', 'arm64')
  assert.equal(candidates[0], resolve('/repo/release-binary-deps/darwin-arm64/codex/app-server'))
  assert.ok(candidates.includes(resolve('/repo/../codex/codex-rs/target/aarch64-apple-darwin/debug/app-server')))
  assert.ok(candidates.includes(resolve('/repo/../codex/codex-rs/target/debug/codex-app-server')))
})

test('stageDesktopAppServerBinary copies provider binary to packaged app-server layout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-stage-app-server-'))
  try {
    const source = join(root, 'source-codex-app-server')
    await writeFile(source, 'fake codex app-server', 'utf8')
    const target = stageDesktopAppServerBinary({ root, provider: 'codex', platform: 'linux', arch: 'x64', source })

    assert.equal(target, join(root, 'apps/frontend/vendor/app-server/codex/linux/x64/app-server'))
    assert.equal(await readFile(target, 'utf8'), 'fake codex app-server')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stageDesktopAppServerBinaries stages Codex and Mova from provider env vars', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-stage-app-server-env-'))
  try {
    const codexSource = join(root, 'codex-app-server')
    const movaSource = join(root, 'mova-app-server')
    await writeFile(codexSource, 'codex binary', 'utf8')
    await writeFile(movaSource, 'mova binary', 'utf8')
    await chmod(codexSource, 0o755)
    await chmod(movaSource, 0o755)

    const staged = stageDesktopAppServerBinaries(root, ['--platform=linux', '--arch=x64'], {
      MOVSCRIPT_CODEX_APP_SERVER_BIN: codexSource,
      MOVSCRIPT_MOVA_APP_SERVER_BIN: movaSource,
    })

    assert.deepEqual(staged.map((entry) => entry.provider), ['codex', 'mova'])
    assert.equal(await readFile(join(root, 'apps/frontend/vendor/app-server/codex/linux/x64/app-server'), 'utf8'), 'codex binary')
    assert.equal(await readFile(join(root, 'apps/frontend/vendor/app-server/mova/linux/x64/app-server'), 'utf8'), 'mova binary')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stageDesktopAppServerBinaries stages downloaded build dependency artifacts by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-stage-app-server-built-deps-'))
  try {
    const codexSource = join(root, 'release-binary-deps/linux-x64/codex/app-server')
    const movaSource = join(root, 'release-binary-deps/linux-x64/mova/app-server')
    await mkdir(join(root, 'release-binary-deps/linux-x64/codex'), { recursive: true })
    await mkdir(join(root, 'release-binary-deps/linux-x64/mova'), { recursive: true })
    await writeFile(codexSource, 'codex artifact', 'utf8')
    await writeFile(movaSource, 'mova artifact', 'utf8')

    const staged = stageDesktopAppServerBinaries(root, ['--platform=linux', '--arch=x64'], {})

    assert.deepEqual(staged.map((entry) => entry.source), [codexSource, movaSource])
    assert.equal(await readFile(join(root, 'apps/frontend/vendor/app-server/codex/linux/x64/app-server'), 'utf8'), 'codex artifact')
    assert.equal(await readFile(join(root, 'apps/frontend/vendor/app-server/mova/linux/x64/app-server'), 'utf8'), 'mova artifact')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('resolveAppServerSource reports checked provider candidates', () => {
  assert.throws(
    () => resolveAppServerSource('/repo', 'mova', 'linux', 'x64', {}),
    /Could not find mova app-server binary[\s\S]*mova\/codex-rs\/target\/debug\/codex-app-server/,
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnSyncReturns } from 'node:child_process'

import {
  createInstallingSdkRuntimePackageStoreLoader,
  ensureSdkRuntimePackageStore,
  installSdkRuntimePackage,
  installedSdkRuntimePackageVersion,
  resolveSdkRuntimePackageStorePaths,
  seedSdkRuntimePackageStore,
  uninstallSdkRuntimePackage,
} from './sdkRuntimePackageStore'
import {
  assertSdkRuntimePackageContract,
  probeSdkRuntimePackageContract,
} from './sdkRuntimePackageLoader'

test('SDK runtime package store resolves under explicit base directory', () => {
  const paths = resolveSdkRuntimePackageStorePaths({ baseDir: '/tmp/movscript-runtime-base', env: {} })

  assert.equal(paths.root, '/tmp/movscript-runtime-base/sdk-runtimes')
  assert.equal(paths.packageJsonPath, '/tmp/movscript-runtime-base/sdk-runtimes/package.json')
})

test('SDK runtime package store resolves under MovScript Home env when no explicit base is passed', () => {
  const paths = resolveSdkRuntimePackageStorePaths({ env: { MOVSCRIPT_HOME: '/tmp/movscript-home' } })

  assert.equal(paths.root, '/tmp/movscript-home/sdk-runtimes')
})

test('SDK runtime package store honors explicit runtime directory env override', () => {
  const paths = resolveSdkRuntimePackageStorePaths({
    baseDir: '/tmp/ignored',
    env: { MOVSCRIPT_SDK_RUNTIME_DIR: '/tmp/custom-runtime' },
  })

  assert.equal(paths.root, '/tmp/custom-runtime')
})

test('SDK runtime package store resolves bundled seed directory from env', () => {
  const paths = resolveSdkRuntimePackageStorePaths({
    baseDir: '/tmp/ignored',
    env: {
      MOVSCRIPT_SDK_RUNTIME_DIR: '/tmp/custom-runtime',
      MOVSCRIPT_SDK_RUNTIME_SEED_DIR: '/tmp/seed-runtime',
    },
  })

  assert.equal(paths.seedRoot, '/tmp/seed-runtime')
})

test('SDK runtime package store initializes an isolated package.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-store-'))
  try {
    const paths = ensureSdkRuntimePackageStore({ baseDir: tmp, env: {} })
    const manifest = JSON.parse(readFileSync(paths.packageJsonPath, 'utf8')) as { private?: boolean; name?: string }

    assert.equal(manifest.private, true)
    assert.equal(manifest.name, 'movscript-sdk-runtimes')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime package install uses npm prefix and normalized PATH against the runtime store', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-install-'))
  const calls: Array<{ command: string; args: string[]; cwd?: string; path?: string }> = []
  try {
    const result = installSdkRuntimePackage({
      baseDir: tmp,
      env: { PATH: '/custom/bin' },
      packageName: '@openai/codex-sdk',
      packageVersion: '1.2.3',
      spawn: (command, args, options) => {
        calls.push({
          command,
          args: args as string[],
          cwd: options?.cwd?.toString(),
          path: options?.env?.PATH?.toString(),
        })
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    assert.equal(result.ok, true)
    assert.equal(calls[0]?.command, 'npm')
    assert.deepEqual(calls[0]?.args, ['install', '--prefix', join(tmp, 'sdk-runtimes'), '--save-exact', '@openai/codex-sdk@1.2.3'])
    assert.equal(calls[0]?.cwd, join(tmp, 'sdk-runtimes'))
    assert.equal(calls[0]?.path?.endsWith('/custom/bin'), true)
    if (process.platform === 'darwin') assert.equal(calls[0]?.path?.includes('/opt/homebrew/bin'), true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime package uninstall uses npm prefix against the runtime store', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-uninstall-'))
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = []
  try {
    const result = uninstallSdkRuntimePackage({
      baseDir: tmp,
      env: {},
      packageName: '@movscript/mova-app-server',
      spawn: (command, args, options) => {
        calls.push({
          command,
          args: args as string[],
          cwd: options?.cwd?.toString(),
        })
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    assert.equal(result.ok, true)
    assert.equal(calls[0]?.command, 'npm')
    assert.deepEqual(calls[0]?.args, ['uninstall', '--prefix', join(tmp, 'sdk-runtimes'), '@movscript/mova-app-server'])
    assert.equal(calls[0]?.cwd, join(tmp, 'sdk-runtimes'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime installing loader installs missing packages before retrying resolution', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-loader-'))
  const packageDir = join(tmp, 'sdk-runtimes', 'node_modules', 'fake-sdk')
  const installCalls: string[][] = []
  let installed = false
  try {
    const loader = createInstallingSdkRuntimePackageStoreLoader({
      baseDir: tmp,
      env: {},
      packageVersions: { 'fake-sdk': '0.0.1' },
      spawn: (_command, _args, _options) => {
        installCalls.push(_args as string[])
        mkdirSync(packageDir, { recursive: true })
        writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'fake-sdk', version: '0.0.1', main: 'index.mjs' }))
        writeFileSync(join(packageDir, 'index.mjs'), 'export const ok = true\n')
        installed = true
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    const loaded = await loader('fake-sdk') as { ok?: boolean }
    assert.equal(installed, true)
    assert.deepEqual(installCalls[0], ['install', '--prefix', join(tmp, 'sdk-runtimes'), '--save-exact', 'fake-sdk@0.0.1'])
    assert.equal(installedSdkRuntimePackageVersion('fake-sdk', { baseDir: tmp, env: {} }), '0.0.1')
    assert.equal(loaded.ok, true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime installing loader seeds bundled packages before using npm', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-seeded-loader-'))
  const seed = join(tmp, 'seed')
  const packageDir = join(seed, 'node_modules', 'seeded-sdk')
  let installCount = 0
  try {
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(seed, 'package.json'), JSON.stringify({ private: true, name: 'seed' }))
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'seeded-sdk', version: '0.0.7', main: 'index.mjs' }))
    writeFileSync(join(packageDir, 'index.mjs'), 'export const version = "0.0.7"\n')
    const loader = createInstallingSdkRuntimePackageStoreLoader({
      baseDir: join(tmp, 'user-data'),
      env: {
        MOVSCRIPT_SDK_RUNTIME_SEED_DIR: seed,
      },
      packageVersions: { 'seeded-sdk': '0.0.7' },
      spawn: () => {
        installCount += 1
        return { status: 1, stdout: '', stderr: 'should not install', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    const loaded = await loader('seeded-sdk') as { version?: string }

    assert.equal(seedSdkRuntimePackageStore({
      baseDir: join(tmp, 'user-data'),
      env: { MOVSCRIPT_SDK_RUNTIME_SEED_DIR: seed },
    }), true)
    assert.equal(installedSdkRuntimePackageVersion('seeded-sdk', {
      baseDir: join(tmp, 'user-data'),
      env: { MOVSCRIPT_SDK_RUNTIME_SEED_DIR: seed },
    }), '0.0.7')
    assert.equal(loaded.version, '0.0.7')
    assert.equal(installCount, 0)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime installing loader deduplicates concurrent package installs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-dedup-install-'))
  const packageDir = join(tmp, 'sdk-runtimes', 'node_modules', 'dedup-sdk')
  let installCount = 0
  try {
    const loader = createInstallingSdkRuntimePackageStoreLoader({
      baseDir: tmp,
      env: {},
      spawn: (_command, _args, _options) => {
        installCount += 1
        mkdirSync(packageDir, { recursive: true })
        writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'dedup-sdk', version: '0.0.1', main: 'index.mjs' }))
        writeFileSync(join(packageDir, 'index.mjs'), 'export const ok = true\n')
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    const [first, second] = await Promise.all([
      loader('dedup-sdk') as Promise<{ ok?: boolean }>,
      loader('dedup-sdk') as Promise<{ ok?: boolean }>,
    ])

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.equal(installCount, 1)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime installing loader installs requested version when local package version differs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-version-upgrade-'))
  const packageDir = join(tmp, 'sdk-runtimes', 'node_modules', 'versioned-sdk')
  const installCalls: string[][] = []
  try {
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'versioned-sdk', version: '0.0.1', main: 'index.mjs' }))
    writeFileSync(join(packageDir, 'index.mjs'), 'export const version = "0.0.1"\n')
    const loader = createInstallingSdkRuntimePackageStoreLoader({
      baseDir: tmp,
      env: {},
      packageVersions: { 'versioned-sdk': '0.0.2' },
      spawn: (_command, _args, _options) => {
        installCalls.push(_args as string[])
        writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'versioned-sdk', version: '0.0.2', main: 'index.mjs' }))
        writeFileSync(join(packageDir, 'index.mjs'), 'export const version = "0.0.2"\n')
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [] } as SpawnSyncReturns<string>
      },
    })

    const loaded = await loader('versioned-sdk') as { version?: string }

    assert.deepEqual(installCalls[0], ['install', '--prefix', join(tmp, 'sdk-runtimes'), '--save-exact', 'versioned-sdk@0.0.2'])
    assert.equal(installedSdkRuntimePackageVersion('versioned-sdk', { baseDir: tmp, env: {} }), '0.0.2')
    assert.equal(loaded.version, '0.0.2')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime package store loads ESM-only packages with import-only exports', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-esm-only-'))
  const packageDir = join(tmp, 'sdk-runtimes', 'node_modules', 'esm-only-sdk')
  try {
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: 'esm-only-sdk',
      version: '0.0.1',
      type: 'module',
      exports: {
        '.': {
          import: './dist/index.js',
          types: './dist/index.d.ts',
        },
      },
    }))
    mkdirSync(join(packageDir, 'dist'), { recursive: true })
    writeFileSync(join(packageDir, 'dist', 'index.js'), 'export const Codex = class Codex {}\n')

    const loader = createInstallingSdkRuntimePackageStoreLoader({
      baseDir: tmp,
      env: {},
    })
    const loaded = await loader('esm-only-sdk') as { Codex?: unknown }

    assert.equal(typeof loaded.Codex, 'function')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('SDK runtime package contract probe validates required SDK exports', () => {
  const probe = probeSdkRuntimePackageContract('fake-sdk', { query: async function* query() {} }, ['query'])

  assert.equal(probe.ok, true)
  assert.deepEqual(probe.requiredExports, ['query'])
  assert.deepEqual(probe.missingExports, [])
})

test('SDK runtime package contract assertion reports missing SDK exports', () => {
  assert.throws(
    () => assertSdkRuntimePackageContract('@openai/codex-sdk', {}, ['Codex']),
    /@openai\/codex-sdk does not expose required SDK exports: Codex/,
  )
})

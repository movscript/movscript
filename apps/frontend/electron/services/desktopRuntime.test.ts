import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  formatDesktopRuntimePreflightFailure,
  prepareDesktopRuntimeDependencies,
} from './desktopRuntime'

test('desktop runtime preparation materializes movscript-server and movcli into workspace bin', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-desktop-runtime-'))
  const previousBackendBin = process.env.MOVSCRIPT_BACKEND_BIN
  const previousCliBinDir = process.env.MOVSCRIPT_CLI_BIN_DIR
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  try {
    delete process.env.MOVSCRIPT_BACKEND_BIN
    delete process.env.MOVSCRIPT_CLI_BIN_DIR
    delete process.env.MOVSCRIPT_HOME
    delete process.env.MOVSCRIPT_WORKSPACE_DIR

    const workspaceDir = join(root, 'workspace')
    const resourcesPath = join(root, 'resources')
    const serverSourceDir = join(resourcesPath, 'movscript-server', process.platform, process.arch)
    const cliPackageDir = join(resourcesPath, 'movcli')
    const cliBinDir = join(cliPackageDir, 'bin')
    mkdirSync(serverSourceDir, { recursive: true })
    mkdirSync(cliBinDir, { recursive: true })
    mkdirSync(join(cliPackageDir, 'dist'), { recursive: true })

    const serverBinary = process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'
    const sourceServer = join(serverSourceDir, serverBinary)
    writeFileSync(sourceServer, 'fake movscript server')
    writeFileSync(join(cliBinDir, 'movcli'), '#!/bin/sh\nexec node "$0.mjs" "$@"\n')
    writeFileSync(join(cliPackageDir, 'dist/index.cjs'), 'module.exports = {}\n')
    if (process.platform !== 'win32') {
      chmodSync(sourceServer, 0o755)
      chmodSync(join(cliBinDir, 'movcli'), 0o755)
    }

    const prepared = prepareDesktopRuntimeDependencies({
      workspaceDir,
      resourcesPath,
      requireMovScriptServer: true,
      requireMovcli: true,
    })

    const expectedBinDir = join(workspaceDir, 'bin')
    const expectedServer = join(expectedBinDir, serverBinary)
    assert.equal(prepared.preflight.ok, true)
    assert.equal(prepared.movscriptServerPath, expectedServer)
    assert.equal(prepared.movcliBinDir, expectedBinDir)
    assert.equal(process.env.MOVSCRIPT_BACKEND_BIN, expectedServer)
    assert.equal(process.env.MOVSCRIPT_CLI_BIN_DIR, expectedBinDir)
    assert.equal(process.env.MOVSCRIPT_HOME, workspaceDir)
    assert.equal(process.env.MOVSCRIPT_WORKSPACE_DIR, workspaceDir)
    assert.equal(readFileSync(expectedServer, 'utf8'), 'fake movscript server')
    assert.equal(existsSync(join(workspaceDir, 'config.toml')), true)
    assert.equal(existsSync(join(expectedBinDir, 'movcli')), true)
    assert.equal(existsSync(join(expectedBinDir, 'movcli.mjs')), true)
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_BIN', previousBackendBin)
    restoreEnv('MOVSCRIPT_CLI_BIN_DIR', previousCliBinDir)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_WORKSPACE_DIR', previousWorkspaceDir)
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop runtime preparation materializes movscript-server from MOVSCRIPT_BACKEND_BIN', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-desktop-runtime-env-'))
  const previousBackendBin = process.env.MOVSCRIPT_BACKEND_BIN
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  try {
    const workspaceDir = join(root, 'workspace')
    const sourceDir = join(root, 'source')
    mkdirSync(sourceDir, { recursive: true })

    const serverBinary = process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'
    const sourceServer = join(sourceDir, serverBinary)
    writeFileSync(sourceServer, 'env movscript server')
    if (process.platform !== 'win32') chmodSync(sourceServer, 0o755)

    process.env.MOVSCRIPT_BACKEND_BIN = sourceServer
    delete process.env.MOVSCRIPT_HOME
    delete process.env.MOVSCRIPT_WORKSPACE_DIR

    const prepared = prepareDesktopRuntimeDependencies({
      workspaceDir,
      requireMovScriptServer: true,
      requireMovcli: false,
    })

    const expectedServer = join(workspaceDir, 'bin', serverBinary)
    assert.equal(prepared.preflight.ok, true)
    assert.equal(prepared.movscriptServerPath, expectedServer)
    assert.equal(process.env.MOVSCRIPT_BACKEND_BIN, expectedServer)
    assert.equal(readFileSync(expectedServer, 'utf8'), 'env movscript server')
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_BIN', previousBackendBin)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_WORKSPACE_DIR', previousWorkspaceDir)
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop runtime preflight failure formatter lists fatal dependency paths', () => {
  const output = formatDesktopRuntimePreflightFailure({
    ok: false,
    fatalCount: 1,
    checks: [{
      id: 'runtime.movscriptServer',
      label: 'MovScript local backend',
      severity: 'fatal',
      status: 'missing',
      path: '/tmp/bin/movscript-server',
      message: 'file is missing',
    }],
  })

  assert.match(output, /MovScript local backend: file is missing/)
  assert.match(output, /\/tmp\/bin\/movscript-server/)
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

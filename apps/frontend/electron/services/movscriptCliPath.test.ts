import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, win32 as pathWin32 } from 'node:path'
import test from 'node:test'
import {
  ensureWorkspaceMovScriptCliBin,
  movScriptCliPathEnv,
  movScriptCliRuntimeEnv,
  prependPath,
  resolveMovScriptCliBinDir,
} from './movscriptCliPath'

const posixPathDelimiter = ':'

test('resolveMovScriptCliBinDir prefers explicit override', () => {
  const binDir = resolve('/tools/movcli/bin')
  assert.equal(resolveMovScriptCliBinDir({
    env: { MOVSCRIPT_CLI_BIN_DIR: binDir },
    platform: 'darwin',
    exists: (path) => path === resolve(binDir, 'movcli'),
  }), binDir)
})

test('resolveMovScriptCliBinDir uses movcli.cmd for Windows overrides', () => {
  const binDir = 'C:\\tools\\movcli\\bin'
  const resolvedBinDir = pathWin32.resolve(binDir)
  assert.equal(resolveMovScriptCliBinDir({
    env: { MOVSCRIPT_CLI_BIN_DIR: binDir },
    platform: 'win32',
    exists: (path) => path === pathWin32.join(resolvedBinDir, 'movcli.cmd'),
  }), resolvedBinDir)
})

test('resolveMovScriptCliBinDir uses packaged resources when available', () => {
  const resourcesPath = resolve('/Applications/Movscript.app/Contents/Resources')
  const binDir = resolve(resourcesPath, 'movcli/bin')
  assert.equal(resolveMovScriptCliBinDir({
    resourcesPath,
    platform: 'darwin',
    exists: (path) => path === resolve(binDir, 'movcli') || path === resolve(resourcesPath, 'movcli/dist/index.cjs'),
  }), binDir)
})

test('resolveMovScriptCliBinDir prefers workspace bin before packaged resources', () => {
  const workspaceDir = resolve('/Users/me/.movscript')
  const workspaceBinDir = resolve(workspaceDir, 'bin')
  const resourcesPath = resolve('/Applications/Movscript.app/Contents/Resources')
  const packagedBinDir = resolve(resourcesPath, 'movcli/bin')
  assert.equal(resolveMovScriptCliBinDir({
    workspaceDir,
    resourcesPath,
    platform: 'darwin',
    exists: (path) => path === resolve(workspaceBinDir, 'movcli') || path === resolve(packagedBinDir, 'movcli'),
  }), workspaceBinDir)
})

test('resolveMovScriptCliBinDir finds repository app cli bin in development', () => {
  const repo = resolve('/repo/movscript')
  const binDir = resolve(repo, 'apps/cli/bin')
  assert.equal(resolveMovScriptCliBinDir({
    cwd: resolve(repo, 'apps/frontend'),
    dirname: resolve(repo, 'apps/frontend/out/main'),
    platform: 'darwin',
    exists: (path) => path === resolve(binDir, 'movcli') || path === resolve(repo, 'apps/cli/dist/index.cjs'),
  }), binDir)
})

test('resolveMovScriptCliBinDir ignores unbuilt repository cli wrapper', () => {
  const repo = resolve('/repo/movscript')
  const binDir = resolve(repo, 'apps/cli/bin')
  assert.equal(resolveMovScriptCliBinDir({
    cwd: resolve(repo, 'apps/frontend'),
    dirname: resolve(repo, 'apps/frontend/out/main'),
    platform: 'darwin',
    exists: (path) => path === resolve(binDir, 'movcli'),
  }), undefined)
})

test('ensureWorkspaceMovScriptCliBin writes a workspace shim that points at packaged dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-cli-path-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const packageDir = join(root, 'resources', 'movcli')
    const sourceBinDir = join(packageDir, 'bin')
    mkdirSync(sourceBinDir, { recursive: true })
    mkdirSync(join(packageDir, 'dist'), { recursive: true })
    writeFileSync(join(sourceBinDir, 'movcli'), '#!/bin/sh\nexec node "$0.mjs" "$@"\n')
    chmodSync(join(sourceBinDir, 'movcli'), 0o755)
    writeFileSync(join(packageDir, 'dist/index.cjs'), 'module.exports = {}\n')

    const binDir = ensureWorkspaceMovScriptCliBin({
      workspaceDir,
      resourcesPath: join(root, 'resources'),
      platform: 'darwin',
    })

    assert.equal(binDir, join(workspaceDir, 'bin'))
    assert.equal(existsSync(join(binDir!, 'movcli')), true)
    assert.equal(existsSync(join(binDir!, 'movcli.mjs')), true)
    assert.match(readFileSync(join(binDir!, 'movcli.mjs'), 'utf8'), /dist\/index\.cjs/)
    assert.equal(resolveMovScriptCliBinDir({ workspaceDir, platform: 'darwin' }), binDir)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureWorkspaceMovScriptCliBin writes a Windows cmd shim', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-cli-path-win-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const packageDir = join(root, 'resources', 'movcli')
    const sourceBinDir = join(packageDir, 'bin')
    mkdirSync(sourceBinDir, { recursive: true })
    mkdirSync(join(packageDir, 'dist'), { recursive: true })
    writeFileSync(join(sourceBinDir, 'movcli'), '#!/bin/sh\nexec node "$0.mjs" "$@"\n')
    writeFileSync(join(packageDir, 'dist/index.cjs'), 'module.exports = {}\n')

    const binDir = ensureWorkspaceMovScriptCliBin({
      workspaceDir,
      resourcesPath: join(root, 'resources'),
      platform: 'win32',
    })

    assert.equal(binDir, join(workspaceDir, 'bin'))
    assert.equal(existsSync(join(binDir!, 'movcli.cmd')), true)
    assert.equal(existsSync(join(binDir!, 'movcli.mjs')), true)
    assert.match(readFileSync(join(binDir!, 'movcli.cmd'), 'utf8'), /MOVSCRIPT_ELECTRON_BIN/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('movScriptCliPathEnv prepends movcli bin to PATH', () => {
  const binDir = resolve('/repo/movscript/apps/cli/bin')
  const original = [resolve('/usr/bin'), binDir, resolve('/bin')].join(posixPathDelimiter)
  const env = movScriptCliPathEnv({
    cliBinDir: binDir,
    env: { PATH: original },
    platform: 'darwin',
  })

  assert.equal(env.MOVSCRIPT_CLI_BIN_DIR, binDir)
  assert.equal(env.PATH, [binDir, resolve('/usr/bin'), resolve('/bin')].join(posixPathDelimiter))
})

test('movScriptCliPathEnv preserves Windows Path casing and delimiter', () => {
  const binDir = 'C:\\Users\\me\\AppData\\Local\\Movscript\\Home\\bin'
  const env = movScriptCliPathEnv({
    cliBinDir: binDir,
    env: { Path: 'C:\\Windows;C:\\Tools' },
    platform: 'win32',
  })

  assert.equal(env.MOVSCRIPT_CLI_BIN_DIR, binDir)
  assert.equal(env.Path, `${binDir};C:\\Windows;C:\\Tools`)
  assert.equal(env.PATH, undefined)
})

test('movScriptCliRuntimeEnv uses node bin outside Electron', () => {
  const env = movScriptCliRuntimeEnv({ isElectronRuntime: false, isPackaged: false })

  assert.equal(env.MOVSCRIPT_NODE_BIN, process.execPath)
  assert.equal(env.MOVSCRIPT_ELECTRON_BIN, undefined)
})

test('movScriptCliRuntimeEnv uses Electron bin in Electron development runtime', () => {
  const env = movScriptCliRuntimeEnv({ isElectronRuntime: true, isPackaged: false })

  assert.equal(env.MOVSCRIPT_ELECTRON_BIN, process.execPath)
  assert.equal(env.MOVSCRIPT_NODE_BIN, undefined)
})

test('prependPath returns a single normalized leading entry', () => {
  const binDir = resolve('/repo/movscript/apps/cli/bin')
  assert.equal(prependPath(binDir, `${binDir}${posixPathDelimiter}/usr/bin`, 'darwin'), `${binDir}${posixPathDelimiter}/usr/bin`)
})

test('prependPath uses Windows delimiter and duplicate handling', () => {
  assert.equal(
    prependPath('C:\\repo\\bin', 'C:\\Windows;C:\\repo\\bin', 'win32'),
    'C:\\repo\\bin;C:\\Windows',
  )
})

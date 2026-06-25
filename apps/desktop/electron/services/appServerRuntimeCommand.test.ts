import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ensureAppServerRuntimePackageInstalled,
  parseAppServerExecutableCommand,
  resolveAppServerCommand,
  type AppServerCommandResolverInput,
} from './appServerRuntimeCommand'

test('app-server command resolver uses explicit handler overrides', () => {
  const command = resolveAppServerCommand(input(), {
    appServerCommandResolver: (resolverInput) => {
      assert.equal(resolverInput.api, 'codex-app-server')
      return {
        command: 'custom-app-server',
        args: ['--stdio'],
        resolvedFrom: 'test override',
      }
    },
  })

  assert.deepEqual(command, {
    command: 'custom-app-server',
    args: ['--stdio'],
    resolvedFrom: 'test override',
  })
})

test('app-server command resolver parses runtime executable commands', () => {
  const command = resolveAppServerCommand(input({
    executableCommand: 'codex-app-server --flag "two words" \'single quoted\' escaped\\ space',
  }))

  assert.deepEqual(command, {
    command: 'codex-app-server',
    args: ['--flag', 'two words', 'single quoted', 'escaped space'],
    resolvedFrom: 'codex-app-server --flag "two words" \'single quoted\' escaped\\ space',
  })
})

test('app-server command parser preserves Windows executable paths', () => {
  const command = parseAppServerExecutableCommand('"C:\\Program Files\\Movscript\\codex-app-server.exe" --listen stdio://', 'win32')

  assert.deepEqual(command, {
    command: 'C:\\Program Files\\Movscript\\codex-app-server.exe',
    args: ['--listen', 'stdio://'],
    resolvedFrom: '"C:\\Program Files\\Movscript\\codex-app-server.exe" --listen stdio://',
  })
})

test('app-server command resolver accepts Windows command syntax without path validation', () => {
  const command = resolveAppServerCommand(input({
    executableCommand: 'codex-app-server.exe --stdio',
  }), {
    platform: 'win32',
  })

  assert.deepEqual(command, {
    command: 'codex-app-server.exe',
    args: ['--stdio'],
    resolvedFrom: 'codex-app-server.exe --stdio',
  })
})

test('app-server command resolver reads configured environment variable names', () => {
  const envVar = 'MOVSCRIPT_TEST_APP_SERVER_COMMAND'
  const previous = process.env[envVar]
  process.env[envVar] = 'mova-app-server --stdio'
  try {
    const command = resolveAppServerCommand(input({
      api: 'mova-app-server',
      kind: 'mova',
      executableEnvVar: envVar,
    }))

    assert.deepEqual(command, {
      command: 'mova-app-server',
      args: ['--stdio'],
      resolvedFrom: 'mova-app-server --stdio',
    })
  } finally {
    if (previous === undefined) {
      delete process.env[envVar]
    } else {
      process.env[envVar] = previous
    }
  }
})

test('app-server command resolver falls back to backend default environment variables', () => {
  const envVar = 'MOVSCRIPT_CODEX_APP_SERVER'
  const previous = process.env[envVar]
  process.env[envVar] = 'codex-app-server --default-env'
  try {
    const command = resolveAppServerCommand(input())

    assert.deepEqual(command, {
      command: 'codex-app-server',
      args: ['--default-env'],
      resolvedFrom: 'codex-app-server --default-env',
    })
  } finally {
    if (previous === undefined) {
      delete process.env[envVar]
    } else {
      process.env[envVar] = previous
    }
  }
})

test('app-server runtime package installer writes into SDK runtime store when missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-runtime-'))
  const targetTriple = process.platform === 'darwin' && process.arch === 'arm64'
    ? 'aarch64-apple-darwin'
    : process.platform === 'darwin' && process.arch === 'x64'
      ? 'x86_64-apple-darwin'
      : process.platform === 'linux' && process.arch === 'arm64'
        ? 'aarch64-unknown-linux-musl'
        : process.platform === 'linux' && process.arch === 'x64'
          ? 'x86_64-unknown-linux-musl'
          : process.platform === 'win32' && process.arch === 'arm64'
            ? 'aarch64-pc-windows-msvc'
            : process.platform === 'win32' && process.arch === 'x64'
              ? 'x86_64-pc-windows-msvc'
              : undefined
  if (!targetTriple) return
  const platformPackageName = process.platform === 'darwin' && process.arch === 'arm64'
    ? '@movscript/mova-app-server-darwin-arm64'
    : process.platform === 'darwin' && process.arch === 'x64'
      ? '@movscript/mova-app-server-darwin-x64'
      : process.platform === 'linux' && process.arch === 'arm64'
        ? '@movscript/mova-app-server-linux-arm64'
        : process.platform === 'linux' && process.arch === 'x64'
          ? '@movscript/mova-app-server-linux-x64'
          : process.platform === 'win32' && process.arch === 'arm64'
            ? '@movscript/mova-app-server-win32-arm64'
            : '@movscript/mova-app-server-win32-x64'
  const binaryPath = join(root, 'node_modules', ...platformPackageName.split('/'), 'vendor', targetTriple, 'bin', process.platform === 'win32' ? 'codex-app-server.exe' : 'codex-app-server')

  const result = await ensureAppServerRuntimePackageInstalled(input({
    binaryPackageName: '@movscript/mova-app-server',
  }), {
    env: {
      MOVSCRIPT_SDK_RUNTIME_DIR: root,
    },
    spawn: ((_command, _args) => {
      mkdirSync(join(binaryPath, '..'), { recursive: true })
      writeFileSync(binaryPath, '')
      chmodSync(binaryPath, 0o755)
      return {
        status: 0,
        signal: null,
        output: [],
        stdout: '',
        stderr: '',
        pid: 0,
      }
    }) as never,
  })

  assert.equal(result?.ok, true)
  assert.equal(result?.packageName, '@movscript/mova-app-server')
})

function input(overrides: {
  api?: AppServerCommandResolverInput['api']
  kind?: AppServerCommandResolverInput['kind']
  executableCommand?: string
  executableEnvVar?: string
  binaryPackageName?: string
} = {}): AppServerCommandResolverInput {
  const api = overrides.api ?? 'codex-app-server'
  const kind = overrides.kind ?? 'codex'
  return {
    api,
    kind,
    provider: {
      id: kind,
      kind,
    } as never,
    runtime: {
      id: api,
      api,
      label: `${kind} App Server`,
      ...(overrides.executableCommand ? { executableCommand: overrides.executableCommand } : {}),
      ...(overrides.executableEnvVar ? { executableEnvVar: overrides.executableEnvVar } : {}),
      ...(overrides.binaryPackageName ? { binaryPackageName: overrides.binaryPackageName } : {}),
    } as never,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
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

function input(overrides: {
  api?: AppServerCommandResolverInput['api']
  kind?: AppServerCommandResolverInput['kind']
  executableCommand?: string
  executableEnvVar?: string
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
    } as never,
  }
}

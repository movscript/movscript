import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  describeAppServerRuntime,
  probeAppServerRuntime,
} from './appServerRuntimeReadiness'

test('app-server readiness describe returns backend contract and resolved command', () => {
  const response = describeAppServerRuntime('codex-app-server', params(), {
    appServerCommandResolver: () => ({
      command: 'codex-app-server',
      args: ['--stdio'],
      resolvedFrom: 'test command',
    }),
  })

  assert.equal(response.runtime.id, 'codex-codex-app-server')
  assert.equal(response.contract.transport, 'app-server')
  assert.equal(response.contract.support.capabilities.tools.supported, true)
  assert.equal(response.contract.support.thread.stream.level, 'supported')
  assert.equal(response.sdk?.packageName, 'test command')
  assert.equal(response.sdk?.resolvedFrom, 'codex-app-server')
})

test('app-server readiness probe reports command and credentials checks', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-app-server-readiness-'))
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-api-key'
  try {
    const response = probeAppServerRuntime('codex-app-server', params(), {
      defaultWorkspaceDir: () => workspaceDir,
      appServerCommandResolver: () => ({
        command: 'codex-app-server',
        resolvedFrom: 'test command',
      }),
    })

    assert.equal(response.ok, true)
    assert.equal(response.checks.packageLoad.ok, true)
    assert.equal(response.checks.credentials.ok, true)
    assert.equal(response.credentials.source, 'movscript-local-data-service')
    assert.equal(response.sdk.packageName, 'test command')
  } finally {
    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = previousKey
    }
    rmSync(workspaceDir, { recursive: true, force: true })
  }
})

function params() {
  return {
    provider: {
      id: 'readiness-test-provider',
      kind: 'readiness-test-provider',
    },
    runtime: {
      id: 'codex-codex-app-server',
      api: 'codex-app-server',
      label: 'Codex App Server',
      packageVersion: '0.1.0-test',
    },
  } as never
}

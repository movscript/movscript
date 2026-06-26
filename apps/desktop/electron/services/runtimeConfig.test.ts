import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { providerRuntimeEnvSnapshot } from './providerRuntimeEnv'

test('Electron runtime config exposes only provider runtime environment overrides', () => {
  const previousCodexRuntime = process.env.MOVSCRIPT_CODEX_RUNTIME_API
  const previousCodexSdkPackage = process.env.MOVSCRIPT_CODEX_SDK_PACKAGE
  const previousDefaultProvider = process.env.MOVSCRIPT_DEFAULT_PROVIDER
  const previousUnrelatedSecret = process.env.MOVSCRIPT_UNRELATED_SECRET
  try {
    process.env.MOVSCRIPT_CODEX_RUNTIME_API = ' codex-sdk '
    process.env.MOVSCRIPT_CODEX_SDK_PACKAGE = '@example/codex-sdk'
    process.env.MOVSCRIPT_DEFAULT_PROVIDER = ' codex '
    process.env.MOVSCRIPT_UNRELATED_SECRET = 'do-not-leak'

    const env = providerRuntimeEnvSnapshot(process.env)

    assert.deepEqual(env, {
      MOVSCRIPT_CODEX_RUNTIME_API: 'codex-sdk',
      MOVSCRIPT_CODEX_SDK_PACKAGE: '@example/codex-sdk',
      MOVSCRIPT_DEFAULT_PROVIDER: 'codex',
    })
  } finally {
    restoreEnv('MOVSCRIPT_CODEX_RUNTIME_API', previousCodexRuntime)
    restoreEnv('MOVSCRIPT_CODEX_SDK_PACKAGE', previousCodexSdkPackage)
    restoreEnv('MOVSCRIPT_DEFAULT_PROVIDER', previousDefaultProvider)
    restoreEnv('MOVSCRIPT_UNRELATED_SECRET', previousUnrelatedSecret)
  }
})

test('Electron runtime config exposes Canvas Service endpoint discovery contract', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.match(source, /CANVAS_SERVICE_NAME = 'movscript\.canvas\.service'/)
  assert.match(source, /canvasServiceBaseURL/)
  assert.match(source, /const canvasServiceV1BaseURL = gatewayBaseURL/)
  assert.match(source, /`\$\{gatewayBaseURL\}\/local-api`/)
  assert.match(source, /`\$\{canvasServiceBaseURL\}\/v1`/)
  assert.match(source, /MOVSCRIPT_CANVAS_SERVICE_URL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, CANVAS_SERVICE_NAME\)/)
})

test('Electron runtime config exposes Project Service endpoint discovery contract', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.match(source, /PROJECT_SERVICE_NAME = 'movscript\.project\.service'/)
  assert.match(source, /projectServiceBaseURL/)
  assert.match(source, /MOVSCRIPT_PROJECT_SERVICE_URL/)
  assert.match(source, /MOVSCRIPT_PROJECT_SERVICE_BASE_URL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, PROJECT_SERVICE_NAME\)/)
})

test('Electron runtime config prefers daemon gateway endpoint for local launch mode', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.match(source, /LOCAL_NODE_GATEWAY_SERVICE = 'movscript\.local-node\.gateway'/)
  assert.match(source, /gatewayBaseURL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, LOCAL_NODE_GATEWAY_SERVICE\)/)
  assert.match(source, /input\.shouldPreferLocalBackend && input\.gatewayBaseURL/)
  assert.match(source, /DATA_SERVICE_NAME = 'movscript\.data\.service'/)
  assert.match(source, /dataServiceBaseURL/)
  assert.match(source, /MOVSCRIPT_DATA_SERVICE_URL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, DATA_SERVICE_NAME\)/)
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

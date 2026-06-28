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

test('Electron runtime config does not expose Canvas Service endpoint discovery to renderer', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.doesNotMatch(source, /CANVAS_SERVICE_NAME = 'movscript\.canvas\.service'/)
  assert.doesNotMatch(source, /canvasServiceBaseURL/)
  assert.doesNotMatch(source, /canvasServiceV1BaseURL/)
  assert.doesNotMatch(source, /`\$\{gatewayBaseURL\}\/local-api`/)
  assert.doesNotMatch(source, /`\$\{canvasServiceBaseURL\}\/v1`/)
  assert.doesNotMatch(source, /MOVSCRIPT_CANVAS_SERVICE_URL/)
  assert.doesNotMatch(source, /findRuntimeEndpoint\(snapshot, CANVAS_SERVICE_NAME\)/)
})

test('Electron runtime config does not expose Project Service endpoint discovery to renderer', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.doesNotMatch(source, /PROJECT_SERVICE_NAME = 'movscript\.project\.service'/)
  assert.doesNotMatch(source, /projectServiceBaseURL/)
  assert.doesNotMatch(source, /MOVSCRIPT_PROJECT_SERVICE_URL/)
  assert.doesNotMatch(source, /MOVSCRIPT_PROJECT_SERVICE_BASE_URL/)
  assert.doesNotMatch(source, /findRuntimeEndpoint\(snapshot, PROJECT_SERVICE_NAME\)/)
})

test('Electron runtime config prefers daemon gateway endpoint and keeps data service discovery internal', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'runtimeConfig.ts'), 'utf8')

  assert.match(source, /LOCAL_NODE_GATEWAY_SERVICE = 'movscript\.local-node\.gateway'/)
  assert.match(source, /gatewayBaseURL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, LOCAL_NODE_GATEWAY_SERVICE\)/)
  assert.match(source, /function resolveRendererAPIGatewayBaseURL/, 'renderer API base must be a daemon gateway resolver')
  assert.match(source, /if \(input\.gatewayBaseURL\) \{[\s\S]*?return normalizeDataServiceRootBaseURL\(input\.gatewayBaseURL\)/, 'renderer API base must prefer daemon gateway for every data plane')
  assert.match(source, /DATA_SERVICE_NAME = 'movscript\.data\.service'/)
  assert.match(source, /dataServiceBaseURL/)
  assert.match(source, /MOVSCRIPT_DATA_SERVICE_URL/)
  assert.match(source, /findRuntimeEndpoint\(snapshot, DATA_SERVICE_NAME\)/)
  assert.doesNotMatch(source, /\.\.\.\(dataServiceBaseURL \? \{ dataServiceBaseURL \} : \{\}\)/)
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

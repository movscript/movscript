import assert from 'node:assert/strict'
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
